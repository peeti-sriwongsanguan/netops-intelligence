"""
Device model — represents a managed network node (router, switch, firewall, server…)
"""
from datetime import datetime
from app import db


class Device(db.Model):
    __tablename__ = "devices"

    id = db.Column(db.Integer, primary_key=True)
    hostname = db.Column(db.String(128), nullable=False, unique=True)
    ip_address = db.Column(db.String(45), nullable=False)        # IPv4 / IPv6
    device_type = db.Column(db.String(64), nullable=False)       # router, switch, firewall, server
    vendor = db.Column(db.String(64))                            # Cisco, Juniper, Palo Alto …
    model = db.Column(db.String(128))
    os_version = db.Column(db.String(64))
    location = db.Column(db.String(128))                         # datacenter / site
    rack = db.Column(db.String(32))
    status = db.Column(db.String(32), default="online")          # online | offline | degraded
    environment = db.Column(db.String(32), default="production") # production | staging | lab
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    vulnerabilities = db.relationship("Vulnerability", back_populates="device", lazy="dynamic")
    alerts = db.relationship("Alert", back_populates="device", lazy="dynamic")
    scans = db.relationship("NetworkScan", back_populates="device", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "hostname": self.hostname,
            "ip_address": self.ip_address,
            "device_type": self.device_type,
            "vendor": self.vendor,
            "model": self.model,
            "os_version": self.os_version,
            "location": self.location,
            "rack": self.rack,
            "status": self.status,
            "environment": self.environment,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "vuln_count": self.vulnerabilities.count(),
            "open_alerts": self.alerts.filter_by(status="open").count(),
        }

    def __repr__(self):
        return f"<Device {self.hostname} [{self.ip_address}]>"
