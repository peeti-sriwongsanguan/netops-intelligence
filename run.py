"""
run.py — application entry point
Run with:  python run.py
           flask --app run:app run --debug
"""
import os
from app import create_app

env = os.environ.get("FLASK_ENV", "development")
app = create_app(env)

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5001)),
        debug=(env == "development"),
    )
