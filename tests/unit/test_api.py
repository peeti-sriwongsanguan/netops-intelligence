"""
tests/unit/test_api.py
Basic API route tests.
"""
import pytest
from app import create_app, db as _db


@pytest.fixture(scope="session")
def app():
    app = create_app("testing")
    with app.app_context():
        _db.create_all()
        yield app
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


# ── Health ────────────────────────────────────────────────────────────────
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json["status"] == "ok"


# ── Devices ───────────────────────────────────────────────────────────────
def test_list_devices_empty(client):
    r = client.get("/api/v1/devices")
    assert r.status_code == 200
    assert r.json["data"] == []


def test_create_device(client):
    payload = {
        "hostname": "test-rtr-01",
        "ip_address": "192.168.1.1",
        "device_type": "router",
        "vendor": "Cisco",
        "status": "online",
    }
    r = client.post("/api/v1/devices", json=payload)
    assert r.status_code == 201
    data = r.json["data"]
    assert data["hostname"] == "test-rtr-01"
    assert data["status"] == "online"


def test_create_device_duplicate(client):
    payload = {"hostname": "test-rtr-01", "ip_address": "192.168.1.1", "device_type": "router"}
    r = client.post("/api/v1/devices", json=payload)
    assert r.status_code == 409


def test_create_device_missing_fields(client):
    r = client.post("/api/v1/devices", json={"hostname": "incomplete"})
    assert r.status_code == 400


def test_get_device(client):
    r = client.get("/api/v1/devices/1")
    assert r.status_code == 200
    assert r.json["data"]["id"] == 1


def test_update_device(client):
    r = client.patch("/api/v1/devices/1", json={"status": "degraded"})
    assert r.status_code == 200
    assert r.json["data"]["status"] == "degraded"


# ── Summary ───────────────────────────────────────────────────────────────
def test_summary(client):
    r = client.get("/api/v1/summary")
    assert r.status_code == 200
    d = r.json["data"]
    assert "devices" in d
    assert "vulnerabilities" in d
    assert "alerts" in d
    assert "scans" in d


# ── Automation ────────────────────────────────────────────────────────────
def test_list_playbooks(client):
    r = client.get("/api/v1/automation/playbooks")
    assert r.status_code == 200
    assert "backup_config" in r.json["data"]


def test_run_playbook(client):
    payload = {"playbook": "backup_config", "device_ids": [1]}
    r = client.post("/api/v1/automation/run", json=payload)
    assert r.status_code == 200
    d = r.json["data"]
    assert d["total"] == 1
    assert len(d["results"]) == 1


def test_run_unknown_playbook(client):
    r = client.post("/api/v1/automation/run",
                    json={"playbook": "hack_everything", "device_ids": [1]})
    assert r.status_code == 400
