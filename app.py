"""
CertifyMe — Qatar Foundation Admin Portal
Flask Backend  |  Task 1 (Auth) complete
"""

import os
import re
import uuid
import secrets
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify, session, render_template, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from database import db, Admin, PasswordResetToken, Opportunity

# ─────────────────────────── app setup ────────────────────────────────────────
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")

# Session cookies — Lax is fine since all assets are served from Flask (same origin)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False       # True in production (HTTPS)
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

# Database
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
    "DATABASE_URL", "sqlite:///certifyme.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
CORS(app, supports_credentials=True, origins=["http://localhost:5000",
                                               "http://127.0.0.1:5000",
                                               "null"])          # file:// for local dev

# ─────────────────────────── helpers ──────────────────────────────────────────
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def bad(msg, code=400):
    return jsonify({"ok": False, "error": msg}), code


def ok(payload=None, code=200):
    body = {"ok": True}
    if payload:
        body.update(payload)
    return jsonify(body), code


def current_admin():
    admin_id = session.get("admin_id")
    if not admin_id:
        return None
    return db.session.get(Admin, admin_id)


def require_auth(f):
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_admin():
            return bad("Unauthorised – please log in", 401)
        return f(*args, **kwargs)

    return decorated


# ─────────────────────────── Serve UI ─────────────────────────────────────────
@app.route("/")
def index():
    return send_from_directory(".", "admin.html")


@app.route("/admin.js")
def serve_admin_js():
    return send_from_directory(".", "admin.js")


@app.route("/api.js")
def serve_api_js():
    return send_from_directory(".", "api.js")


# ─────────────────────────── US-1.1  Sign Up ──────────────────────────────────
@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}

    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or ""

    errors = {}

    # ── field-level validation ──────────────────────────────────────────────
    if not full_name:
        errors["full_name"] = "Full name is required."

    if not email:
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(email):
        errors["email"] = "Please enter a valid email address."

    if not password:
        errors["password"] = "Password is required."
    elif len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."

    if not confirm:
        errors["confirm_password"] = "Please confirm your password."
    elif password and confirm and password != confirm:
        errors["confirm_password"] = "Passwords do not match."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    # ── uniqueness check ────────────────────────────────────────────────────
    if Admin.query.filter_by(email=email).first():
        return jsonify(
            {"ok": False, "errors": {"email": "An account with this email already exists."}}
        ), 409

    # ── persist ────────────────────────────────────────────────────────────
    admin = Admin(
        id=str(uuid.uuid4()),
        full_name=full_name,
        email=email,
        password_hash=generate_password_hash(password),
    )
    db.session.add(admin)
    db.session.commit()

    return ok({"message": "Account created successfully. Please sign in."}, 201)


# ─────────────────────────── US-1.2  Login ────────────────────────────────────
@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember_me = bool(data.get("remember_me", False))

    errors = {}

    if not email:
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(email):
        errors["email"] = "Please enter a valid email address."

    if not password:
        errors["password"] = "Password is required."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    # ── generic credential check (never reveal which field is wrong) ────────
    admin = Admin.query.filter_by(email=email).first()
    if not admin or not check_password_hash(admin.password_hash, password):
        return bad("Invalid email or password", 401)

    # ── session ────────────────────────────────────────────────────────────
    session.clear()
    session["admin_id"] = admin.id
    if remember_me:
        session.permanent = True
    else:
        session.permanent = False

    return ok(
        {
            "admin": {
                "id": admin.id,
                "full_name": admin.full_name,
                "email": admin.email,
            }
        }
    )


