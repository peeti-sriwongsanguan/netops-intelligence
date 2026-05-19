"""
Dashboard blueprint — serves the HTML visualization frontend.
"""
from flask import Blueprint, render_template

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/")
def index():
    return render_template("dashboard.html")


@dashboard_bp.route("/health")
def health():
    from flask import jsonify
    return jsonify({"status": "ok", "service": "network-intelligence"})
