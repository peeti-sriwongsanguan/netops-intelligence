# NetOps Intelligence Platform
### Network & Endpoint Security Monitoring — VZW NetworkSecure

> As a **Network Automation Engineer** running **NetworkSecure**
> across **1,870,561 devices** and **1,762,518 users**. My goal is to develop an in-house tool that can replace Ansible
> with a REST API that monitors, scores, and remediates risk in real time —
> before attackers find the door first.

---

## What This Replaces

The old toolchain was Ansible 2.9.27 running on Python 2.7, producing flat `.txt` files
per site per run — no centralized visibility, no alerting, no risk scoring.

This platform ingests those same daily log files and turns them into:
- A live REST API queryable from any tool or script
- A 5-tab visualization dashboard with scatter anomaly detection
- An AI risk scoring engine with explainability
- A breach probability forecast with what-if simulation

---

## Real-Life Scenarios This Platform Handles

![netOpsV1.gif](assets/netOpsV1.gif)
---

### Scenario 1 — IPSec Tunnel Failures Across Sites

**What the data shows today:**
```
AURSCOTYVZWVSAS-Y-AT-SECAS-01-SUBMP-001  →  Traffic 2/2 failures
WJRDUT30VZWVSAS-Y-AT-SECAS-01-SUBMP-002  →  Traffic 2/2 failures
BRHOALTBVZWVSAS-Y-AT-SECAS-01-SUBMP-002  →  Traffic 2/2 failures
OMALNEXUVZWVSAS-Y-AT-SECAS-01-SUBMP-001  →  Traffic 2/2 failures
```

**Without this platform:** SSH into each node manually, read the Ansible output file,
try to correlate across 20 sites.

**With this platform:**
```bash
# See all IPSec failures instantly
GET /api/v1/sites/ipsec

# Get full site health picture
GET /api/v1/sites

# Trigger credential rotation on affected nodes
POST /api/v1/automation/run
{
  "playbook": "rotate_credentials",
  "device_ids": [40, 44, 50, 51]
}
```
**Result:** 14 tunnel failures surfaced, assigned, and remediated via API — no SSH needed.

---

### Scenario 2 — SGVE Steering Ratio Anomaly

**What the data shows:**
- `batonrouge` node: SteeringRatio `0.180` — expected `~1.0`
- `hillsboro`: SteeringRatio `0.977` — below threshold
- `houston`: 3 nodes with MDN counts `6,445 / 6,527 / 6,650` — load imbalance

** workflow:**
```bash
# Alert already fired automatically during ingest
GET /api/v1/alerts?alert_type=steering_ratio_low&status=open

# See full site picture for batonrouge
GET /api/v1/sites

# Collect telemetry before making changes
POST /api/v1/automation/run
{
  "playbook": "collect_telemetry",
  "device_ids": [<batonrouge device ids>]
}
```

---

### Scenario 3 — Critical CVE Drops at 6 PM

**What happens:**
The CISO calls — *"How many of our 1.8M devices are affected by the new PAN-OS CVE?"*

```bash
# Find all devices running affected software
GET /api/v1/vulnerabilities?severity=critical&status=open

# Trigger vuln scan across all production nodes
POST /api/v1/automation/bulk-scan
{ "scan_type": "vuln_scan", "environment": "production" }

# Patch everything at once
POST /api/v1/automation/run
{ "playbook": "patch_os", "device_ids": [...] }
```
**Result:** Answer in 20 minutes with exact device count and patch ETA.

---

### Scenario 4 — Off-Hours SSH Brute Force

**Alert fired:**
```json
{
  "alert_type": "brute_force",
  "severity": "critical",
  "message": "SSH brute-force: 150 failed logins from 45.33.32.156",
  "device_hostname": "vpn-gw-01",
  "port": 22
}
```

** workflow:**
```bash
# Block the attacking IP immediately
POST /api/v1/automation/run
{ "playbook": "apply_acl", "device_ids": [19], "params": { "block_ip": "45.33.32.156" } }

# Rotate credentials as precaution
POST /api/v1/automation/run
{ "playbook": "rotate_credentials", "device_ids": [19] }

# Close the alert
POST /api/v1/alerts/7834/resolve
```

---

### Scenario 5 — Monday Executive Report

