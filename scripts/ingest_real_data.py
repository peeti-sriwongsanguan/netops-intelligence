"""
scripts/ingest_real_data.py
----------------------------
Ingests real production data from daily monitoring logs into PostgreSQL.

Parses:
  - SGVE-usage.csv        → devices + network traffic telemetry
  - ipsec_monitor_results → alerts for tunnel failures
  - prometheus_metrics    → service health + scan records

Run: python scripts/ingest_real_data.py --log-dir data/opt/admin/monitoring/logs/20260521_095546
"""
import sys
import os
import csv
import re
import argparse
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app, db
from app.models.device import Device
from app.models.alert import Alert, NetworkScan
from app.models.vulnerability import Vulnerability

app = create_app("development")

# ── Site name → location mapping from your real data ─────────────────────────
SITE_MAP = {
    "aurora":        ("aurora",        "AUR", "CO"),
    "wjordan":       ("wjordan",       "WJR", "UT"),
    "plymouthmtg":   ("plymouthmtg",   "PLY", "MI"),
    "wilmington":    ("wilmington",    "WMT", "DE"),
    "alpharetta":    ("alpharetta",    "ALP", "GA"),
    "birmingham":    ("birmingham",    "BRM", "AL"),
    "lasvegas":      ("lasvegas",      "NLV", "NV"),
    "tempe":         ("tempe",         "TEM", "AZ"),
    "columbus":      ("columbus",      "CLM", "OH"),
    "duff":          ("duff",          "DUF", "IL"),
    "euless":        ("euless",        "EUL", "TX"),
    "schertz":       ("schertz",       "SCH", "TX"),
    "hillsboro":     ("hillsboro",     "HLB", "OR"),
    "redmondridge":  ("redmondridge",  "RDM", "WA"),
    "bloomington":   ("bloomington",   "BLT", "MN"),
    "omaha":         ("omaha",         "OMA", "NE"),
    "houston":       ("houston",       "HSN", "TX"),
    "batonrouge":    ("batonrouge",    "BTR", "LA"),
    "richmond":      ("richmond",      "RON", "VA"),
}


