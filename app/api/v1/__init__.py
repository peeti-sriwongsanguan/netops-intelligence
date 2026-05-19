"""
API v1 blueprint — aggregates all resource routers.
"""
from flask import Blueprint

api_v1_bp = Blueprint("api_v1", __name__)

# Import route modules so their @api_v1_bp.route decorators are registered
from app.api.v1 import devices, vulnerabilities, alerts, scans, automation, summary  # noqa