**One API call gives everything:**
```bash
GET /api/v1/summary
```
```json
{
  "devices": { "total": 59, "by_status": { "online": 44, "degraded": 13, "offline": 2 } },
  "vulnerabilities": { "total_open": 39, "by_severity": { "critical": 10, "high": 7 } },
  "alerts": { "total_open": 71, "critical_open": 18 },
  "scans": { "total": 51 }
}
```

---

### Scenario 6 — AI Flags a High-Risk Node

The ML model scores every device 0–100 using 6 features:
critical vuln count, days unpatched, open alert count, offline status,
CVSS average, and login anomaly rate.

```bash
# Get top at-risk devices
GET /api/v1/ai/risk-scores?limit=10

# Explain why a device was flagged
GET /api/v1/ai/explain/40

# Run what-if simulation
POST /api/v1/ai/simulate
{ "patch_pct": 80, "cred_pct": 50, "mfa_pct": 30, "isolate_pct": 20 }
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Daily Log Files (real production data)                                 │
│  SGVE-usage.csv · ipsec_monitor_results.txt · prometheus_metrics.txt    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  python scripts/ingest_real_data.py
┌──────────────────────────────▼──────────────────────────────────────────┐
│                      NetOps Intelligence API                            │
│                                                                         │
│  /api/v1/devices          CRUD + search + filter                       │
│  /api/v1/vulnerabilities  CVE tracking + stats                         │
│  /api/v1/alerts           ingest + ACK + resolve                       │
│  /api/v1/scans            trigger scan jobs                            │
│  /api/v1/sites            per-site health + IPSec tunnel status        │
│  /api/v1/automation       playbook runner (Ansible replacement)         │
│  /api/v1/ai               ML risk scores + explainability + forecast   │
│  /api/v1/summary          KPI aggregation                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  SQLAlchemy ORM
┌──────────────────────────────▼──────────────────────────────────────────┐
│              PostgreSQL  —  network_intelligence DB                     │
│   devices · vulnerabilities · alerts · network_scans                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Dashboard — 5 Tabs

| Tab | What it shows |
|-----|--------------|
| **Overview** | KPIs, alert severity, device types, scan activity, recent critical alerts |
| **Site Monitor** | 20 real VZW sites — Aurora CO, Omaha NE, Houston TX etc. — with per-site device health, alert count, IPSec failures |
| **Anomaly Detection** | 3 scatter plots: Device Risk Matrix, Alert Burst heatmap (attack time patterns), CVSS Timeline |
| **AI Risk Intelligence** | ML risk scores per device, SHAP-style explainability, K-Means behavioral clusters, risk score distribution |
| **Breach Forecast** | 7-day LSTM probability forecast, attack vector rankings, what-if remediation simulator |

---

## Project Structure

```
network-intelligence/
├── run.py                              ← Flask entry point
├── app/
│   ├── __init__.py                     ← App factory
│   ├── config.py                       ← dev / test / prod configs
│   ├── api/v1/
│   │   ├── devices.py                  ← CRUD + search
│   │   ├── vulnerabilities.py          ← CVE tracking + /stats
│   │   ├── alerts.py                   ← ingest, ACK, resolve
│   │   ├── scans.py                    ← trigger scan jobs
│   │   ├── sites.py                    ← per-site health + IPSec
│   │   ├── automation.py               ← playbook runner
│   │   ├── ai.py                       ← ML risk scores + forecast
│   │   └── summary.py                  ← KPI aggregation
│   ├── models/
│   │   ├── device.py
│   │   ├── vulnerability.py
│   │   └── alert.py                    ← Alert + NetworkScan
│   ├── dashboard/
│   │   └── templates/dashboard.html    ← 5-tab viz dashboard
│   └── utils/helpers.py
├── data/
│   ├── opt/admin/monitoring/logs/      ← real daily log files go here
│   │   └── 20260521_*/                 ← timestamped run folders
│   ├── devices.csv                     ← reference CSV
│   └── vulnerabilities.csv            ← reference CVEs
├── scripts/
│   ├── seed_db.py                      ← loads dummy data
│   └── ingest_real_data.py            ← loads real daily logs
├── tests/unit/test_api.py
├── migrations/
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Prerequisites
```bash
brew install python@3.12 postgresql@15
brew services start postgresql@15
```

### 2. PostgreSQL setup
```sql
psql postgres
CREATE USER netops WITH PASSWORD 'netops123';
CREATE DATABASE network_intelligence OWNER netops;
\q
```

