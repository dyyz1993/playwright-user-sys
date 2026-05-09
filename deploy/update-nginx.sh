#!/bin/bash
cp /opt/playwright-user-sys/deploy/nginx-playwright.conf /etc/nginx/sites-available/default
nginx -t
nginx -s reload
echo "NGINX_OK"
