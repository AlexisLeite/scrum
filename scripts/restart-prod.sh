#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/root/repos/scrum"
LOG_DIR="$ROOT_DIR/logs/prod"
MEDIA_ROOT="$ROOT_DIR/shared/media"
SYSTEMD_UNIT_SOURCE="$ROOT_DIR/scripts/systemd/scrum-prod-api.service"
SYSTEMD_UNIT_TARGET="/etc/systemd/system/scrum-prod-api.service"
NGINX_CONFIG_SOURCE="$ROOT_DIR/scripts/nginx/scrum-ports.conf"
NGINX_CONFIG_TARGET="/etc/nginx/conf.d/scrum-ports.conf"

mkdir -p "$LOG_DIR" "$MEDIA_ROOT"
touch "$LOG_DIR/app.log" "$LOG_DIR/error.log"

# nginx needs execute permission on each parent directory to serve deploy/web from /root.
chmod o+x /root /root/repos /root/repos/scrum
find "$ROOT_DIR/deploy" -type d -exec chmod 755 {} +
find "$ROOT_DIR/deploy" -type f -exec chmod 644 {} +

install -m 0644 "$SYSTEMD_UNIT_SOURCE" "$SYSTEMD_UNIT_TARGET"
if [[ -d /etc/nginx/conf.d ]]; then
  install -m 0644 "$NGINX_CONFIG_SOURCE" "$NGINX_CONFIG_TARGET"
fi
systemctl daemon-reload
systemctl enable scrum-prod-api.service >/dev/null
systemctl restart scrum-prod-api.service

if command -v nginx >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
  nginx -t >/dev/null 2>&1
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl start nginx
  fi
fi

systemctl --no-pager --full status scrum-prod-api.service