### 3. Python environment
```bash
python3.12 -m venv venv
source venv/bin/activate
pip install flask flask-sqlalchemy flask-migrate flask-cors flask-limiter psycopg2-binary python-dotenv
```

### 4. Config
```bash
cp .env.example .env
```

### 5. Database migrations
```bash
flask --app run:app db init
flask --app run:app db migrate -m "initial schema"
flask --app run:app db upgrade
```

### 6. Load data

**Option A — Dummy seed data (dev/test):**
```bash
python scripts/seed_db.py
```

**Option B — Real daily logs:**
```bash
# Place the log folder under data/opt/admin/monitoring/logs/
python scripts/ingest_real_data.py
```
The ingest script auto-discovers the log folder even if the directory name contains
Unicode private-use characters (e.g. `\uf022`) — no need to type the folder name.

### 7. Run
```bash
# macOS — disable AirPlay Receiver in System Settings first, then:
python run.py

# Or use a different port (AirPlay owns 5000):
PORT=8080 python run.py
```

Open **http://localhost:8080** — dashboard is live.

---

## API Reference

### Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/devices | List — filter by `status`, `device_type`, `vendor`, `location`, `q` |
| POST | /api/v1/devices | Register device |
| GET | /api/v1/devices/:id | Get device |
| PATCH | /api/v1/devices/:id | Update fields |
| DELETE | /api/v1/devices/:id | Remove device |
| GET | /api/v1/devices/:id/vulnerabilities | CVEs for this device |
| GET | /api/v1/devices/:id/alerts | Alert history |

### Vulnerabilities
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/vulnerabilities | List — filter by `severity`, `status`, `device_id`, `fix_available` |
| POST | /api/v1/vulnerabilities | Log a CVE |
| PATCH | /api/v1/vulnerabilities/:id | Update status / notes |
| GET | /api/v1/vulnerabilities/stats | Counts by severity, top vulnerable devices |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/alerts | List — filter by `severity`, `status`, `alert_type` |
| POST | /api/v1/alerts | Ingest alert from IDS / SIEM / ingest script |
| POST | /api/v1/alerts/:id/acknowledge | Assign to analyst |
| POST | /api/v1/alerts/:id/resolve | Close alert |

### Sites
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/sites | Per-site health — devices, alerts, IPSec failures |
| GET | /api/v1/sites/ipsec | All IPSec tunnel failures |

### Scans
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/scans | List scan jobs |
| POST | /api/v1/scans | Trigger `port_scan` / `vuln_scan` / `config_audit` |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/automation/playbooks | List playbooks |
| POST | /api/v1/automation/run | Run playbook on device list |
| POST | /api/v1/automation/bulk-scan | Scan all devices matching filter |

**Playbooks:**
| Name | What it does |
|------|-------------|
| `backup_config` | Pull running config to NMS |
| `apply_acl` | Push firewall / ACL rules |
| `rotate_credentials` | Generate and push new SSH keys |
| `patch_os` | Upgrade OS to recommended version |
| `collect_telemetry` | Gather CPU, memory, interface stats |

### AI Risk Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/ai/risk-scores | ML risk score for every device |
| GET | /api/v1/ai/explain/:id | SHAP-style feature attribution |
| GET | /api/v1/ai/clusters | K-Means behavioral cluster assignments |
| GET | /api/v1/ai/breach-forecast | 7-day LSTM breach probability |
| POST | /api/v1/ai/simulate | What-if risk reduction simulation |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/summary | All KPIs in one call |
| GET | / | 5-tab live dashboard |
| GET | /health | Health check |

---

## Common curl Commands

