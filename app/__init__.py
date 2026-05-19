"""
Network Intelligence Platform
Flask Application Factory
"""
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address)


def create_app(config_name="development"):
    app = Flask(__name__, template_folder="dashboard/templates", static_folder="static")

    # Load config
    from app.config import config_map
    app.config.from_object(config_map[config_name])

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    limiter.init_app(app)

    # Register blueprints — REST API v1
    from app.api.v1 import api_v1_bp
    app.register_blueprint(api_v1_bp, url_prefix="/api/v1")

    # Register dashboard blueprint
    from app.dashboard.routes import dashboard_bp
    app.register_blueprint(dashboard_bp, url_prefix="/")

    # Register models so Flask-Migrate sees them
    from app.models import device, vulnerability, alert, network_scan  # noqa

    return app
