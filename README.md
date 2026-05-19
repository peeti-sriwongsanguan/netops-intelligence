# NetOps Intelligence Platform

A production-ready REST API + visualization dashboard that replaces Ansible for
telecom network monitoring, vulnerability management, and automated remediation.

Built with **Flask · PostgreSQL · SQLAlchemy · Chart.js**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser / Dashboard                         │
│              Chart.js  ·  Fetch API  ·  Live refresh            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                      Flask REST API  (run.py)                   │
│                                                                  │
│  /api/v1/devices          – CRUD, search, filter                │
│  /api/v1/vulnerabilities  – CVE tracking, stats                 │
│  /api/v1/alerts           – real-time alert management          │
│  /api/v1/scans            – trigger & query scan jobs           │
│  /api/v1/automation       – Ansible-replacement playbooks        │
│  /api/v1/summary          – KPI aggregation for dashboard       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ SQLAlchemy ORM
┌───────────────────────────▼─────────────────────────────────────┐
│              PostgreSQL  (network_intelligence DB)               │
│   devices · vulnerabilities · alerts · network_scans            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
network-intelligence/
├── app/
│   ├── __init__.py          # App factory (create_app)
│   ├── config.py            # Dev / Test / Prod configs
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py  # Blueprint registration
│   │       ├── devices.py       GET/POST/PUT/DELETE /devices
│   │       ├── vulnerabilities.py
│   │       ├── alerts.py        ACK + resolve endpoints
│   │       ├── scans.py         Trigger scan jobs
│   │       ├── automation.py    Playbook runner
│   │       └── summary.py       KPI aggregation
│   ├── models/
│   │   ├── device.py
│   │   ├── vulnerability.py
│   │   └── alert.py         (Alert + NetworkScan)
│   ├── dashboard/
│   │   ├── routes.py
│   │   └── templates/
│   │       └── dashboard.html   Full viz UI (Chart.js)
│   └── utils/
│       └── helpers.py       paginate_query, success(), error()
├── data/
│   ├── devices.csv          Reference CSV (20 telecom nodes)
│   └── vulnerabilities.csv  Reference CSV (20 CVEs)
├── scripts/
│   └── seed_db.py           Seed 20 devices, ~100 vulns, alerts, scans
├── tests/
│   └── unit/
│       └── test_api.py      pytest suite
├── .env.example
├── requirements.txt
└── run.py
```

---

## Quick Start

### 1. PostgreSQL setup
```sql
CREATE USER netops WITH PASSWORD 'netops123';
CREATE DATABASE network_intelligence OWNER netops;
```

### 2. Python environment (PyCharm: File → New Project → Virtualenv)
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment
```bash
cp .env.example .env
# Edit .env if needed
```

### 4. Database migrations
```bash
flask --app run:app db init
flask --app run:app db migrate -m "initial"
flask --app run:app db upgrade
```

### 5. Seed dummy data
```bash
python scripts/seed_db.py
```

### 6. Run
```bash
python run.py
# → http://localhost:5000      (dashboard)
# → http://localhost:5000/api/v1/summary
```

---

## API Reference

### Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/devices | List devices (filter: status, device_type, vendor, location, q) |
| POST   | /api/v1/devices | Create device |
| GET    | /api/v1/devices/:id | Get device |
| PATCH  | /api/v1/devices/:id | Update device |
| DELETE | /api/v1/devices/:id | Delete device |
| GET    | /api/v1/devices/:id/vulnerabilities | Device vulns |
| GET    | /api/v1/devices/:id/alerts | Device alerts |

### Vulnerabilities
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/vulnerabilities | List (filter: severity, status, device_id, fix_available) |
| POST   | /api/v1/vulnerabilities | Create |
| PATCH  | /api/v1/vulnerabilities/:id | Update status / notes |
| GET    | /api/v1/vulnerabilities/stats | Aggregated counts |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/alerts | List (filter: severity, status, alert_type) |
| POST   | /api/v1/alerts | Ingest new alert |
| POST   | /api/v1/alerts/:id/acknowledge | Acknowledge alert |
| POST   | /api/v1/alerts/:id/resolve | Close alert |

### Scans
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/scans | List scans |
| POST   | /api/v1/scans | Trigger scan (port_scan \| vuln_scan \| config_audit) |

### Automation (Ansible replacement)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/automation/playbooks | List available playbooks |
| POST   | /api/v1/automation/run | Execute playbook on device list |
| POST   | /api/v1/automation/bulk-scan | Scan all devices matching filter |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | /api/v1/summary | KPI aggregation (used by dashboard) |
| GET    | / | Visualization dashboard |
| GET    | /health | Health check |

---

## Example curl calls

```bash
# List all online routers
curl "http://localhost:5000/api/v1/devices?status=online&device_type=router"

# Get vulnerability stats
curl "http://localhost:5000/api/v1/vulnerabilities/stats"

# Trigger a port scan
curl -X POST http://localhost:5000/api/v1/scans \
  -H "Content-Type: application/json" \
  -d '{"device_id": 1, "scan_type": "port_scan"}'

# Run backup_config playbook on devices 1, 2, 3
curl -X POST http://localhost:5000/api/v1/automation/run \
  -H "Content-Type: application/json" \
  -d '{"playbook": "backup_config", "device_ids": [1, 2, 3]}'

# Acknowledge an alert
curl -X POST http://localhost:5000/api/v1/alerts/5/acknowledge \
  -H "Content-Type: application/json" \
  -d '{"assigned_to": "jdoe@telecom.com"}'
```

---

## PyCharm Setup Tips
- **Interpreter**: File → Settings → Project → Python Interpreter → Add → Virtualenv
- **Run configs**: pre-built in `.idea/runConfigurations/` — Flask Dev Server, Seed DB, Pytest
- **Database**: Use the built-in Database panel → + → Data Source → PostgreSQL
- **REST client**: PyCharm Professional has a built-in HTTP client; create `.http` files to test endpoints
- **Env vars**: Run Config → Environment Variables → paste from `.env`

---

## Extending for Production

1. **Real device connectivity**: Replace `_simulate_scan()` with Netmiko/NAPALM calls
2. **Async jobs**: Replace direct execution with Celery tasks (`@celery.task`)
3. **Authentication**: Add JWT via `flask-jwt-extended`
4. **RBAC**: Add role columns to users table
5. **Nornir integration**: Use `nornir` for parallel multi-device automation
6. **Streaming logs**: Pipe scan output over SSE or WebSocket
7. **Alerting**: Webhook / PagerDuty / Slack integration in notification_service.py
