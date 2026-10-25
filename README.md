# My Period Kit Insights Portal

Version 0.2.0

A Django REST Framework + React/TypeScript programme reporting portal with a responsive pink-and-white interface, a public landing page, staff login, role-based reports, visualisations, and geographic insights.

The portal does not create or store source metrics. It retrieves them from the existing My Period Kit metrics service through Django. External API credentials must never be stored in React.

## Requirements

- macOS and PyCharm (or another suitable development environment)
- Python 3.11+ and Node.js 20.19+ or 22+
- Valid `METRICS_USERNAME` and `METRICS_PASSWORD` provided by the metrics service administrator
- A reachable upstream API endpoint, ideally over HTTPS or an encrypted private tunnel

## First-time setup in PyCharm (macOS)

Extract the archive as `periodkit-insights-starter` in `~/Documents/Project`, and open **that folder** in PyCharm.

### Terminal 1: Django

```bash
cd ~/Documents/Project/periodkit-insights-starter
python3 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(50))'
```

Open `backend/.env` and set `DJANGO_SECRET_KEY`, `METRICS_USERNAME` and `METRICS_PASSWORD`. The upstream credentials are different from your staff account password. Keep `.env` private. If you have already set up the project, **do not recreate or overwrite `.env`**.

```bash
python manage.py check
python manage.py migrate
python manage.py setup_roles
python manage.py createsuperuser
python manage.py runserver 127.0.0.1:8000
```

Leave this terminal running.

### Terminal 2: React

```bash
cd ~/Documents/Project/periodkit-insights-starter/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173 and sign in with your Django superuser credentials. The development frontend proxies `/api/` to the Django backend on port 8000.

### Existing installation: apply the UI patch

The separate `periodkit-insights-ui-v0.2.0-patch.zip` archive contains only changed frontend files and UI instructions. See `README-UI-UPDATE.md` in the patch. This is the preferred update method for a working local project because your `.env`, SQLite database and administrator account remain in place.

## Pages and responsive layout

- Landing: project introduction, staff sign-in, programme messaging and visual identity.
- Login: staff credentials and accessible password visibility control.
- Overview: summary metrics, engagement charts, location/language charts, and summary CSV export.
- Geographic reach: approximate mapped city locations and source-reported location distribution.
- User records: administrator-only searchable, horizontally scrollable table.
- Source unavailable: a clear connection status and empty report placeholders, without made-up data.

At narrower viewports, the fixed sidebar becomes a mobile drawer, KPI cards reflow, charts stack, navigation adapts, and user tables scroll horizontally. Main style tokens and breakpoints are in `frontend/src/style.css`.

## Roles

| Role | Overview | Geography | Individual user records | Summary CSV | Bypass metrics cache |
| --- | --- | --- | --- | --- | --- |
| admin | Yes | Yes | Yes | Yes | Yes |
| analyst | Yes | Yes | No | Yes | No |
| viewer | Yes | Yes | No | Yes | No |

Create staff accounts using Django's admin page at http://127.0.0.1:8000/django-admin/ and assign exactly one group: `admin`, `analyst`, or `viewer`. A superuser is automatically treated as an admin. There is no public self-registration page.

## API integration

Django calls the upstream endpoint configured in `backend/.env` using HTTP Basic Auth. React never receives those credentials. The portal uses these Django endpoints:

- `POST /api/auth/login/` for portal login
- `GET /api/auth/me/` for current user and role
- `POST /api/auth/logout/` to revoke portal token
- `GET /api/metrics/overview/` for summaries, charts and aggregates
- `GET /api/metrics/overview/?refresh=1` for admin cache bypass
- `GET /api/metrics/users/` for admin-only user records

### When the upstream service is unavailable

The dashboard remains accessible, but summary values and chart records will be shown as unavailable instead of displaying fictitious figures. This is expected until the source connection works.

The supplied upstream URL uses unencrypted HTTP on port 8000. HTTP Basic Authentication is not safe for real credentials and personal data over untrusted public networks. Require HTTPS or an encrypted private connection from the upstream administrator before handling real confidential records. Do not disable TLS verification in production.

The application currently validates the upstream URL against a small approved-host allowlist in `backend/metrics/service.py`. If the source owner migrates the service to a new domain, update that allowlist only after verifying the domain and HTTPS configuration.

## Data handling

- Summary fields `registered`, `onboarded`, `users_chatting`, and `active_last_7d` are passed through from upstream.
- Chart breakdowns are derived from the `users` array, so they can differ from the source-level summary when coverage differs.
- Registration is grouped by UTC month of registration; it is not a historic month-end snapshot.
- The reported average response time is an unweighted mean across user rows with a value.
- City markers show approximate city centres from a static allowlist, never precise personal locations.
- User records are only available to admins; the summary export contains aggregate values only.
- No chat message content is retrieved. No upstream user data is persisted to SQLite. Django memory cache stores source responses briefly.

## Verification

```bash
cd ~/Documents/Project/periodkit-insights-starter/backend
source ../.venv/bin/activate
python manage.py check
python manage.py test

cd ../frontend
npm run build
```

The frontend build requires `npm install` to complete successfully. To preview layouts, test widths around 320px, 390px, 768px, 1024px and 1440px in Chrome's device toolbar. Verify the sidebar, login, charts, map and user table at each width.

## Production hardening

Move upstream access to HTTPS or an encrypted tunnel; use a production-grade Django deployment behind HTTPS; turn `DJANGO_DEBUG` off; set appropriate hosts and security headers; use shared caching, a managed database, token/session security, MFA and audited access. Consult applicable privacy and safeguarding requirements before collecting or using sensitive adolescent records.

## Visual identity

The existing pink-and-white portal style is preserved. The current heart/flower treatment is a temporary UI illustration and is not a claim to reproduce the project's official logo. The logo can be replaced when the approved brand asset is available.
