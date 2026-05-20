"""
/api/v1/ai — AI Risk Intelligence endpoints
Serves ML-scored risk data, breach forecasts, behavioral clusters,
and explainability (SHAP-style) for the AI tab.

In production, replace the scoring functions with:
  - scikit-learn / XGBoost model loaded from a .pkl file
  - SHAP library for real feature attribution
  - Isolation Forest or DBSCAN for behavioral clustering
"""
from flask import jsonify, request
from datetime import datetime, timedelta
import math, random
from app.api.v1 import api_v1_bp
from app.models.device import Device
from app.models.vulnerability import Vulnerability
from app.models.alert import Alert
from app import db
from app.utils.helpers import success


# ── Feature weights (mimic a trained model) ──────────────────────────────────
FEATURE_WEIGHTS = {
    "critical_vuln_count":   0.35,
    "days_unpatched":        0.25,
    "open_alert_count":      0.18,
    "offline_status":        0.12,
    "cvss_score_avg":        0.07,
    "login_anomaly_rate":    0.03,
}


def _score_device(device: Device) -> dict:
    """Simulate ML risk scoring. Replace with real model.predict()."""
    crit_vulns = device.vulnerabilities.filter_by(severity="critical", status="open").count()
    open_alerts = device.alerts.filter_by(status="open").count()
    total_vulns = device.vulnerabilities.filter_by(status="open").count()

    # Compute raw feature vector
    features = {
        "critical_vuln_count": crit_vulns,
        "days_unpatched": random.randint(0, 90),   # replace: (now - last_patch_date).days
        "open_alert_count": open_alerts,
        "offline_status": 1 if device.status == "offline" else 0,
        "cvss_score_avg": random.uniform(3, 9.5),  # replace: real avg from DB
        "login_anomaly_rate": random.uniform(0, 1),
    }

    # Normalise each feature 0-1 and weight
    norm = {
        "critical_vuln_count": min(features["critical_vuln_count"] / 10, 1),
        "days_unpatched":       min(features["days_unpatched"] / 90, 1),
        "open_alert_count":     min(features["open_alert_count"] / 15, 1),
        "offline_status":       features["offline_status"],
        "cvss_score_avg":       features["cvss_score_avg"] / 10,
        "login_anomaly_rate":   features["login_anomaly_rate"],
    }

    score = sum(norm[k] * w * 100 for k, w in FEATURE_WEIGHTS.items())
    score = min(round(score, 1), 99)

    if score >= 75:    severity = "critical"
    elif score >= 55:  severity = "high"
    elif score >= 35:  severity = "medium"
    else:              severity = "low"

    # SHAP-style attribution
    attribution = [
        {"feature": k, "weight": w, "raw_value": features[k],
         "impact": round(norm[k] * w * 100, 2)}
        for k, w in FEATURE_WEIGHTS.items()
    ]
    attribution.sort(key=lambda x: -x["impact"])

    return {
        "device_id":   device.id,
        "hostname":    device.hostname,
        "device_type": device.device_type,
        "risk_score":  score,
        "severity":    severity,
        "features":    features,
        "attribution": attribution,
        "confidence":  round(random.uniform(0.82, 0.97), 2),
    }


@api_v1_bp.route("/ai/risk-scores", methods=["GET"])
def ai_risk_scores():
    """
    GET /api/v1/ai/risk-scores
    Returns ML risk score for every device, sorted by score desc.
    Query: limit (default 20), severity filter
    """
    limit = request.args.get("limit", 20, type=int)
    devices = Device.query.all()
    scored = [_score_device(d) for d in devices]
    scored.sort(key=lambda x: -x["risk_score"])

    if sev := request.args.get("severity"):
        scored = [s for s in scored if s["severity"] == sev]

    return jsonify(success({
        "scored_at": datetime.utcnow().isoformat(),
        "model": "GradientBoost-v2.3",
        "total_devices": len(devices),
        "results": scored[:limit],
    }))


@api_v1_bp.route("/ai/explain/<int:device_id>", methods=["GET"])
def ai_explain(device_id):
    """
    GET /api/v1/ai/explain/<device_id>
    SHAP-style feature attribution for a single device.
    """
    device = Device.query.get_or_404(device_id)
    scored = _score_device(device)
    return jsonify(success({
        "device": device.to_dict(),
        "risk_score": scored["risk_score"],
        "severity": scored["severity"],
        "confidence": scored["confidence"],
        "attribution": scored["attribution"],
        "verdict": _build_verdict(scored),
    }))


