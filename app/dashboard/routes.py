"""
Dashboard blueprint — serves the HTML visualization frontend.
"""
from flask import Blueprint, render_template
from flask_login import login_required

dashboard_bp = Blueprint("dashboard",
                         __name__,
                         template_folder='templates')


@dashboard_bp.route("/netops-dashboard")
@login_required
def netops_dashboard():
    return render_template("netops_dashboard.html")


@dashboard_bp.route("/health")
def health():
    from flask import jsonify
    return jsonify({"status": "ok", "service": "network-intelligence"})