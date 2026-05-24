#app/log_util.py
import json
import os
from datetime import datetime, timezone
import threading
from flask import current_app

# --- Configuration ---
LOG_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'user_activity.json')
file_lock = threading.Lock()


def log_user_activity(user_id, event_type, ip_address=None, path=None):
    """
    Logs user activity (login/logout) to a JSON file in a thread-safe manner.
    """
    with file_lock:
        try:
            logs = {"activity": []}
            if os.path.exists(LOG_FILE_PATH):
                with open(LOG_FILE_PATH, 'r') as f:
                    try:
                        loaded_data = json.load(f)
                        if isinstance(loaded_data, dict):
                            logs = loaded_data
                        elif isinstance(loaded_data, list):
                            logs['activity'] = loaded_data
                    except json.JSONDecodeError:
                        pass

            if 'activity' not in logs or not isinstance(logs.get('activity'), list):
                logs['activity'] = []

            # --- Create the log entry ---
            log_entry = {
                "user_id": user_id,
                "event": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            # IP address only if it's a login event and page visit
            if ip_address:
                log_entry["ip_address"] = ip_address
            if event_type == 'page_visit' and path:
                log_entry["path"] = path
            # ---------------------------

            logs["activity"].append(log_entry)

            with open(LOG_FILE_PATH, 'w') as f:
                json.dump(logs, f, indent=4)

            current_app.logger.info(f"Successfully logged '{event_type}' for user '{user_id}'.")

        except Exception as e:
            current_app.logger.error(f"!!! FAILED to log user activity: {e}", exc_info=True)