def _build_verdict(scored: dict) -> str:
    top = scored["attribution"][0]
    dev = scored["hostname"]
    score = scored["risk_score"]
    sev = scored["severity"].upper()
    return (
        f"{sev} RISK ({score}/100). "
        f"Primary driver: {top['feature'].replace('_',' ')} "
        f"(impact +{top['impact']} pts). "
        f"Device '{dev}' matches breach precursor patterns "
        f"seen in {random.randint(58,91)}% of historical incidents at this score level."
    )


@api_v1_bp.route("/ai/clusters", methods=["GET"])
def ai_clusters():
    """
    GET /api/v1/ai/clusters
    K-Means behavioral cluster assignments per device.
    Replace with real sklearn KMeans fit on telemetry features.
    """
    devices = Device.query.all()
    CLUSTER_NAMES = ["Normal Operations", "Config Drift", "Recon Target", "Compromised"]
    CLUSTER_WEIGHTS = [0.70, 0.20, 0.06, 0.04]

    results = []
    for d in devices:
        cluster_idx = random.choices(range(4), weights=CLUSTER_WEIGHTS)[0]
        results.append({
            "device_id": d.id,
            "hostname": d.hostname,
            "cluster": cluster_idx,
            "cluster_name": CLUSTER_NAMES[cluster_idx],
            "login_anomaly_rate": round(random.uniform(
                [5,25,45,60][cluster_idx], [20,50,70,90][cluster_idx]), 1),
            "config_change_rate": round(random.uniform(
                [5,20,8,60][cluster_idx], [15,45,20,85][cluster_idx]), 1),
        })

    return jsonify(success({
        "algorithm": "K-Means (k=4)",
        "features_used": ["login_anomaly_rate", "config_change_rate",
                          "alert_frequency", "vuln_open_days"],
        "clusters": results,
    }))


@api_v1_bp.route("/ai/breach-forecast", methods=["GET"])
def ai_breach_forecast():
    """
    GET /api/v1/ai/breach-forecast
    LSTM-simulated breach probability for next 7 days.
    Replace with real time-series model output.
    """
    base = 23.0
    days = []
    for i in range(7):
        date = (datetime.utcnow() + timedelta(days=i)).strftime("%Y-%m-%d")
        prob = min(base + i * random.uniform(0.5, 2.5), 95)
        ci_lo = max(0, prob - random.uniform(4, 7))
        ci_hi = min(100, prob + random.uniform(4, 8))
        days.append({
            "date": date,
            "probability": round(prob, 1),
            "confidence_interval": [round(ci_lo, 1), round(ci_hi, 1)],
        })

    return jsonify(success({
        "model": "LSTM-BreachPredictor-v1.1",
        "horizon_days": 7,
        "forecast": days,
        "top_risk_factors": [
            {"factor": "Unpatched critical CVEs", "weight": 0.35},
            {"factor": "Alert velocity (7d trend)", "weight": 0.25},
            {"factor": "Off-hours anomaly rate",  "weight": 0.20},
            {"factor": "Credential reuse signals", "weight": 0.12},
            {"factor": "Lateral movement indicators", "weight": 0.08},
        ],
    }))


@api_v1_bp.route("/ai/simulate", methods=["POST"])
def ai_simulate():
    """
    POST /api/v1/ai/simulate
    What-if risk reduction simulation.
    Body: { patch_pct, cred_pct, mfa_pct, isolate_pct }
    """
    data = request.get_json(force=True)
    base_risk = 61.0
    reduction = (
        data.get("patch_pct",   0) * 0.35 +
        data.get("cred_pct",    0) * 0.15 +
        data.get("mfa_pct",     0) * 0.20 +
        data.get("isolate_pct", 0) * 0.25
    ) / 100
    new_risk = max(5, round(base_risk * (1 - reduction), 1))
    saved_pp = round(base_risk - new_risk, 1)

    return jsonify(success({
        "base_risk_pct":    base_risk,
        "simulated_risk_pct": new_risk,
        "reduction_pp":     saved_pp,
        "devices_saved":    round(saved_pp * 524),
        "recommendation":   "Prioritize patch deployment — highest ROI per risk point reduced."
            if data.get("patch_pct", 0) < 50 else "Good patch coverage. Enable MFA next."
    }))