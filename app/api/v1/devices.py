"""
/api/v1/devices  — CRUD + filtering for managed devices
"""
from flask import request, jsonify
from app.api.v1 import api_v1_bp
from app.models.device import Device
from app import db
from app.utils.helpers import paginate_query, success, error


@api_v1_bp.route("/devices", methods=["GET"])
def list_devices():
    """
    GET /api/v1/devices
    Query params: status, device_type, vendor, location, environment, page, per_page
    """
    query = Device.query

    # Filters
    if status := request.args.get("status"):
        query = query.filter_by(status=status)
    if dtype := request.args.get("device_type"):
        query = query.filter_by(device_type=dtype)
    if vendor := request.args.get("vendor"):
        query = query.filter_by(vendor=vendor)
    if location := request.args.get("location"):
        query = query.filter(Device.location.ilike(f"%{location}%"))
    if env := request.args.get("environment"):
        query = query.filter_by(environment=env)
    if search := request.args.get("q"):
        query = query.filter(
            db.or_(
                Device.hostname.ilike(f"%{search}%"),
                Device.ip_address.ilike(f"%{search}%"),
            )
        )

    query = query.order_by(Device.hostname)
    return jsonify(paginate_query(query, request))


@api_v1_bp.route("/devices/<int:device_id>", methods=["GET"])
def get_device(device_id):
    device = Device.query.get_or_404(device_id)
    return jsonify(success(device.to_dict()))


@api_v1_bp.route("/devices", methods=["POST"])
def create_device():
    data = request.get_json(force=True)
    required = ["hostname", "ip_address", "device_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(error(f"Missing required fields: {', '.join(missing)}")), 400

    if Device.query.filter_by(hostname=data["hostname"]).first():
        return jsonify(error("Hostname already exists")), 409

    device = Device(
        hostname=data["hostname"],
        ip_address=data["ip_address"],
        device_type=data["device_type"],
        vendor=data.get("vendor"),
        model=data.get("model"),
        os_version=data.get("os_version"),
        location=data.get("location"),
        rack=data.get("rack"),
        status=data.get("status", "online"),
        environment=data.get("environment", "production"),
    )
    db.session.add(device)
    db.session.commit()
    return jsonify(success(device.to_dict(), "Device created")), 201


@api_v1_bp.route("/devices/<int:device_id>", methods=["PUT", "PATCH"])
def update_device(device_id):
    device = Device.query.get_or_404(device_id)
    data = request.get_json(force=True)

    updatable = ["ip_address", "device_type", "vendor", "model", "os_version",
                 "location", "rack", "status", "environment"]
    for field in updatable:
        if field in data:
            setattr(device, field, data[field])

    db.session.commit()
    return jsonify(success(device.to_dict(), "Device updated"))


@api_v1_bp.route("/devices/<int:device_id>", methods=["DELETE"])
def delete_device(device_id):
    device = Device.query.get_or_404(device_id)
    db.session.delete(device)
    db.session.commit()
    return jsonify(success(None, "Device deleted"))


@api_v1_bp.route("/devices/<int:device_id>/vulnerabilities", methods=["GET"])
def device_vulnerabilities(device_id):
    device = Device.query.get_or_404(device_id)
    vulns = device.vulnerabilities.order_by(db.text("cvss_score DESC NULLS LAST")).all()
    return jsonify(success([v.to_dict() for v in vulns]))


@api_v1_bp.route("/devices/<int:device_id>/alerts", methods=["GET"])
def device_alerts(device_id):
    device = Device.query.get_or_404(device_id)
    alerts = device.alerts.order_by(db.text("created_at DESC")).limit(50).all()
    return jsonify(success([a.to_dict() for a in alerts]))