```bash
# Full risk picture
curl http://localhost:8080/api/v1/summary | python3 -m json.tool

# All critical open alerts
curl "http://localhost:8080/api/v1/alerts?severity=critical&status=open"

# All IPSec tunnel failures
curl http://localhost:8080/api/v1/sites/ipsec | python3 -m json.tool

# Per-site health for all 20 sites
curl http://localhost:8080/api/v1/sites | python3 -m json.tool

# Top 10 at-risk devices (ML scored)
curl "http://localhost:8080/api/v1/ai/risk-scores?limit=10" | python3 -m json.tool

# Explain why device 40 was flagged
curl http://localhost:8080/api/v1/ai/explain/40 | python3 -m json.tool

# Trigger vuln scan on device 1
curl -X POST http://localhost:8080/api/v1/scans \
  -H "Content-Type: application/json" \
  -d '{"device_id": 1, "scan_type": "vuln_scan"}'

# Run backup_config on Aurora SUBMP nodes
curl -X POST http://localhost:8080/api/v1/automation/run \
  -H "Content-Type: application/json" \
  -d '{"playbook": "backup_config", "device_ids": [40, 41]}'

# Simulate risk reduction
curl -X POST http://localhost:8080/api/v1/ai/simulate \
  -H "Content-Type: application/json" \
  -d '{"patch_pct": 80, "cred_pct": 50, "mfa_pct": 30, "isolate_pct": 20}'

# Ingest a new alert from your IDS
curl -X POST http://localhost:8080/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": 1,
    "alert_type": "intrusion",
    "severity": "critical",
    "message": "IDS: Exploit attempt from 91.108.4.1",
    "source_ip": "91.108.4.1",
    "protocol": "TCP",
    "port": 443
  }'
```

---

## Ingesting New Daily Logs

Every day a new timestamped folder drops under `data/opt/admin/monitoring/logs/`.
The ingest script finds it automatically:

```bash
python scripts/ingest_real_data.py
```

To point at a specific run:
```bash
python scripts/ingest_real_data.py --base-dir data/opt/admin/monitoring/logs
```

**What it parses:**

| File | What it creates |
|------|----------------|
| `*_SGVE-usage.csv` | 1 device per site, alerts for low steering ratio / load imbalance |
| `*_ipsec_monitor_results.txt` | 1 device per SUBMP node, critical alerts for traffic failures |
| `*_prometheus_metrics_CS.txt` | 1 device per k8s worker node, scan records per microservice |
| `*_prometheus_metrics_SL.txt` | Same for SL region |

**Known sites:**

| Code | Location | State |
|------|----------|-------|
| AUR | Aurora | CO |
| WJR | West Jordan | UT |
| PLY | Plymouth Mtg | MI |
| WMT | Wilmington | DE |
| ALP | Alpharetta | GA |
| BRM | Birmingham | AL |
| NLV | Las Vegas | NV |
| TEM | Tempe | AZ |
| CLM | Columbus | OH |
| DUF | Duff | IL |
| EUL | Euless | TX |
| SCH | Schertz | TX |
| HLB | Hillsboro | OR |
| RDM | Redmond Ridge | WA |
| BLT | Bloomington | MN |
| OMA | Omaha | NE |
| HSN | Houston | TX |
| BTR | Baton Rouge | LA |
| RON | Richmond | VA |
| ROA | Roanoke | VA |

---

## PyCharm Setup

1. **Open project**: File → Open → `network-intelligence/`
2. **Interpreter**: File → Settings → Project → Python Interpreter → Add → Virtualenv → point to `venv/`
3. **Run configs**: pre-built in `.idea/runConfigurations/` — select *Flask Dev Server*
4. **Database panel**: View → Tool Windows → Database → `+` → PostgreSQL → fill in `netops/netops123`
5. **HTTP Client**: create `.http` files to test endpoints inline in PyCharm Pro
6. **Env vars**: Edit Run Config → Environment Variables → `PORT=8080`

---

## Roadmap — Making It Production-Real

| What | How | Priority |
|------|-----|----------|
| Real device scans | Replace `_simulate_scan()` with `nmap` subprocess | Phase 1 |
| Real SSH remediation | Plug `Netmiko` / `NAPALM` into playbooks | Phase 1 |
| Auto-ingest on file drop | `watchdog` file system watcher → trigger ingest | Phase 1 |
| Parallel automation | Wrap playbooks with `Nornir` for 1000s of devices | Phase 2 |
| Async scan jobs | Move to `Celery` + Redis queue | Phase 2 |
| API authentication | JWT via `flask-jwt-extended` | Phase 2 |
| Real ML model | Train `XGBoost` on historical breach data, `SHAP` for real explainability | Phase 2 |
| SIEM integration | POST `/api/v1/alerts` from Splunk / Elastic | Phase 2 |
| Slack / PagerDuty | Webhook on critical IPSec / steering alerts | Phase 3 |
| Scale to 1.8M devices | TimescaleDB for telemetry, Redis cache on `/summary` | Phase 3 |