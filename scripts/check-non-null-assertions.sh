#!/usr/bin/env bash
set -euo pipefail

MAX_ALLOWED=25

COUNT=$(grep -rnE '!\.(!|\w)|!\[!' src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | grep -v "// " | wc -l | tr -d ' ' || true)

if [ "$COUNT" -gt "$MAX_ALLOWED" ]; then
  echo "❌ Non-null assertions ($COUNT) exceed limit ($MAX_ALLOWED)"
  echo "   Replace 'expr!' with proper null guards"
  exit 1
fi
