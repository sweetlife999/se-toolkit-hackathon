#!/usr/bin/env bash
set -euo pipefail

# One-shot deployment for VibErrands full stack on Ubuntu VM.
# Run as root: sudo bash deploy/vm/deploy_auth.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root: sudo bash deploy/vm/deploy_auth.sh"
  exit 1
fi

PROJECT_ROOT="${PROJECT_ROOT:-/opt/viberrands}"
BACKEND_DIR="${BACKEND_DIR:-${PROJECT_ROOT}/backend}"
FRONTEND_DIR="${FRONTEND_DIR:-${PROJECT_ROOT}/frontend}"
DOMAIN="${DOMAIN:-10.93.26.73}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://${DOMAIN}}"
API_BASE_URL="${API_BASE_URL:-}"
CORS_ORIGINS="${CORS_ORIGINS:-${PUBLIC_ORIGIN}}"
DB_NAME="${DB_NAME:-viberrands}"
TASKS_DB_NAME="${TASKS_DB_NAME:-${DB_NAME}_tasks}"
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

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "Frontend package.json not found: ${FRONTEND_DIR}/package.json"
  exit 1
fi

if [[ -z "${API_BASE_URL}" ]]; then
  API_BASE_URL="${PUBLIC_ORIGIN}"
fi

echo "[1/10] Installing OS dependencies"
apt update
apt install -y python3 python3-venv python3-pip nginx docker.io docker-compose-plugin curl ca-certificates gnupg
systemctl enable --now docker

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

echo "[2/10] Starting PostgreSQL container"
cd "${PROJECT_ROOT}"
docker compose up -d db

echo "Waiting for PostgreSQL to become ready"
for _ in {1..30}; do
  if docker compose exec -T db pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! docker compose exec -T db pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
  echo "PostgreSQL did not become ready in time"
  exit 1
fi

if ! docker compose exec -T db psql -U "${DB_USER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${TASKS_DB_NAME}'" | grep -q 1; then
  echo "Creating tasks database: ${TASKS_DB_NAME}"
  docker compose exec -T db psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE \"${TASKS_DB_NAME}\""
fi

echo "[3/10] Preparing backend virtual environment"
cd "${BACKEND_DIR}"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn

echo "[4/10] Writing production backend environment file"
cat > "${BACKEND_DIR}/.env" <<EOF
DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
TASKS_DATABASE_URL=postgresql+psycopg2://${DB_USER}:${DB_PASSWORD}@localhost:5432/${TASKS_DB_NAME}
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES}
CORS_ORIGINS=${CORS_ORIGINS}
EOF

echo "[5/10] Installing systemd service"
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
systemctl enable viberrands-auth
systemctl restart viberrands-auth

echo "[6/10] Building frontend"
cd "${FRONTEND_DIR}"
if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi
VITE_API_BASE_URL="${API_BASE_URL}" npm run build

echo "[7/10] Installing frontend assets"
rm -rf /var/www/viberrands
mkdir -p /var/www/viberrands
cp -r "${FRONTEND_DIR}/dist/." /var/www/viberrands/
chown -R www-data:www-data /var/www/viberrands

echo "[8/10] Installing Nginx full-stack config"
cat > /etc/nginx/sites-available/viberrands-auth <<EOF
server {
    listen 80;
  server_name ${DOMAIN} _;

  root /var/www/viberrands;
  index index.html;

  location /auth/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /tasks {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location /health {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

    location / {
    try_files \$uri /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/viberrands-auth /etc/nginx/sites-enabled/viberrands-auth
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[9/10] Configuring firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 'Nginx Full' || true
  ufw --force enable || true
fi

echo "[10/10] Optional TLS setup"
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
echo "Frontend: ${PUBLIC_ORIGIN}"
echo "Health check: curl ${PUBLIC_ORIGIN}/health"
echo "Service status: systemctl status viberrands-auth --no-pager"
