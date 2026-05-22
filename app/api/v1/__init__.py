"""
API v1 blueprint — aggregates all resource routers.
"""
from flask import Blueprint

api_v1_bp = Blueprint("api_v1", __name__)

from app.api.v1 import devices, vulnerabilities, alerts, scans, automation, summary, sites, ai  # noqa
