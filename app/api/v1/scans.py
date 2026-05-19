"""
Scans API — /api/v1/scans
Simulates triggering Ansible-like automation jobs via REST.
"""
from flask import request, jsonify
from datetime import datetime, timedelta
import random
from app.api.v1 import api_v1_bp
from app.models.alert import NetworkScan
from app.models.device import Device
from app import db
from app.utils.helpers import paginate_query, success, error


@api_v1_bp.route("/scans", methods=["GET"])
def list_scans():
    query = NetworkScan.query

    if status := request.args.get("status"):
        query = query.filter_by(status=status)
    if device_id := request.args.get("device_id"):
        query = query.filter_by(device_id=int(device_id))
    if scan_type := request.args.get("scan_type"):
        query = query.filter_by(scan_type=scan_type)

    query = query.order_by(NetworkScan.created_at.desc())
    return jsonify(paginate_query(query, request))


@api_v1_bp.route("/scans/<int:scan_id>", methods=["GET"])
def get_scan(scan_id):
    return jsonify(success(NetworkScan.query.get_or_404(scan_id).to_dict()))


@api_v1_bp.route("/scans", methods=["POST"])
def trigger_scan():
    """
    Trigger a scan job (port_scan | vuln_scan | config_audit).
    In production this would enqueue a Celery task.
    Here we simulate instant completion with dummy data.
    """
    data = request.get_json(force=True)
    required = ["device_id", "scan_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(error(f"Missing: {', '.join(missing)}")), 400

    device = Device.query.get_or_404(data["device_id"])

    scan = NetworkScan(
        device_id=device.id,
        scan_type=data["scan_type"],
        triggered_by=data.get("triggered_by", "api"),
        status="running",
        started_at=datetime.utcnow(),
    )
    db.session.add(scan)
    db.session.flush()

    # --- Simulate scan result (replace with real nmap / Ansible call) ---
    _simulate_scan(scan, data["scan_type"])

    db.session.commit()
    return jsonify(success(scan.to_dict(), "Scan completed")), 201


def _simulate_scan(scan: NetworkScan, scan_type: str):
    """Simulate scan output with dummy data."""
    common_ports = [
        {"port": 22, "service": "ssh", "state": "open"},
        {"port": 80, "service": "http", "state": "open"},
        {"port": 443, "service": "https", "state": "open"},
        {"port": 8080, "service": "http-alt", "state": "open"},
        {"port": 3306, "service": "mysql", "state": "filtered"},
    ]
    if scan_type == "port_scan":
        selected = random.sample(common_ports, k=random.randint(2, 5))
        scan.open_ports = selected
        scan.findings_count = len([p for p in selected if p["state"] == "open"])
    elif scan_type == "vuln_scan":
        scan.findings_count = random.randint(0, 8)
        scan.open_ports = []
    else:
        scan.findings_count = random.randint(0, 3)
        scan.open_ports = []

    scan.status = "completed"
    scan.completed_at = datetime.utcnow() + timedelta(seconds=random.uniform(1, 15))
    scan.raw_output = f"[SIMULATED] {scan_type} completed. Findings: {scan.findings_count}"
