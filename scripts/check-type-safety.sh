#!/usr/bin/env bash
set -euo pipefail

# ============================================
# 类型安全门禁脚本
# 用途: 检查 src/ 中 any/unknown 类型使用数量
# 规则: 当前总数不得超过 MAX_ALLOWED (只减不增)
# ============================================

# 最大允许数量（当前基线: 248，后续只减不增）
MAX_ALLOWED=248

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "═══════════════════════════════════════════════"
echo "  🔍 类型安全检查 — any / unknown 数量限制"
echo "═══════════════════════════════════════════════"
echo ""

# 统计各类型数量
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"

COLON_ANY=$(grep -rnE ": any\b" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ')
AS_ANY=$(grep -rnE "as any\b" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ')
ANGLE_ANY=$(grep -rnE "<any>" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ')
UNKNOWN=$(grep -rnE ": unknown\b" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l | tr -d ' ')

TOTAL=$((COLON_ANY + AS_ANY + ANGLE_ANY + UNKNOWN))

# 显示统计
echo -e "  ${CYAN}: any${NC}        = ${COLON_ANY}"
echo -e "  ${CYAN}as any${NC}       = ${AS_ANY}"
echo -e "  ${CYAN}<any>${NC}        = ${ANGLE_ANY}"
echo -e "  ${CYAN}: unknown${NC}    = ${UNKNOWN}"
echo ""
echo -e "  ${YELLOW}总数${NC}         = ${TOTAL}"
echo -e "  ${YELLOW}上限${NC}         = ${MAX_ALLOWED}"
echo ""

# TOP 5 文件
echo "  📊 TOP 5 文件:"
grep -rnE "(: any\b|as any\b|: unknown\b|<any>)" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | sed 's/:.*//' | sort | uniq -c | sort -rn | head -5 | while read count file; do
  echo -e "    ${RED}${count}${NC}  ${file}"
done
echo ""

# 判定
if [ "$TOTAL" -gt "$MAX_ALLOWED" ]; then
  echo -e "  ${RED}❌ 失败: any/unknown 数量 (${TOTAL}) 超过上限 (${MAX_ALLOWED})${NC}"
  echo ""
  echo "  请修复以下文件中的类型:"
  grep -rnE "(: any\b|as any\b|: unknown\b|<any>)" src/ --include="*.ts" | grep -v node_modules | grep -v ".test." | head -20 | while IFS=: read file line code; do
    echo -e "    ${CYAN}${file}:${line}${NC} ${code}"
  done
  echo ""
  echo "  💡 如果修复后总数减少，请更新 scripts/check-type-safety.sh 中的 MAX_ALLOWED 为新值"
  echo ""
  exit 1
elif [ "$TOTAL" -lt "$MAX_ALLOWED" ]; then
  SAVED=$((MAX_ALLOWED - TOTAL))
  echo -e "  ${GREEN}✅ 通过: any/unknown 数量 (${TOTAL}) 在上限 (${MAX_ALLOWED}) 以内${NC}"
  echo -e "  ${GREEN}   🎉 比上限少 ${SAVED} 个，做得好！${NC}"
  echo -e "  ${GREEN}   💡 建议更新 MAX_ALLOWED 为 ${TOTAL} 以锁定改进${NC}"
  echo ""
else
  echo -e "  ${YELLOW}✅ 通过: any/unknown 数量 (${TOTAL}) 刚好等于上限 (${MAX_ALLOWED})${NC}"
  echo -e "  ${YELLOW}   ⚠️ 无法新增 any 类型，请使用具体类型${NC}"
  echo ""
fi
