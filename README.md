# CertifyMe — Admin Portal

A Flask-based admin portal for managing certification opportunities. Admins can sign up, log in, and perform full CRUD operations on opportunities.

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | Python 3.12+, Flask 3.x             |
| Database | SQLite (dev) via Flask-SQLAlchemy   |
| Auth     | Server-side sessions (Werkzeug)     |
| Frontend | Vanilla HTML/CSS/JS (single folder) |

---

## Project Structure

```
your-project/
├── app.py            # Flask app — routes, auth, opportunity API
├── database.py       # SQLAlchemy models (Admin, Opportunity, PasswordResetToken)
├── admin.html        # Frontend UI
├── admin.css         # Styles
├── admin.js          # Frontend logic
├── api.js            # Fetch-based API integration layer
├── requirements.txt  # Python dependencies
└── certifyme.db      # SQLite database (auto-created on first run)
```

---

## Setup & Running

### 1. Clone / place all files in one folder

```bash
your-project/
├── app.py
├── database.py
├── admin.html
├── admin.css
├── admin.js
├── api.js
└── requirements.txt
```

### 2. Create a virtual environment

```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

```bash
python app.py
```

### 5. Open the app

```
http://localhost:5000
```

> **Important:** Always access the app via `http://localhost:5000`, never by double-clicking `admin.html`. Opening from `file://` breaks session cookies and causes 401 errors on all API calls.

---

## Environment Variables

| Variable     | Default                            | Description                        |
|--------------|------------------------------------|------------------------------------|
| `SECRET_KEY` | `dev-secret-change-in-production`  | Flask session signing key          |
| `DATABASE_URL` | `sqlite:///certifyme.db`         | SQLAlchemy database URI            |

For production, always set a strong `SECRET_KEY`:

```bash
export SECRET_KEY="your-random-secret-here"
python app.py
```

---

## API Reference

### Auth

| Method | Endpoint                      | Description                  | Auth Required |
|--------|-------------------------------|------------------------------|---------------|
| POST   | `/api/auth/signup`            | Create a new admin account   | No            |
| POST   | `/api/auth/login`             | Log in, start session        | No            |
| POST   | `/api/auth/logout`            | End session                  | No            |
| GET    | `/api/auth/me`                | Get current session info     | Yes           |
| POST   | `/api/auth/forgot-password`   | Request a password reset     | No            |
| POST   | `/api/auth/reset-password`    | Consume token, set new password | No         |

### Opportunities

All opportunity endpoints require an active login session.

| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | `/api/opportunities`            | List all opportunities       |
| POST   | `/api/opportunities`            | Create a new opportunity     |
| GET    | `/api/opportunities/<id>`       | Get a single opportunity     |
| PUT    | `/api/opportunities/<id>`       | Edit an opportunity          |
| DELETE | `/api/opportunities/<id>`       | Delete an opportunity        |

#### Opportunity payload (POST / PUT)

```json
{
  "name": "Data Science Internship",
  "duration": "3 months",
  "start_date": "2026-07-01",
  "description": "Work with real datasets...",
  "skills": "Python, Pandas, SQL",
  "category": "data",
  "future_opps": "Full-time role consideration",
  "max_applicants": 20
}
```

Valid categories: `technology`, `business`, `design`, `marketing`, `data`, `other`.

---

## Database Models

### Admin
| Column          | Type    | Notes                  |
|-----------------|---------|------------------------|
| `id`            | String  | UUID primary key       |
| `full_name`     | String  |                        |
| `email`         | String  | Unique, indexed        |
| `password_hash` | String  | Werkzeug hashed        |
| `created_at`    | DateTime|                        |

### Opportunity
| Column          | Type    | Notes                        |
|-----------------|---------|------------------------------|
| `id`            | String  | UUID primary key             |
| `admin_id`      | String  | FK → admins.id               |
| `name`          | String  |                              |
| `duration`      | String  |                              |
| `start_date`    | String  | ISO date string              |
| `description`   | Text    |                              |
| `skills`        | Text    | JSON array stored as string  |
| `category`      | String  |                              |
| `future_opps`   | Text    |                              |
| `max_applicants`| Integer | Optional                     |
| `created_at`    | DateTime|                              |

### PasswordResetToken
| Column      | Type    | Notes                    |
|-------------|---------|--------------------------|
| `id`        | String  | UUID primary key         |
| `admin_id`  | String  | FK → admins.id           |
| `token`     | String  | Unique, URL-safe         |
| `expires_at`| DateTime| 1 hour from creation     |
| `used`      | Boolean | Consumed after one use   |

---

## Production Checklist

- Set a strong `SECRET_KEY` environment variable
- Switch `SESSION_COOKIE_SECURE = True` (requires HTTPS)
- Replace SQLite with PostgreSQL via `DATABASE_URL`
- Implement real email delivery for password reset tokens
- Run behind a production WSGI server (Gunicorn, uWSGI)
