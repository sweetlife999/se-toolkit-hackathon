# VibErrands

Auth-first release baseline for VibErrands, now extended with the first task lifecycle.

## Stack
- Backend: FastAPI + Python + SQLAlchemy
- Database: PostgreSQL
- Frontend: React (Vite)

## Implemented now
- Registration with `telegram handle` (`@username`) + `password`
- Login with JWT access token
- Protected endpoint: get current user profile
- Frontend pages: register, login, profile, logout
- PostgreSQL setup with `users` table and a separate tasks database

## Project structure
- `backend/` FastAPI service
- `frontend/` React app
- `db/` SQL bootstrap scripts
- `docker-compose.yml` PostgreSQL container

## Run the database
```bash
docker compose up -d db
```

## Run backend
```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Run frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173` and expects backend at `http://localhost:8000`.

## API quick check
- `POST /auth/register`
```json
{
  "telegram_username": "@my_telegram",
  "password": "secret123"
}
```

- `POST /auth/login` as form data (`username`, `password`)
- `GET /auth/me` with `Authorization: Bearer <token>`
- `GET /tasks` with `Authorization: Bearer <token>`
- `POST /tasks` with `Authorization: Bearer <token>`
- `POST /tasks/{task_id}/take` with `Authorization: Bearer <token>`
- `POST /tasks/{task_id}/complete` with `Authorization: Bearer <token>`

## Current task flow
- Create task with description, price, estimated minutes, mode, and tags
- Browse open tasks with filters by mode and tag
- Take a task into work
- Creator marks the task as done

## Environment
- `DATABASE_URL` points to the auth database
- `TASKS_DATABASE_URL` points to the tasks database
- `VITE_API_BASE_URL` controls frontend API calls
