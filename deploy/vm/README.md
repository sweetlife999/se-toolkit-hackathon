# VM deployment for auth service

This folder contains a one-shot script and templates to deploy the current auth-only VibErrands backend on an Ubuntu VM.

## Files
- `deploy_auth.sh`: installs dependencies, starts PostgreSQL container, configures backend env, configures systemd and Nginx.
- `viberrands-auth.service.template`: reference systemd unit.
- `nginx.viberrands-auth.conf.template`: reference Nginx server block.

## Prerequisites
- Ubuntu 22.04+ VM
- Domain DNS A-record pointing to VM IP (for production)
- Project already cloned to `/opt/viberrands` (or set `PROJECT_ROOT`)

## Quick start
```bash
cd /opt/viberrands
sudo chmod +x deploy/vm/deploy_auth.sh
sudo DOMAIN=api.your-domain.com \
  CORS_ORIGINS=https://app.your-domain.com \
  JWT_SECRET_KEY='replace-with-strong-random-secret' \
  DB_PASSWORD='replace-db-password' \
  bash deploy/vm/deploy_auth.sh
```

## With TLS
```bash
sudo ENABLE_TLS=true \
  LETSENCRYPT_EMAIL=you@example.com \
  DOMAIN=api.your-domain.com \
  CORS_ORIGINS=https://app.your-domain.com \
  JWT_SECRET_KEY='replace-with-strong-random-secret' \
  DB_PASSWORD='replace-db-password' \
  bash deploy/vm/deploy_auth.sh
```

## Important variables
- `PROJECT_ROOT` default: `/opt/viberrands`
- `BACKEND_DIR` default: `$PROJECT_ROOT/backend`
- `DOMAIN` default: `api.example.com`
- `CORS_ORIGINS` default: `https://app.example.com`
- `DB_NAME` default: `viberrands`
- `DB_USER` default: `postgres`
- `DB_PASSWORD` default: `postgres`
- `JWT_SECRET_KEY` default: `change-me-in-env`
- `ACCESS_TOKEN_EXPIRE_MINUTES` default: `60`
- `WORKERS` default: `2`
- `ENABLE_TLS` default: `false`
- `LETSENCRYPT_EMAIL` required only when `ENABLE_TLS=true`

## Verify
```bash
curl http://api.your-domain.com/health
sudo systemctl status viberrands-auth --no-pager
sudo docker compose ps
```

## Notes
- Script is idempotent for repeated runs in most cases.
- Replace default secrets and DB password before exposing publicly.
- Keep PostgreSQL unexposed externally unless required.