# ── PARSER 1: SGVE Usage CSV ─────────────────────────────────────────────────
def ingest_sgve_usage(filepath):
    print(f"\n📡  Parsing SGVE usage: {filepath}")
    created = 0
    alerts_created = 0

    with open(filepath, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            server = row.get("Server", "").strip().lower()

            # Skip ICSR (redundancy heartbeat rows)
            if server.endswith("_icsr"):
                continue

            site_info = SITE_MAP.get(server)
            if not site_info:
                print(f"   ⚠  Unknown site: {server} — skipping")
                continue

            site_name, site_code, state = site_info
            mdn = int(row.get("#MDN", 0) or 0)
            inbound = float(row.get("Inbound", 0) or 0)
            outbound = float(row.get("Outbound", 0) or 0)
            total = float(row.get("Total", 0) or 0)
            avg_usage = float(row.get("AvgUsagePerMDN", 0) or 0)
            steering = float(row.get("SteeringRatio", 0) or 0)

            # Build hostname from real naming convention
            hostname = f"{site_code}-SGVE-SUBMP"

            existing = Device.query.filter_by(hostname=hostname).first()
            if existing:
                # Update telemetry fields
                existing.last_seen = datetime.utcnow()
                existing.status = _derive_status(steering, mdn)
                device = existing
            else:
                device = Device(
                    hostname=hostname,
                    ip_address=_fake_ip(site_code),   # replace with real IPs
                    device_type="load_balancer",
                    vendor="VZW",
                    model="SGVE-SUBMP",
                    os_version="Ansible 2.9.27",
                    location=f"{site_name.title()}, {state}",
                    rack=site_code,
                    status=_derive_status(steering, mdn),
                    environment="production",
                    last_seen=datetime.utcnow(),
                )
                db.session.add(device)
                db.session.flush()
                created += 1

            # ── Fire alerts for anomalies ─────────────────────────────────
            # Low steering ratio = traffic not being steered correctly
            if steering < 0.95 and steering > 0:
                alert = Alert(
                    device_id=device.id,
                    alert_type="steering_ratio_low",
                    severity="high" if steering < 0.90 else "medium",
                    message=(
                        f"Steering ratio {steering:.3f} below threshold 0.95 "
                        f"at {site_name} — {mdn:,} MDNs affected"
                    ),
                    status="open",
                    created_at=datetime.utcnow(),
                )
                db.session.add(alert)
                alerts_created += 1

            # Houston has 3 nodes — flag load imbalance
            if server == "houston" and mdn > 0:
                if avg_usage < 0.5:
                    alert = Alert(
                        device_id=device.id,
                        alert_type="load_imbalance",
                        severity="medium",
                        message=(
                            f"Houston node avg usage {avg_usage:.3f} GB/MDN — "
                            f"possible load imbalance across 3 nodes"
                        ),
                        status="open",
                        created_at=datetime.utcnow(),
                    )
                    db.session.add(alert)
                    alerts_created += 1

            # Low traffic vs MDN count = degraded node
            if mdn > 1000 and total < 1000:
                alert = Alert(
                    device_id=device.id,
                    alert_type="low_traffic",
                    severity="high",
                    message=(
                        f"{site_name} has {mdn:,} MDNs but only "
                        f"{total:.1f} GB traffic — node may be degraded"
                    ),
                    status="open",
                    created_at=datetime.utcnow(),
                )
                db.session.add(alert)
                alerts_created += 1

    db.session.commit()
    print(f"   ✓  {created} devices created, {alerts_created} alerts fired")


def _derive_status(steering_ratio, mdn):
    if mdn == 0:
        return "offline"
    if steering_ratio < 0.90:
        return "degraded"
    return "online"


def _fake_ip(site_code):
    """Placeholder — replace with real IP lookup from your CMDB."""
    codes = list(SITE_MAP.values())
    idx = next((i for i, s in enumerate(codes) if s[1] == site_code), 0)
    return f"10.{idx // 256}.{idx % 256}.1"


# ── PARSER 2: IPSec Monitor ───────────────────────────────────────────────────
def ingest_ipsec(filepath):
    print(f"\n🔒  Parsing IPSec monitor: {filepath}")
    alerts_created = 0
    devices_updated = 0

    with open(filepath) as f:
        lines = f.readlines()

    for line in lines:
        line = line.strip()
        if not line.startswith("|") or "SMP/CM" in line:
            continue

        parts = [p.strip() for p in line.split("|") if p.strip()]
        if len(parts) < 7:
            continue

        hostname   = parts[0]
        cm1_status = parts[1]   # CMGR-001 CS
        cm2_status = parts[2]   # CMGR-002 CS
        cm3_status = parts[3]   # CMGR-001 SL
        cm4_status = parts[4]   # CMGR-002 SL
        ping_sf    = parts[5]   # e.g. "4/0" or "3/1"
        traffic_sf = parts[6]   # e.g. "4/0" or "2/2"

        ping_fail    = _parse_failures(ping_sf)
        traffic_fail = _parse_failures(traffic_sf)

        if ping_fail == 0 and traffic_fail == 0:
            continue   # healthy — skip

        # Upsert device
        device = Device.query.filter_by(hostname=hostname).first()
        if not device:
            device = Device(
                hostname=hostname,
                ip_address="0.0.0.0",   # replace with real IP
                device_type="router",
                vendor="VZW",
                model="SUBMP",
                os_version="IPSec",
                location=_location_from_hostname(hostname),
                status="degraded" if traffic_fail > 0 else "online",
                environment="production",
                last_seen=datetime.utcnow(),
            )
            db.session.add(device)
            db.session.flush()
            devices_updated += 1

        # Traffic failure = real alert
        if traffic_fail > 0:
            severity = "critical" if traffic_fail >= 2 else "high"
            alert = Alert(
                device_id=device.id,
                alert_type="ipsec_tunnel_failure",
                severity=severity,
                message=(
                    f"IPSec traffic failure on {hostname}: "
                    f"{traffic_sf} (S/F) — "
                    f"CM status: CS1={cm1_status} CS2={cm2_status} "
                    f"SL1={cm3_status} SL2={cm4_status}"
                ),
                status="open",
                created_at=datetime.utcnow(),
            )
            db.session.add(alert)
            alerts_created += 1

        # Ping failure = medium alert
        if ping_fail > 0 and traffic_fail == 0:
            alert = Alert(
                device_id=device.id,
                alert_type="ipsec_ping_failure",
                severity="medium",
                message=(
                    f"IPSec ping degraded on {hostname}: "
                    f"{ping_sf} (S/F) — traffic still flowing"
                ),
                status="open",
                created_at=datetime.utcnow(),
            )
            db.session.add(alert)
            alerts_created += 1

    db.session.commit()
    print(f"   ✓  {devices_updated} devices added, {alerts_created} IPSec alerts fired")


def _parse_failures(sf_string):
    """Parse '3/1' → 1 failure, '4/0' → 0 failures."""
    try:
        parts = sf_string.strip().split("/")
        return int(parts[1]) if len(parts) == 2 else 0
    except (ValueError, IndexError):
        return 0


def _location_from_hostname(hostname):
    """
    AURSCOTYVZWVSAS-Y-AT-SECAS-01-SUBMP-001
    First 3 chars = site code
    """
    code = hostname[:3].upper()
    for site, (name, sc, state) in SITE_MAP.items():
        if sc == code:
            return f"{name.title()}, {state}"
    return "Unknown"


# ── PARSER 3: Prometheus Metrics ──────────────────────────────────────────────
def ingest_prometheus(filepath, region="CS"):
    print(f"\n📊  Parsing Prometheus metrics [{region}]: {filepath}")
    scans_created = 0
    nodes_seen = set()

    with open(filepath) as f:
        lines = f.readlines()

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        # Extract sm_node value
        node_match = re.search(r'sm_node=([^,\]]+)', line)
        if not node_match:
            continue

        node = node_match.group(1).strip()
        if node in nodes_seen:
            continue
        nodes_seen.add(node)

        # Upsert device for this k8s worker node
        device = Device.query.filter_by(hostname=node).first()
        if not device:
            device = Device(
                hostname=node,
                ip_address="0.0.0.0",
                device_type="server",
                vendor="VZW",
                model="k8s-worker",
                os_version="secure-management",
                location=f"Region {region}",
                environment="production",
                status="online",
                last_seen=datetime.utcnow(),
            )
            db.session.add(device)
            db.session.flush()

        # Extract microservice name for scan record
        ms_match = re.search(r'sm_microservice=([^,\]]+)', line)
        microservice = ms_match.group(1) if ms_match else "unknown"

        # Extract status code
        status_match = re.search(r'status=(\d+)', line)
        status_code = int(status_match.group(1)) if status_match else 200

        # Record as a config_audit scan
        scan = NetworkScan(
            device_id=device.id,
            scan_type="config_audit",
            triggered_by="prometheus",
            status="completed",
            findings_count=0 if status_code == 200 else 1,
            raw_output=(
                f"microservice={microservice} "
                f"status={status_code} region={region}"
            ),
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
            created_at=datetime.utcnow(),
        )
        db.session.add(scan)
        scans_created += 1

    db.session.commit()
    print(f"   ✓  {len(nodes_seen)} k8s nodes registered, {scans_created} scan records created")


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Ingest real production monitoring data")
    parser.add_argument(
        "--log-dir",
        default=None,
        help="Path to the daily log directory. If empty, finds the newest folder."
    )
    args = parser.parse_args()

    # 1. Base log directory (should match your .env or hardcoded path)
    BASE_LOG_DIR = r"D:\DRIVE\data\sec\opt\admin\monitoring\logs"

    # 2. Auto-detect the newest folder if no argument is provided
    if args.log_dir:
        log_dir = args.log_dir
    else:
        # Get all subdirectories
        subfolders = [os.path.join(BASE_LOG_DIR, d) for d in os.listdir(BASE_LOG_DIR)
                      if os.path.isdir(os.path.join(BASE_LOG_DIR, d))]

        if not subfolders:
            print(f"❌ No log directories found in {BASE_LOG_DIR}")
            return

        # Find the most recently created/modified folder
        log_dir = max(subfolders, key=os.path.getmtime)

    print(f"🚀 Ingesting from newest directory: {log_dir}")

    with app.app_context():
        db.create_all()

        # Find files dynamically
        files = os.listdir(log_dir)

        sgve_file = next((os.path.join(log_dir, f) for f in files if "SGVE-usage" in f), None)
        ipsec_file = next((os.path.join(log_dir, f) for f in files if "ipsec_monitor" in f), None)
        prom_cs = next((os.path.join(log_dir, f) for f in files if "prometheus_metrics_CS" in f), None)
        prom_sl = next((os.path.join(log_dir, f) for f in files if "prometheus_metrics_SL" in f), None)

        if sgve_file:
            ingest_sgve_usage(sgve_file)
        else:
            print("⚠ SGVE usage file not found")

        if ipsec_file:
            ingest_ipsec(ipsec_file)
        else:
            print("⚠ IPSec monitor file not found")

        if prom_cs: ingest_prometheus(prom_cs, region="CS")
        if prom_sl: ingest_prometheus(prom_sl, region="SL")

        print(f"\n{'─' * 50}")
        print(f"✅ Ingest complete!")
        print(f"{'─' * 50}")


if __name__ == "__main__":
    main()

if __name__ == "__main__":
    main()
