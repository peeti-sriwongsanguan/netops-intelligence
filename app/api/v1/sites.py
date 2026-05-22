"""
/api/v1/sites  — per-site aggregated metrics from real SGVE/IPSec data
"""
from flask import jsonify, request
from sqlalchemy import func
from app.api.v1 import api_v1_bp
from app.models.device import Device
from app.models.alert import Alert, NetworkScan
from app.models.vulnerability import Vulnerability
from app import db
from app.utils.helpers import success

# Maps location strings back to short codes for grouping
LOCATION_SITES = [
    "Aurora, CO", "West Jordan, UT", "Plymouth Mtg, MI", "Wilmington, DE",
    "Alpharetta, GA", "Birmingham, AL", "Las Vegas, NV", "Tempe, AZ",
    "Columbus, OH", "Duff, IL", "Euless, TX", "Schertz, TX",
    "Hillsboro, OR", "Redmond Ridge, WA", "Bloomington, MN", "Omaha, NE",
    "Houston, TX", "Baton Rouge, LA", "Richmond, VA", "Roanoke, VA",
]


@api_v1_bp.route("/sites", methods=["GET"])
def list_sites():
    """
    GET /api/v1/sites
    Returns per-site device counts, alert counts, and health status.
    """
    results = []

    # Group devices by location
    location_counts = (
        db.session.query(Device.location, func.count(Device.id).label("total"),
                         func.sum(db.case((Device.status == "online", 1), else_=0)).label("online"),
                         func.sum(db.case((Device.status == "offline", 1), else_=0)).label("offline"),
                         func.sum(db.case((Device.status == "degraded", 1), else_=0)).label("degraded"))
        .group_by(Device.location)
        .all()
    )

    for row in location_counts:
        if not row.location:
            continue

        # Get device IDs for this location
        device_ids = [d.id for d in Device.query.filter_by(location=row.location).all()]

        open_alerts = Alert.query.filter(
            Alert.device_id.in_(device_ids),
            Alert.status == "open"
        ).count() if device_ids else 0

        critical_alerts = Alert.query.filter(
            Alert.device_id.in_(device_ids),
            Alert.status == "open",
            Alert.severity == "critical"
        ).count() if device_ids else 0

        ipsec_failures = Alert.query.filter(
            Alert.device_id.in_(device_ids),
            Alert.alert_type == "ipsec_tunnel_failure",
            Alert.status == "open"
        ).count() if device_ids else 0

        # Derive site health
        if critical_alerts > 0 or row.offline > 0:
            health = "critical"
        elif open_alerts > 0 or row.degraded > 0:
            health = "degraded"
        else:
            health = "healthy"

        results.append({
            "location": row.location,
            "devices": {
                "total": row.total,
                "online": row.online or 0,
                "offline": row.offline or 0,
                "degraded": row.degraded or 0,
            },
            "alerts": {
                "open": open_alerts,
                "critical": critical_alerts,
                "ipsec_failures": ipsec_failures,
            },
            "health": health,
        })

    # Sort: critical first, then degraded, then healthy
    health_order = {"critical": 0, "degraded": 1, "healthy": 2}
    results.sort(key=lambda x: health_order[x["health"]])

    return jsonify(success({
        "total_sites": len(results),
        "critical": sum(1 for r in results if r["health"] == "critical"),
        "degraded": sum(1 for r in results if r["health"] == "degraded"),
        "healthy":  sum(1 for r in results if r["health"] == "healthy"),
        "sites": results,
    }))


@api_v1_bp.route("/sites/ipsec", methods=["GET"])
def ipsec_status():
    """GET /api/v1/sites/ipsec — IPSec tunnel failure summary."""
    failures = (
        Alert.query
        .filter(Alert.alert_type.in_(["ipsec_tunnel_failure", "ipsec_ping_failure"]),
                Alert.status == "open")
        .order_by(Alert.severity.desc(), Alert.created_at.desc())
        .all()
    )
    return jsonify(success({
        "total_failures": len(failures),
        "critical": sum(1 for f in failures if f.severity == "critical"),
        "high":     sum(1 for f in failures if f.severity == "high"),
        "medium":   sum(1 for f in failures if f.severity == "medium"),
        "tunnels":  [f.to_dict() for f in failures],
    }))