#!/bin/bash
cp /opt/playwright-user-sys/deploy/jianli-with-playwright.conf /etc/nginx/conf.d/jianli.conf
nginx -t
nginx -s reload
echo "DONE"
