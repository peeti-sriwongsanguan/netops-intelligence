# app/__init__.py
"""
Network Intelligence Platform
Flask Application Factory
"""
import os
import logging
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_login import LoginManager, current_user
from flask_jwt_extended import JWTManager
from flask_mail import Mail
from flask_caching import Cache
from dotenv import load_dotenv

# Import your thread-safe logger
from app.log_util import log_user_activity

# --- Initialize Extensions ---
db = SQLAlchemy()
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address)
mail = Mail()
cache = Cache()
jwt = JWTManager()

login_manager = LoginManager()
login_manager.login_view = 'main.index'  # Routes unauthenticated users to the login page
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

logging.basicConfig(level=logging.DEBUG)


def create_permission_map(app):
    """
    Inspects all routes in the app and builds a map of
    required permissions to their corresponding URL paths.
    """
    permission_map = {}
    for rule in app.url_map.iter_rules():
        view_func = app.view_functions.get(rule.endpoint)
        if hasattr(view_func, '_required_permission'):
            permission_name = view_func._required_permission
            permission_map[permission_name] = rule.rule
    return permission_map


def create_app():
    """
    Creates and configures the Flask application.
    """
    # Load variables from the .env file
    load_dotenv()

    # Force templates and static to root folders for the Hub-and-Spoke model
    app = Flask(__name__, instance_relative_config=True,
                template_folder='templates',
                static_folder='static')

    # --- Unified Configurations (Pulled from .env) ---
    app.config.from_mapping(
        SECRET_KEY=os.getenv('SECRET_KEY', os.urandom(24)),

        # SecAAS Database Config
        SQLALCHEMY_DATABASE_URI=os.getenv(
            "DATABASE_URL"
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,

        # JWT / Session Configs
        JWT_SECRET_KEY=os.getenv('JWT_SECRET_KEY', os.urandom(32)),
        JWT_ACCESS_TOKEN_EXPIRES=3600,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=os.getenv('FLASK_ENV', 'development') == 'production',

        # Flask-Mail Configurations (Gmail)
        MAIL_SERVER=os.getenv('MAIL_SERVER'),
        MAIL_PORT=int(os.getenv('MAIL_PORT')),
        MAIL_USE_TLS=os.getenv('MAIL_USE_TLS', 'True').lower() in ['true', '1', 't'],
        MAIL_USERNAME=os.getenv('MAIL_USERNAME'),
        MAIL_PASSWORD=os.getenv('MAIL_PASSWORD'),
        MAIL_DEFAULT_SENDER=os.getenv('SENDER_EMAIL'),

        # Flask-Caching
        CACHE_TYPE='SimpleCache',
        CACHE_DEFAULT_TIMEOUT=300
    )

    # --- Bind Extensions to App ---
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    limiter.init_app(app)
    login_manager.init_app(app)
    jwt.init_app(app)
    mail.init_app(app)
    cache.init_app(app)

    # --- Register Blueprints ---

    # 1. The Hub & Authentication (Login page & Hub routing)
    from app.routes import main as main_bp
    app.register_blueprint(main_bp)

    # 2. SecAAS Data API (The backend for your dark-mode dashboard)
    from app.api.v1 import api_v1_bp
    app.register_blueprint(api_v1_bp, url_prefix="/api/v1")

    # 3. SecAAS Frontend Dashboard
    # (Registers your old dashboard routes so the Hub can link to them)
    try:
        from app.dashboard.routes import dashboard_bp
        app.register_blueprint(dashboard_bp)
    except ImportError:
        pass

    # --- Import Models ---
    # Register models so Flask-Migrate and SQLAlchemy see them
    from app.models import device, vulnerability, alert, network_scan  # noqa

    # Hook up the user loader for Flask-Login
    from app.user import load_user
    login_manager.user_loader(load_user)

    # --- Post-Initialization Setup ---
    with app.app_context():
        app.permission_map = create_permission_map(app)

    # --- JWT Error Handlers ---
    @jwt.unauthorized_loader
    def unauthorized_response(callback):
        return jsonify({"msg": "Missing Authorization Header"}), 401

    @jwt.invalid_token_loader
    def invalid_token_response(callback):
        return jsonify({"msg": "Signature verification failed or invalid token"}), 401

    @jwt.expired_token_loader
    def expired_token_response(callback):
        return jsonify({"msg": "Token has expired"}), 401

    # --- Request Logging ---
    @app.before_request
    def log_page_visit():
        if request.path.startswith('/static'):
            return

        if current_user.is_authenticated:
            ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
            log_user_activity(
                user_id=int(current_user.id),
                event_type='page_visit',
                ip_address=ip_address,
                path=request.path
            )

    return app