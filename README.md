# VibErrands

Auth-first release baseline for VibErrands.

## Stack
- Backend: FastAPI + Python + SQLAlchemy
- Database: PostgreSQL
- Frontend: React (Vite)

## Implemented now
- Registration with `telegram handle` (`@username`) + `password`
- Login with JWT access token
- Protected endpoint: get current user profile
- Frontend pages: register, login, profile, logout
- PostgreSQL setup with `users` table

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

## Next phase (not implemented in this step)
- Task CRUD and statuses (`open`, `in_work`, `done`)
- LLM-based suggested tags flow before task creation
- Accept task / mark in work / creator marks done
