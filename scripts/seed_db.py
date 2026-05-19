"""
scripts/seed_db.py
------------------
Populates the database with realistic dummy data for development.
Run: python scripts/seed_db.py
"""
import sys
import os
import random
from datetime import datetime, timedelta

# Make sure the project root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app, db
from app.models.device import Device
from app.models.vulnerability import Vulnerability
from app.models.alert import Alert, NetworkScan

app = create_app("development")

# ───────────────────────── seed data pools ──────────────────────────────────
DEVICE_POOL = [
    # (hostname, ip, type, vendor, model, os_version, location, rack)
    ("core-rtr-01", "10.0.0.1",  "router",   "Cisco",    "ASR-9001",     "IOS-XR 7.5.2",  "DC-East", "R01-A1"),
    ("core-rtr-02", "10.0.0.2",  "router",   "Cisco",    "ASR-9001",     "IOS-XR 7.5.2",  "DC-East", "R01-A2"),
    ("edge-rtr-01", "10.0.1.1",  "router",   "Juniper",  "MX480",        "Junos 22.4R1",  "DC-West", "R02-B1"),
    ("edge-rtr-02", "10.0.1.2",  "router",   "Juniper",  "MX480",        "Junos 22.4R1",  "DC-West", "R02-B2"),
    ("dist-sw-01",  "10.1.0.1",  "switch",   "Cisco",    "Catalyst-9300","IOS-XE 17.9.3", "DC-East", "R01-C1"),
    ("dist-sw-02",  "10.1.0.2",  "switch",   "Cisco",    "Catalyst-9300","IOS-XE 17.9.3", "DC-East", "R01-C2"),
    ("acc-sw-01",   "10.1.1.1",  "switch",   "Arista",   "7050X3",       "EOS 4.29.2F",   "Floor-1", "F1-A1"),
    ("acc-sw-02",   "10.1.1.2",  "switch",   "Arista",   "7050X3",       "EOS 4.29.2F",   "Floor-2", "F2-A1"),
    ("fw-01",       "10.2.0.1",  "firewall", "Palo Alto","PA-5250",      "PAN-OS 10.2.4", "DC-East", "R01-D1"),
    ("fw-02",       "10.2.0.2",  "firewall", "Palo Alto","PA-5250",      "PAN-OS 10.2.4", "DC-West", "R02-D1"),
    ("fw-03",       "10.2.0.3",  "firewall", "Fortinet", "FG-600F",      "FortiOS 7.4.1", "DC-West", "R02-D2"),
    ("lb-01",       "10.3.0.1",  "load_balancer","F5",   "BIG-IP i2600", "TMOS 16.1.3",   "DC-East", "R01-E1"),
    ("lb-02",       "10.3.0.2",  "load_balancer","F5",   "BIG-IP i2600", "TMOS 16.1.3",   "DC-West", "R02-E1"),
    ("web-srv-01",  "10.4.0.1",  "server",   "Dell",     "PowerEdge R750","Ubuntu 22.04", "DC-East", "R01-F1"),
    ("web-srv-02",  "10.4.0.2",  "server",   "Dell",     "PowerEdge R750","Ubuntu 22.04", "DC-East", "R01-F2"),
    ("db-srv-01",   "10.4.1.1",  "server",   "HPE",      "ProLiant DL380","RHEL 9.2",     "DC-East", "R01-G1"),
    ("db-srv-02",   "10.4.1.2",  "server",   "HPE",      "ProLiant DL380","RHEL 9.2",     "DC-West", "R02-G1"),
    ("mgmt-srv-01", "10.5.0.1",  "server",   "Dell",     "PowerEdge R450","Ubuntu 20.04", "DC-East", "R01-H1"),
    ("vpn-gw-01",   "10.6.0.1",  "router",   "Cisco",    "ISR-4451",     "IOS-XE 17.6.5", "DC-East", "R01-I1"),
    ("ids-01",      "10.7.0.1",  "ids_ips",  "Snort",    "Virtual",      "Snort 3.1.50",  "DC-East", "VIRT"),
]

