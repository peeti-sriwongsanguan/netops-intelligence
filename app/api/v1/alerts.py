"""
Alerts API — /api/v1/alerts
"""
from flask import request, jsonify
from datetime import datetime
from app.api.v1 import api_v1_bp
from app.models.alert import Alert
from app import db
from app.utils.helpers import paginate_query, success, error


@api_v1_bp.route("/alerts", methods=["GET"])
def list_alerts():
    query = Alert.query

    if severity := request.args.get("severity"):
        query = query.filter(Alert.severity.ilike(severity))
    if status := request.args.get("status"):
        query = query.filter_by(status=status)
    if alert_type := request.args.get("alert_type"):
        query = query.filter_by(alert_type=alert_type)
    if device_id := request.args.get("device_id"):
        query = query.filter_by(device_id=int(device_id))

    query = query.order_by(Alert.created_at.desc())
    return jsonify(paginate_query(query, request))


@api_v1_bp.route("/alerts/<int:alert_id>", methods=["GET"])
def get_alert(alert_id):
    return jsonify(success(Alert.query.get_or_404(alert_id).to_dict()))


@api_v1_bp.route("/alerts", methods=["POST"])
def create_alert():
    data = request.get_json(force=True)
    required = ["device_id", "alert_type", "severity", "message"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(error(f"Missing: {', '.join(missing)}")), 400

    alert = Alert(
        device_id=data["device_id"],
        alert_type=data["alert_type"],
        severity=data["severity"],
        message=data["message"],
        source_ip=data.get("source_ip"),
        destination_ip=data.get("destination_ip"),
        port=data.get("port"),
        protocol=data.get("protocol"),
    )
    db.session.add(alert)
    db.session.commit()
    return jsonify(success(alert.to_dict(), "Alert created")), 201


@api_v1_bp.route("/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def acknowledge_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    data = request.get_json(force=True) or {}
    alert.status = "acknowledged"
    alert.acknowledged_at = datetime.utcnow()
    alert.assigned_to = data.get("assigned_to", alert.assigned_to)
    db.session.commit()
    return jsonify(success(alert.to_dict(), "Alert acknowledged"))


@api_v1_bp.route("/alerts/<int:alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id):
    alert = Alert.query.get_or_404(alert_id)
    alert.status = "closed"
    alert.resolved_at = datetime.utcnow()
    db.session.commit()
    return jsonify(success(alert.to_dict(), "Alert resolved"))
