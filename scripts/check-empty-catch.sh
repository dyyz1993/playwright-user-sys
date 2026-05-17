#!/usr/bin/env bash
set -euo pipefail

MAX_ALLOWED=4

COUNT=$(grep -rnE 'catch\s*\([^)]*\)\s*\{\s*\}' src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ' || true)
COUNT2=$(grep -rnE '\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}' src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ' || true)
TOTAL=$((COUNT + COUNT2))

if [ "$TOTAL" -gt "$MAX_ALLOWED" ]; then
  echo "❌ Empty catch blocks ($TOTAL) exceed limit ($MAX_ALLOWED)"
  echo "   Add error logging or proper handling"
  exit 1
fi