VULN_POOL = [
    ("CVE-2024-20356", "Cisco IOS XE Privilege Escalation",     "critical", 9.8, "IOS-XE",   True),
    ("CVE-2023-46805", "Ivanti Connect Secure Auth Bypass",      "critical", 8.2, "SSL-VPN",  True),
    ("CVE-2024-3400",  "PAN-OS Command Injection",               "critical", 10.0,"PAN-OS",   True),
    ("CVE-2023-34048", "VMware vCenter RCE",                     "critical", 9.8, "vCenter",  True),
    ("CVE-2024-21762", "FortiOS Out-of-Bound Write",             "critical", 9.6, "FortiOS",  True),
    ("CVE-2023-44487", "HTTP/2 Rapid Reset DoS",                 "high",     7.5, "HTTP/2",   True),
    ("CVE-2024-23897", "Jenkins Arbitrary File Read",            "high",     9.8, "Jenkins",  True),
    ("CVE-2023-48788", "Fortinet EMS SQL Injection",             "high",     9.3, "FortiClientEMS", True),
    ("CVE-2024-1709",  "ConnectWise ScreenConnect Auth Bypass",  "high",     10.0,"ScreenConnect", True),
    ("CVE-2023-22527", "Confluence RCE Template Injection",      "high",     10.0,"Confluence",True),
    ("CVE-2024-27198", "JetBrains TeamCity Auth Bypass",         "high",     9.8, "TeamCity", True),
    (None,             "Weak SSH Key Algorithm (diffie-hellman-group1)", "medium", 5.3, "OpenSSH", False),
    (None,             "TLS 1.0/1.1 Enabled",                   "medium",   4.3, "TLS",      True),
    (None,             "SNMP v1/v2c Community String Exposed",   "medium",   5.0, "SNMP",     True),
    (None,             "Default Credentials Not Changed",        "high",     8.8, "Auth",     False),
    (None,             "NTP Amplification Vulnerability",        "low",      3.7, "NTP",      True),
    (None,             "DNS Zone Transfer Allowed",              "low",      3.1, "DNS",      True),
    (None,             "Expired SSL Certificate",                "medium",   4.0, "PKI",      True),
    (None,             "Open Telnet Port",                       "medium",   5.3, "Telnet",   True),
    (None,             "HTTP TRACE Method Enabled",              "low",      2.6, "HTTP",     True),
]

ALERT_POOL = [
    ("port_scan",      "critical", "Inbound port scan detected from {src}"),
    ("intrusion",      "critical", "IDS signature match: Exploit attempt from {src}"),
    ("brute_force",    "high",     "SSH brute-force: 150 failed logins from {src}"),
    ("policy_violation","high",    "Outbound connection to known C2 IP {src}"),
    ("config_change",  "medium",   "Unauthorized configuration change detected"),
    ("high_cpu",       "medium",   "CPU utilization exceeded 90% threshold for 5 min"),
    ("link_down",      "high",     "Interface GigE0/1 down — SLA breach"),
    ("bgp_flap",       "critical", "BGP session to {src} dropped unexpectedly"),
    ("disk_full",      "medium",   "Disk /var at 95% capacity"),
    ("cert_expiry",    "low",      "TLS certificate expires in 14 days"),
    ("login_anomaly",  "medium",   "Admin login from unusual IP {src}"),
    ("ddos",           "critical", "DDoS detected: 500K pps inbound on WAN"),
    ("acl_deny",       "low",      "ACL denied 1000 packets in last 60s from {src}"),
    ("ntp_drift",      "low",      "Clock drift >128ms — NTP sync failed"),
    ("mem_high",       "medium",   "Memory utilization at 88%"),
]

EXTERNAL_IPS = [
    "203.0.113.45", "198.51.100.12", "192.0.2.99",
    "45.33.32.156", "172.16.254.1",  "1.2.3.4",
    "91.108.4.1",   "185.220.101.5", "77.83.142.10",
]


def rand_ts(days_back=30):
    return datetime.utcnow() - timedelta(
        days=random.uniform(0, days_back),
        hours=random.uniform(0, 23),
        minutes=random.uniform(0, 59),
    )


