# VM deployment for full stack

This folder contains a one-shot script and templates to deploy the current VibErrands stack on an Ubuntu VM:
- PostgreSQL (Docker)
- FastAPI backend (systemd + Gunicorn)
- React frontend (built and served by Nginx)

## Files
- `deploy_auth.sh`: installs dependencies, starts PostgreSQL container, builds frontend, configures backend env, configures systemd and Nginx.
- `viberrands-auth.service.template`: reference systemd unit.
- `nginx.viberrands-auth.conf.template`: reference Nginx server block.

## Prerequisites
- Ubuntu 22.04+ VM
- Domain DNS A-record pointing to VM IP (for production)
- Project already cloned to `/opt/viberrands` (or set `PROJECT_ROOT`)

## Quick start (IP-based)
```bash
cd /opt/viberrands
sudo chmod +x deploy/vm/deploy_auth.sh
sudo DOMAIN=10.93.26.73 \
  PUBLIC_ORIGIN=http://10.93.26.73 \
  CORS_ORIGINS=http://10.93.26.73 \
  JWT_SECRET_KEY='replace-with-strong-random-secret' \
  DB_PASSWORD='replace-db-password' \
  bash deploy/vm/deploy_auth.sh
```

After deploy:
- Frontend: `http://10.93.26.73`
- Backend health: `http://10.93.26.73/health`
- Auth API: `http://10.93.26.73/auth/...`
- Tasks API: `http://10.93.26.73/tasks/...`

## With TLS (domain-based)
```bash
sudo ENABLE_TLS=true \
  LETSENCRYPT_EMAIL=you@example.com \
  DOMAIN=api.your-domain.com \
  PUBLIC_ORIGIN=https://api.your-domain.com \
  CORS_ORIGINS=https://api.your-domain.com \
  JWT_SECRET_KEY='replace-with-strong-random-secret' \
  DB_PASSWORD='replace-db-password' \
  bash deploy/vm/deploy_auth.sh
```

## Important variables
- `PROJECT_ROOT` default: `/opt/viberrands`
- `BACKEND_DIR` default: `$PROJECT_ROOT/backend`
- `FRONTEND_DIR` default: `$PROJECT_ROOT/frontend`
- `DOMAIN` default: `10.93.26.73`
- `PUBLIC_ORIGIN` default: `http://$DOMAIN`
- `API_BASE_URL` default: `$PUBLIC_ORIGIN`
- `CORS_ORIGINS` default: `$PUBLIC_ORIGIN`
- `DB_NAME` default: `viberrands`
- `TASKS_DB_NAME` default: `${DB_NAME}_tasks`
- `DB_USER` default: `postgres`
- `DB_PASSWORD` default: `postgres`
- `JWT_SECRET_KEY` default: `change-me-in-env`
- `ACCESS_TOKEN_EXPIRE_MINUTES` default: `60`
- `WORKERS` default: `2`
- `ENABLE_TLS` default: `false`
- `LETSENCRYPT_EMAIL` required only when `ENABLE_TLS=true`

## Verify
```bash
curl http://10.93.26.73/health
sudo systemctl status viberrands-auth --no-pager
sudo docker compose ps
```

## Notes
- Script is idempotent for repeated runs in most cases.
- Replace default secrets and DB password before exposing publicly.
- Keep PostgreSQL unexposed externally unless required.
