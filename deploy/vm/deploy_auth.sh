#!/usr/bin/env bash
set -euo pipefail

# One-shot deployment for VibErrands auth service on Ubuntu VM.
# Run as root: sudo bash deploy/vm/deploy_auth.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash deploy/vm/deploy_auth.sh"
  exit 1
fi

PROJECT_ROOT="${PROJECT_ROOT:-/opt/viberrands}"
BACKEND_DIR="${BACKEND_DIR:-${PROJECT_ROOT}/backend}"
DOMAIN="${DOMAIN:-api.example.com}"
CORS_ORIGINS="${CORS_ORIGINS:-https://app.example.com}"
DB_NAME="${DB_NAME:-viberrands}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-in-env}"
ACCESS_TOKEN_EXPIRE_MINUTES="${ACCESS_TOKEN_EXPIRE_MINUTES:-60}"
WORKERS="${WORKERS:-2}"
ENABLE_TLS="${ENABLE_TLS:-false}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

if [[ ! -d "${PROJECT_ROOT}" ]]; then
  echo "Project root not found: ${PROJECT_ROOT}"
  echo "Clone your repo there first."
  exit 1
fi

if [[ ! -f "${BACKEND_DIR}/requirements.txt" ]]; then
  echo "Backend requirements not found: ${BACKEND_DIR}/requirements.txt"
  exit 1
fi

echo "[1/8] Installing OS dependencies"
apt update
apt install -y python3 python3-venv python3-pip nginx docker.io docker-compose-plugin curl
systemctl enable --now docker

echo "[2/8] Starting PostgreSQL container"
cd "${PROJECT_ROOT}"
docker compose up -d db

echo "[3/8] Preparing backend virtual environment"
cd "${BACKEND_DIR}"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

echo "[4/8] Writing production backend environment file"
cat > "${BACKEND_DIR}/.env" <<EOF
DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES}
CORS_ORIGINS=${CORS_ORIGINS}
EOF

echo "[5/8] Installing systemd service"
cat > /etc/systemd/system/viberrands-auth.service <<EOF
[Unit]
Description=VibErrands Auth API
After=network.target docker.service
Requires=docker.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=${BACKEND_DIR}
Environment=PATH=${BACKEND_DIR}/.venv/bin
ExecStart=${BACKEND_DIR}/.venv/bin/gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 127.0.0.1:8000 --workers ${WORKERS}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now viberrands-auth

echo "[6/8] Installing Nginx reverse proxy"
cat > /etc/nginx/sites-available/viberrands-auth <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/viberrands-auth /etc/nginx/sites-enabled/viberrands-auth
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[7/8] Configuring firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 'Nginx Full' || true
  ufw --force enable || true
fi

echo "[8/8] Optional TLS setup"
if [[ "${ENABLE_TLS}" == "true" ]]; then
  if [[ -z "${LETSENCRYPT_EMAIL}" ]]; then
    echo "ENABLE_TLS=true but LETSENCRYPT_EMAIL is empty"
    exit 1
  fi
  apt install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect
fi

echo
echo "Deployment complete."
echo "Health check: curl http://${DOMAIN}/health"
echo "Service status: systemctl status viberrands-auth --no-pager"
