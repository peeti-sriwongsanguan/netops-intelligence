"""
/api/v1/automation  — Ansible-replacement task execution engine.
Defines "playbooks" as Python-driven task graphs callable via REST.
"""
from flask import request, jsonify
from datetime import datetime
import random
from app.api.v1 import api_v1_bp
from app.models.device import Device
from app import db
from app.utils.helpers import success, error

# ---------------------------------------------------------------------------
# Built-in playbooks (extend with real SSH / NETCONF / RESTCONF calls)
# ---------------------------------------------------------------------------
PLAYBOOKS = {
    "backup_config": {
        "description": "Backup running configuration to NMS store",
        "tasks": ["connect", "fetch_running_config", "save_to_nms"],
    },
    "apply_acl": {
        "description": "Push ACL rule set to device",
        "tasks": ["connect", "validate_acl", "apply_acl", "verify"],
    },
    "rotate_credentials": {
        "description": "Rotate SSH credentials on target devices",
        "tasks": ["connect", "generate_key", "push_key", "verify_login"],
    },
    "patch_os": {
        "description": "Upgrade device OS to recommended version",
        "tasks": ["connect", "pre_check", "upload_image", "install", "reboot", "verify"],
    },
    "collect_telemetry": {
        "description": "Collect CPU / memory / interface stats",
        "tasks": ["connect", "fetch_cpu", "fetch_memory", "fetch_interfaces", "store"],
    },
}


@api_v1_bp.route("/automation/playbooks", methods=["GET"])
def list_playbooks():
    return jsonify(success(PLAYBOOKS))


@api_v1_bp.route("/automation/run", methods=["POST"])
def run_playbook():
    """
    POST /api/v1/automation/run
    Body: { "playbook": "backup_config", "device_ids": [1,2,3], "params": {} }
    """
    data = request.get_json(force=True)
    playbook_name = data.get("playbook")
    device_ids = data.get("device_ids", [])

    if playbook_name not in PLAYBOOKS:
        return jsonify(error(f"Unknown playbook '{playbook_name}'. "
                             f"Available: {list(PLAYBOOKS.keys())}")), 400
    if not device_ids:
        return jsonify(error("device_ids must be a non-empty list")), 400

    playbook = PLAYBOOKS[playbook_name]
    results = []

    for device_id in device_ids:
        device = Device.query.get(device_id)
        if not device:
            results.append({"device_id": device_id, "status": "error",
                            "message": "Device not found"})
            continue

        # Simulate task execution
        task_results = _execute_playbook(playbook, device)
        results.append({
            "device_id": device_id,
            "hostname": device.hostname,
            "ip_address": device.ip_address,
            "playbook": playbook_name,
            "status": "success" if all(t["status"] == "ok" for t in task_results) else "failed",
            "tasks": task_results,
            "executed_at": datetime.utcnow().isoformat(),
        })

    return jsonify(success({
        "playbook": playbook_name,
        "total": len(device_ids),
        "succeeded": sum(1 for r in results if r.get("status") == "success"),
        "failed": sum(1 for r in results if r.get("status") != "success"),
        "results": results,
    }))


def _execute_playbook(playbook: dict, device: Device) -> list:
    """Simulate per-task execution (replace with Netmiko / NAPALM calls)."""
    task_results = []
    for task_name in playbook["tasks"]:
        # Simulate 5% failure rate per task
        ok = random.random() > 0.05
        task_results.append({
            "task": task_name,
            "status": "ok" if ok else "failed",
            "duration_ms": round(random.uniform(50, 800), 1),
        })
        if not ok:
            break  # stop on first failure (like Ansible default)
    return task_results


@api_v1_bp.route("/automation/bulk-scan", methods=["POST"])
def bulk_scan():
    """Trigger a scan across multiple devices matching a filter."""
    data = request.get_json(force=True)
    scan_type = data.get("scan_type", "port_scan")
    environment = data.get("environment")
    location = data.get("location")

    query = Device.query.filter_by(status="online")
    if environment:
        query = query.filter_by(environment=environment)
    if location:
        query = query.filter(Device.location.ilike(f"%{location}%"))

    devices = query.all()
    return jsonify(success({
        "scan_type": scan_type,
        "targeted_devices": len(devices),
        "device_ids": [d.id for d in devices],
        "message": f"Bulk {scan_type} queued for {len(devices)} devices",
    }))
