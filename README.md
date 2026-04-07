# VibErrands

VibErrands is a full-stack errand marketplace where users create tasks, reserve rewards, take tasks, complete/cancel tasks, and track all balance changes in history.

## What is implemented

- JWT auth (`/auth/register`, `/auth/login`, `/auth/me`)
- Separate PostgreSQL databases:
  - auth DB (`users`, `user_history`)
  - tasks DB (`tasks`, `tags`, `task_activities`, `task_subscriptions`)
- Task lifecycle:
  - create task (reward is reserved from creator balance)
  - take task
  - complete task (reward goes to assignee)
  - cancel task (reserved reward is refunded to creator)
- Task feed and dedicated pages:
  - open feed
  - taken tasks
  - given tasks
- Profile features:
  - balance, created/finished counters
  - merged history timeline with filters
  - tracked alerts (tags, difficulty, minimum reward)
- Admin actions (for users with `is_admin=true`):
  - remove task (with creator refund)
  - increment/decrement user balance
  - increment all balances with message
  - add/remove admin
  - broadcast message to all users (saved in history)
- Telegram bot integration:
  - username confirmation bonus
  - task subscriptions
  - take task from bot
  - Telegram notifications for matching tasks and task-taking events
- UI features:
  - light/dark theme toggle
  - bottom-right popup notifications
  - balance display and profile quick actions

## Stack

- Backend: FastAPI, SQLAlchemy 2, Pydantic, Uvicorn/Gunicorn
- Frontend: React 18, React Router, Vite
- Database: PostgreSQL 16 (Docker Compose)
- Reverse proxy / static hosting (VM): Nginx

## Repository structure

- `backend/` - FastAPI service
- `frontend/` - React app
- `bot/` - Telegram bot client
- `db/` - DB bootstrap and destructive reset scripts
- `deploy/vm/` - one-shot VM deployment script and docs
- `docker-compose.yml` - local PostgreSQL container

## Local development

### 1) Start PostgreSQL

```bash
docker compose up -d db
```

This creates/uses:
- auth DB: `viberrands`
- tasks DB: `viberrands_tasks`

### 2) Run backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# Linux/macOS
# source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env  # Windows
# cp .env.example .env  # Linux/macOS
uvicorn app.main:app --reload --port 8000
```

Backend runs on `http://localhost:8000`.

### 3) Run frontend

```bash
cd frontend
npm install
# Windows PowerShell
$env:VITE_API_BASE_URL="http://localhost:8000"
npm run dev
```

Frontend runs on `http://localhost:5173`.

### 4) (Optional) Run Telegram bot

```bash
cd bot
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
# Linux/macOS
# source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env  # Windows
# cp .env.example .env  # Linux/macOS
python main.py
```

## VM deployment (Ubuntu)

Use `deploy/vm/deploy.sh` for full-stack deployment (Docker DB + backend systemd + frontend build + Nginx):

```bash
cd /opt/se-toolkit-hackathon
sudo chmod +x deploy/vm/deploy.sh
sudo DOMAIN=10.93.26.73 \
  PUBLIC_ORIGIN=http://10.93.26.73 \
  CORS_ORIGINS=http://10.93.26.73 \
  JWT_SECRET_KEY='replace-with-strong-random-secret' \
  ADMIN_PASSWORD='replace-admin-password' \
  DB_PASSWORD='replace-db-password' \
  bash deploy/vm/deploy.sh
```

See full deployment options in `deploy/vm/README.md`.

## Clean reset (destructive)

`db/reset_everything.sh` fully recreates auth and tasks databases (removes users/tasks/history):

```bash
cd /opt/se-toolkit-hackathon
sudo chmod +x db/reset_everything.sh
sudo CONFIRM=YES bash db/reset_everything.sh
```

## Important environment variables

Backend (`backend/.env`):
- `DATABASE_URL` - auth database URL
- `TASKS_DATABASE_URL` - tasks database URL
- `JWT_SECRET_KEY` - JWT signing key
- `CORS_ORIGINS` - allowed frontend origins (comma-separated)
- `TELEGRAM_BOT_TOKEN` - optional Telegram token for notifications
- `TELEGRAM_BOT_SECRET` - shared secret for `/bot/*` backend endpoints
- `SITE_URL` - URL used in Telegram button links

Frontend build/runtime:
- `VITE_API_BASE_URL` - backend base URL used by frontend API calls

## API summary

Base path locally: no prefix (for example `/auth/login`).

Behind VM Nginx: frontend uses `/api/*`, Nginx rewrites to backend root.

Core routes:
- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
  - `GET /auth/history`
- Tasks:
  - `GET /tasks`
  - `POST /tasks`
  - `GET /tasks/{task_id}`
  - `POST /tasks/{task_id}/take`
  - `POST /tasks/{task_id}/complete`
  - `POST /tasks/{task_id}/cancel`
  - `GET /tasks/taken`
  - `GET /tasks/given`
  - `GET /tasks/history`
  - `GET /tasks/tracking`
  - `PUT /tasks/tracking`
- Admin:
  - `GET /admin/verify`
  - `POST /admin/task/remove`
  - `POST /admin/balance/increment-user`
  - `POST /admin/balance/increment-all`
  - `POST /admin/balance/decrement-user`
  - `POST /admin/add-admin`
  - `POST /admin/remove-admin`
  - `POST /admin/notify-all`
- Bot (protected by `X-Bot-Secret`):
  - `POST /bot/start`
  - `POST /bot/confirm-username`
  - `POST /bot/subscribe`
  - `GET /bot/subscriptions/{telegram_username}`
  - `POST /bot/take-task/{task_id}`

## Notes

- `@DirectorOfSweetLife` is automatically marked as admin at registration.
- `ADMIN_PASSWORD` is currently present in deploy/env config for compatibility, while admin API authorization is based on authenticated user role (`is_admin`).
- Rewards are integer points (`reward > 0`).
- Task description must be at least 5 characters.

## Quick health check

```bash
curl http://localhost:8000/health
```
