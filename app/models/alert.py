"""
Alert model — real-time network / security alerts.
NetworkScan model — records of automation scan jobs.
"""
from datetime import datetime
from app import db


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey("devices.id"), nullable=False)
    alert_type = db.Column(db.String(64), nullable=False)   # port_scan, intrusion, down, high_cpu …
    severity = db.Column(db.String(16), nullable=False)     # critical | high | medium | low
    message = db.Column(db.Text, nullable=False)
    source_ip = db.Column(db.String(45))
    destination_ip = db.Column(db.String(45))
    port = db.Column(db.Integer)
    protocol = db.Column(db.String(16))                     # TCP, UDP, ICMP …
    status = db.Column(db.String(32), default="open")       # open | acknowledged | closed
    assigned_to = db.Column(db.String(64))
    acknowledged_at = db.Column(db.DateTime)
    resolved_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    device = db.relationship("Device", back_populates="alerts")

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "device_hostname": self.device.hostname if self.device else None,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "source_ip": self.source_ip,
            "destination_ip": self.destination_ip,
            "port": self.port,
            "protocol": self.protocol,
            "status": self.status,
            "assigned_to": self.assigned_to,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Alert [{self.severity}] {self.alert_type} on {self.device_id}>"


class NetworkScan(db.Model):
    __tablename__ = "network_scans"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.Integer, db.ForeignKey("devices.id"), nullable=False)
    scan_type = db.Column(db.String(64), nullable=False)    # port_scan | vuln_scan | config_audit
    triggered_by = db.Column(db.String(64))                 # scheduler | manual | api
    status = db.Column(db.String(32), default="pending")    # pending | running | completed | failed
    open_ports = db.Column(db.JSON)                         # [{"port": 22, "service": "ssh"}, …]
    findings_count = db.Column(db.Integer, default=0)
    raw_output = db.Column(db.Text)
    error_message = db.Column(db.Text)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    device = db.relationship("Device", back_populates="scans")

    @property
    def duration_seconds(self):
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "device_hostname": self.device.hostname if self.device else None,
            "scan_type": self.scan_type,
            "triggered_by": self.triggered_by,
            "status": self.status,
            "open_ports": self.open_ports,
            "findings_count": self.findings_count,
            "error_message": self.error_message,
            "duration_seconds": self.duration_seconds,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<NetworkScan {self.scan_type} device={self.device_id} [{self.status}]>"