# ─────────────────────────── US-1.3  Forgot password ──────────────────────────
@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    errors = {}
    if not email:
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(email):
        errors["email"] = "Please enter a valid email address."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    # ── always return success (privacy) ────────────────────────────────────
    admin = Admin.query.filter_by(email=email).first()
    if admin:
        token_value = secrets.token_urlsafe(48)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        # invalidate previous tokens for this admin
        PasswordResetToken.query.filter_by(admin_id=admin.id, used=False).update(
            {"used": True}
        )

        token = PasswordResetToken(
            id=str(uuid.uuid4()),
            admin_id=admin.id,
            token=token_value,
            expires_at=expires_at,
        )
        db.session.add(token)
        db.session.commit()

        # Log internally (no actual email sent)
        reset_link = f"http://localhost:5000/api/auth/reset-password?token={token_value}"
        app.logger.info("PASSWORD RESET LINK for %s → %s", email, reset_link)

    return ok(
        {
            "message": (
                "If this email is registered, you will receive a reset link shortly."
            )
        }
    )


# ─────────────────────────── Reset password (consume token) ───────────────────
@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(silent=True) or {}
    token_value = (data.get("token") or "").strip()
    new_password = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not token_value:
        return bad("Reset token is required.")

    token = PasswordResetToken.query.filter_by(token=token_value, used=False).first()

    if not token:
        return bad("Invalid or already-used reset link.", 400)

    if datetime.now(timezone.utc) > token.expires_at.replace(tzinfo=timezone.utc):
        return bad("This reset link has expired. Please request a new one.", 400)

    errors = {}
    if not new_password or len(new_password) < 8:
        errors["new_password"] = "Password must be at least 8 characters."
    if new_password != confirm:
        errors["confirm_password"] = "Passwords do not match."
    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    admin = db.session.get(Admin, token.admin_id)
    admin.password_hash = generate_password_hash(new_password)
    token.used = True
    db.session.commit()

    return ok({"message": "Password reset successfully. Please sign in."})


# ─────────────────────────── Logout ───────────────────────────────────────────
@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return ok({"message": "Signed out successfully."})


# ─────────────────────────── Session check (me) ───────────────────────────────
@app.route("/api/auth/me", methods=["GET"])
def me():
    admin = current_admin()
    if not admin:
        return bad("Not authenticated", 401)
    return ok(
        {
            "admin": {
                "id": admin.id,
                "full_name": admin.full_name,
                "email": admin.email,
            }
        }
    )


# ─────────────────────────── US-2.1  List opportunities ───────────────────────
@app.route("/api/opportunities", methods=["GET"])
@require_auth
def list_opportunities():
    admin = current_admin()
    opps = (
        Opportunity.query
        .filter_by(admin_id=admin.id)
        .order_by(Opportunity.created_at.desc())
        .all()
    )
    return ok({"opportunities": [o.to_dict() for o in opps]})


# ─────────────────────────── US-2.2  Create opportunity ───────────────────────
@app.route("/api/opportunities", methods=["POST"])
@require_auth
def create_opportunity():
    import json as _json
    data = request.get_json(silent=True) or {}
    admin = current_admin()

    name           = (data.get("name") or "").strip()
    duration       = (data.get("duration") or "").strip()
    start_date     = (data.get("start_date") or "").strip()
    description    = (data.get("description") or "").strip()
    skills_raw     = (data.get("skills") or "").strip()
    category       = (data.get("category") or "").strip()
    future_opps    = (data.get("future_opps") or "").strip()
    max_applicants = data.get("max_applicants")   # optional

    VALID_CATEGORIES = {"technology", "business", "design", "marketing", "data", "other"}

    errors = {}
    if not name:            errors["name"]        = "Opportunity name is required."
    if not duration:        errors["duration"]    = "Duration is required."
    if not start_date:      errors["start_date"]  = "Start date is required."
    if not description:     errors["description"] = "Description is required."
    if not skills_raw:      errors["skills"]      = "At least one skill is required."
    if not category:
        errors["category"] = "Category is required."
    elif category not in VALID_CATEGORIES:
        errors["category"] = f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}."
    if not future_opps:     errors["future_opps"] = "Future opportunities field is required."

    # Optional numeric field
    parsed_max = None
    if max_applicants is not None and max_applicants != "":
        try:
            parsed_max = int(max_applicants)
            if parsed_max < 0:
                errors["max_applicants"] = "Maximum applicants cannot be negative."
        except (ValueError, TypeError):
            errors["max_applicants"] = "Maximum applicants must be a whole number."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    # Parse skills list → store as JSON
    skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]
    skills_json = _json.dumps(skills_list)

    opp = Opportunity(
        id=str(uuid.uuid4()),
        admin_id=admin.id,
        name=name,
        duration=duration,
        start_date=start_date,
        description=description,
        skills=skills_json,
        category=category,
        future_opps=future_opps,
        max_applicants=parsed_max,
    )
    db.session.add(opp)
    db.session.commit()

    return ok({"opportunity": opp.to_dict()}, 201)


