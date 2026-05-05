"""
SQLAlchemy models for CertifyMe admin portal.
"""
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Admin(db.Model):
    __tablename__ = "admins"

    id            = db.Column(db.String(36), primary_key=True)
    full_name     = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at    = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    reset_tokens  = db.relationship(
        "PasswordResetToken", back_populates="admin", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Admin {self.email}>"


class Opportunity(db.Model):
    __tablename__ = "opportunities"

    id                 = db.Column(db.String(36), primary_key=True)
    admin_id           = db.Column(db.String(36), db.ForeignKey("admins.id"), nullable=False, index=True)
    name               = db.Column(db.String(200), nullable=False)
    duration           = db.Column(db.String(100), nullable=False)
    start_date         = db.Column(db.String(50),  nullable=False)   # stored as ISO string
    description        = db.Column(db.Text,         nullable=False)
    skills             = db.Column(db.Text,         nullable=False)  # JSON array string
    category           = db.Column(db.String(50),   nullable=False)
    future_opps        = db.Column(db.Text,         nullable=False)
    max_applicants     = db.Column(db.Integer,       nullable=True)
    created_at         = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    admin = db.relationship("Admin", backref=db.backref("opportunities", lazy=True))

    def to_dict(self):
        import json
        try:
            skills_list = json.loads(self.skills)
        except Exception:
            skills_list = [s.strip() for s in self.skills.split(",") if s.strip()]
        return {
            "id":             self.id,
            "name":           self.name,
            "duration":       self.duration,
            "start_date":     self.start_date,
            "description":    self.description,
            "skills":         skills_list,
            "category":       self.category,
            "future_opps":    self.future_opps,
            "max_applicants": self.max_applicants,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Opportunity {self.name}>"


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id         = db.Column(db.String(36), primary_key=True)
    admin_id   = db.Column(db.String(36), db.ForeignKey("admins.id"), nullable=False)
    token      = db.Column(db.String(128), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used       = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    admin = db.relationship("Admin", back_populates="reset_tokens")

    def __repr__(self):
        return f"<ResetToken admin={self.admin_id} used={self.used}>"
