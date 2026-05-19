"""
/api/v1/vulnerabilities  — CVE / app vulnerability tracking
"""
from flask import request, jsonify
from app.api.v1 import api_v1_bp
from app.models.vulnerability import Vulnerability
from app import db
from app.utils.helpers import paginate_query, success, error


@api_v1_bp.route("/vulnerabilities", methods=["GET"])
def list_vulnerabilities():
    """
    GET /api/v1/vulnerabilities
    Params: severity, status, device_id, fix_available, source, q (search), page, per_page
    """
    query = Vulnerability.query

    if severity := request.args.get("severity"):
        query = query.filter(Vulnerability.severity.ilike(severity))
    if status := request.args.get("status"):
        query = query.filter_by(status=status)
    if device_id := request.args.get("device_id"):
        query = query.filter_by(device_id=int(device_id))
    if fix := request.args.get("fix_available"):
        query = query.filter_by(fix_available=(fix.lower() == "true"))
    if source := request.args.get("source"):
        query = query.filter_by(source=source)
    if search := request.args.get("q"):
        query = query.filter(
            db.or_(
                Vulnerability.cve_id.ilike(f"%{search}%"),
                Vulnerability.title.ilike(f"%{search}%"),
            )
        )

    query = query.order_by(Vulnerability.cvss_score.desc().nullslast())
    return jsonify(paginate_query(query, request))


@api_v1_bp.route("/vulnerabilities/<int:vuln_id>", methods=["GET"])
def get_vulnerability(vuln_id):
    v = Vulnerability.query.get_or_404(vuln_id)
    return jsonify(success(v.to_dict()))


@api_v1_bp.route("/vulnerabilities", methods=["POST"])
def create_vulnerability():
    data = request.get_json(force=True)
    required = ["device_id", "title", "severity"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify(error(f"Missing: {', '.join(missing)}")), 400

    v = Vulnerability(
        device_id=data["device_id"],
        cve_id=data.get("cve_id"),
        title=data["title"],
        description=data.get("description"),
        severity=data["severity"].lower(),
        cvss_score=data.get("cvss_score"),
        affected_component=data.get("affected_component"),
        affected_version=data.get("affected_version"),
        fix_available=data.get("fix_available", False),
        fix_version=data.get("fix_version"),
        status=data.get("status", "open"),
        source=data.get("source", "manual"),
        notes=data.get("notes"),
    )
    db.session.add(v)
    db.session.commit()
    return jsonify(success(v.to_dict(), "Vulnerability created")), 201


@api_v1_bp.route("/vulnerabilities/<int:vuln_id>", methods=["PATCH"])
def update_vulnerability(vuln_id):
    v = Vulnerability.query.get_or_404(vuln_id)
    data = request.get_json(force=True)

    updatable = ["status", "severity", "cvss_score", "fix_available", "fix_version",
                 "notes", "assigned_to", "remediated_at"]
    for field in updatable:
        if field in data:
            setattr(v, field, data[field])

    db.session.commit()
    return jsonify(success(v.to_dict(), "Vulnerability updated"))


@api_v1_bp.route("/vulnerabilities/stats", methods=["GET"])
def vulnerability_stats():
    from sqlalchemy import func

    severity_counts = (
        db.session.query(Vulnerability.severity, func.count(Vulnerability.id))
        .group_by(Vulnerability.severity)
        .all()
    )
    status_counts = (
        db.session.query(Vulnerability.status, func.count(Vulnerability.id))
        .group_by(Vulnerability.status)
        .all()
    )
    top_affected = (
        db.session.query(Vulnerability.device_id, func.count(Vulnerability.id).label("cnt"))
        .filter(Vulnerability.status == "open")
        .group_by(Vulnerability.device_id)
        .order_by(db.text("cnt DESC"))
        .limit(10)
        .all()
    )

    return jsonify(success({
        "by_severity": {s: c for s, c in severity_counts},
        "by_status": {s: c for s, c in status_counts},
        "top_vulnerable_devices": [{"device_id": d, "count": c} for d, c in top_affected],
    }))
