#!/usr/bin/env bash
set -euo pipefail

MAX_ALLOWED=15

COUNT=$(grep -rnE '@ts-ignore|@ts-expect-error' src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ' || true)

if [ "$COUNT" -gt "$MAX_ALLOWED" ]; then
  echo "❌ @ts-ignore/@ts-expect-error ($COUNT) exceed limit ($MAX_ALLOWED)"
  echo "   Fix the underlying type errors instead of suppressing"
  exit 1
fi
