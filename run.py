"""
run.py — application entry point
Run with:  python run.py
           flask --app run:app run --debug
"""

from app import create_app
import os

port = int(os.environ.get('PORT', 5111))
app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=port, use_reloader=False)
