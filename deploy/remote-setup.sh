#!/bin/bash
set -e

echo "==> Setting up nginx..."
cp /opt/playwright-user-sys/deploy/nginx-playwright.conf /etc/nginx/sites-available/playwright
ln -sf /etc/nginx/sites-available/playwright /etc/nginx/sites-enabled/playwright
nginx -t
nginx -s reload
echo "Nginx OK"

echo "==> Creating log directory..."
touch /var/log/pw-manager-out.log /var/log/pw-manager-error.log 2>/dev/null || true

echo "==> Starting PM2..."
cd /opt/playwright-user-sys
pm2 delete pw-manager 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "==> Deploy complete!"
echo "==> Manager: http://$(hostname -I | awk '{print $1}'):3200"
echo "==> Login: admin / admin123"