def seed():
    print("🌱  Seeding database…")

    # ── Devices ────────────────────────────────────────────────────────────
    devices = []
    for idx, (hostname, ip, dtype, vendor, model, osv, loc, rack) in enumerate(DEVICE_POOL):
        if Device.query.filter_by(hostname=hostname).first():
            print(f"   skip {hostname} (exists)")
            continue
        status = random.choices(["online", "offline", "degraded"], weights=[80, 10, 10])[0]
        env = "production" if idx < 14 else random.choice(["staging", "lab"])
        d = Device(hostname=hostname, ip_address=ip, device_type=dtype,
                   vendor=vendor, model=model, os_version=osv, location=loc,
                   rack=rack, status=status, environment=env,
                   last_seen=rand_ts(2), created_at=rand_ts(180))
        db.session.add(d)
        devices.append(d)

    db.session.flush()
    print(f"   ✓  {len(devices)} devices")

    # ── Vulnerabilities ────────────────────────────────────────────────────
    all_devices = Device.query.all()
    vuln_count = 0
    for device in all_devices:
        n_vulns = random.randint(0, 6)
        chosen = random.sample(VULN_POOL, min(n_vulns, len(VULN_POOL)))
        for (cve, title, sev, score, comp, fix) in chosen:
            status = random.choices(["open", "mitigated", "accepted"], weights=[65, 25, 10])[0]
            fd = rand_ts(60)
            v = Vulnerability(
                device_id=device.id, cve_id=cve, title=title, severity=sev,
                cvss_score=score, affected_component=comp,
                affected_version=device.os_version,
                fix_available=fix, status=status,
                source=random.choice(["nmap", "qualys", "nessus", "manual"]),
                first_detected=fd, last_seen=rand_ts(7),
                remediated_at=(rand_ts(5) if status in ("mitigated",) else None),
            )
            db.session.add(v)
            vuln_count += 1

    db.session.flush()
    print(f"   ✓  {vuln_count} vulnerabilities")

    # ── Alerts ─────────────────────────────────────────────────────────────
    alert_count = 0
    for device in all_devices:
        n_alerts = random.randint(1, 10)
        for _ in range(n_alerts):
            atype, sev, msg_tpl = random.choice(ALERT_POOL)
            src = random.choice(EXTERNAL_IPS)
            status = random.choices(["open", "acknowledged", "closed"],
                                    weights=[50, 20, 30])[0]
            ts = rand_ts(14)
            a = Alert(
                device_id=device.id, alert_type=atype, severity=sev,
                message=msg_tpl.format(src=src),
                source_ip=src,
                destination_ip=device.ip_address,
                port=random.choice([22, 80, 443, 8080, 3306, None]),
                protocol=random.choice(["TCP", "UDP", "ICMP"]),
                status=status, created_at=ts,
                acknowledged_at=(rand_ts(5) if status in ("acknowledged", "closed") else None),
                resolved_at=(rand_ts(3) if status == "closed" else None),
            )
            db.session.add(a)
            alert_count += 1

    db.session.flush()
    print(f"   ✓  {alert_count} alerts")

    # ── Scans ──────────────────────────────────────────────────────────────
    scan_count = 0
    for device in random.sample(all_devices, min(15, len(all_devices))):
        for _ in range(random.randint(1, 5)):
            stype = random.choice(["port_scan", "vuln_scan", "config_audit"])
            st = rand_ts(7)
            et = st + timedelta(seconds=random.uniform(5, 60))
            scan = NetworkScan(
                device_id=device.id, scan_type=stype,
                triggered_by=random.choice(["scheduler", "api", "manual"]),
                status="completed",
                open_ports=[
                    {"port": p, "service": s, "state": "open"}
                    for p, s in random.sample(
                        [(22,"ssh"),(80,"http"),(443,"https"),(8080,"http-alt")], 2)
                ] if stype == "port_scan" else [],
                findings_count=random.randint(0, 5),
                started_at=st, completed_at=et, created_at=st,
            )
            db.session.add(scan)
            scan_count += 1

    db.session.commit()
    print(f"   ✓  {scan_count} scans")
    print("✅  Seed complete!")


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed()