# ─────────────────────────── US-2.4  Get single opportunity ───────────────────
@app.route("/api/opportunities/<opp_id>", methods=["GET"])
@require_auth
def get_opportunity(opp_id):
    admin = current_admin()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin.id).first()
    if not opp:
        return bad("Opportunity not found.", 404)
    return ok({"opportunity": opp.to_dict()})


# ─────────────────────────── US-2.5  Edit opportunity ─────────────────────────
@app.route("/api/opportunities/<opp_id>", methods=["PUT"])
@require_auth
def update_opportunity(opp_id):
    import json as _json
    admin = current_admin()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin.id).first()
    if not opp:
        return bad("Opportunity not found or you do not have permission to edit it.", 404)

    data = request.get_json(silent=True) or {}

    name        = (data.get("name") or "").strip()
    duration    = (data.get("duration") or "").strip()
    start_date  = (data.get("start_date") or "").strip()
    description = (data.get("description") or "").strip()
    skills_raw  = (data.get("skills") or "").strip()
    category    = (data.get("category") or "").strip()
    future_opps = (data.get("future_opps") or "").strip()
    max_applicants = data.get("max_applicants")

    VALID_CATEGORIES = {"technology", "business", "design", "marketing", "data", "other"}

    errors = {}
    if not name:            errors["name"]        = "Opportunity name is required."
    if not duration:        errors["duration"]    = "Duration is required."
    if not start_date:      errors["start_date"]  = "Start date is required."
    if not description:     errors["description"] = "Description is required."
    if not skills_raw:      errors["skills"]      = "At least one skill is required."
    if not category:
        errors["category"] = "Category is required."
    elif category not in VALID_CATEGORIES:
        errors["category"] = f"Invalid category."
    if not future_opps:     errors["future_opps"] = "Future opportunities field is required."

    parsed_max = None
    if max_applicants is not None and max_applicants != "":
        try:
            parsed_max = int(max_applicants)
            if parsed_max < 0:
                errors["max_applicants"] = "Maximum applicants cannot be negative."
        except (ValueError, TypeError):
            errors["max_applicants"] = "Maximum applicants must be a whole number."

    if errors:
        return jsonify({"ok": False, "errors": errors}), 422

    skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]

    opp.name           = name
    opp.duration       = duration
    opp.start_date     = start_date
    opp.description    = description
    opp.skills         = _json.dumps(skills_list)
    opp.category       = category
    opp.future_opps    = future_opps
    opp.max_applicants = parsed_max
    db.session.commit()

    return ok({"opportunity": opp.to_dict()})


# ─────────────────────────── US-2.6  Delete opportunity ───────────────────────
@app.route("/api/opportunities/<opp_id>", methods=["DELETE"])
@require_auth
def delete_opportunity(opp_id):
    admin = current_admin()
    opp = Opportunity.query.filter_by(id=opp_id, admin_id=admin.id).first()
    if not opp:
        return bad("Opportunity not found or you do not have permission to delete it.", 404)
    db.session.delete(opp)
    db.session.commit()
    return ok({"message": "Opportunity deleted successfully."})


# ─────────────────────────── init db & run ────────────────────────────────────
with app.app_context():
    db.create_all()

if __name__ == "__main__":
    app.run(debug=True, port=5000)