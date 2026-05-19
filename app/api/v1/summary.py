"""
/api/v1/summary  — aggregated KPIs for the dashboard.
"""
from flask import jsonify
from sqlalchemy import func
from app.api.v1 import api_v1_bp
from app.models.device import Device
from app.models.vulnerability import Vulnerability
from app.models.alert import Alert, NetworkScan
from app import db
from app.utils.helpers import success


@api_v1_bp.route("/summary", methods=["GET"])
def get_summary():
    # Device counts
    device_totals = dict(
        db.session.query(Device.status, func.count(Device.id)).group_by(Device.status).all()
    )

    # Vulnerability counts by severity
    vuln_by_severity = dict(
        db.session.query(Vulnerability.severity, func.count(Vulnerability.id))
        .filter(Vulnerability.status == "open")
        .group_by(Vulnerability.severity)
        .all()
    )

    # Alert counts by severity
    alert_by_severity = dict(
        db.session.query(Alert.severity, func.count(Alert.id))
        .filter(Alert.status == "open")
        .group_by(Alert.severity)
        .all()
    )

    # Scan activity last 7 days
    from datetime import datetime, timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_scans = (
        db.session.query(func.date(NetworkScan.created_at), func.count(NetworkScan.id))
        .filter(NetworkScan.created_at >= week_ago)
        .group_by(func.date(NetworkScan.created_at))
        .order_by(func.date(NetworkScan.created_at))
        .all()
    )

    # Devices by type
    by_type = dict(
        db.session.query(Device.device_type, func.count(Device.id))
        .group_by(Device.device_type)
        .all()
    )

    # Top 5 critical alerts
    critical_alerts = Alert.query.filter_by(severity="critical", status="open") \
        .order_by(Alert.created_at.desc()).limit(5).all()

    return jsonify(success({
        "devices": {
            "total": Device.query.count(),
            "by_status": device_totals,
            "by_type": by_type,
        },
        "vulnerabilities": {
            "total_open": Vulnerability.query.filter_by(status="open").count(),
            "by_severity": vuln_by_severity,
        },
        "alerts": {
            "total_open": Alert.query.filter_by(status="open").count(),
            "by_severity": alert_by_severity,
            "critical_open": alert_by_severity.get("critical", 0),
            "recent_critical": [a.to_dict() for a in critical_alerts],
        },
        "scans": {
            "total": NetworkScan.query.count(),
            "last_7_days": [
                {"date": str(d), "count": c} for d, c in recent_scans
            ],
        },
    }))
