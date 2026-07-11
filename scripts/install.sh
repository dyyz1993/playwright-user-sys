#!/usr/bin/env bash
#
# Playwright User Sys — 裸机一键安装脚本
#
# 用法:
#   sudo bash scripts/install.sh                      # 自动检测发行版
#   sudo bash scripts/install.sh --distro=ubuntu      # 手动指定
#   sudo bash scripts/install.sh --repo-url=https://github.com/dyyz1993/playwright-user-sys.git
#   sudo bash scripts/install.sh --install-dir=/opt/playwright-user-sys
#   sudo bash scripts/install.sh --skip-chrome        # 跳过 Chrome 安装（已有 Chrome 时使用）
#
# 支持的发行版: ubuntu, debian, centos, rhel, rocky, fedora, amzn2 (Amazon Linux 2)
#
set -euo pipefail

# ============================================================
# 默认配置
# ============================================================
DISTRO=""
REPO_URL="https://github.com/dyyz1993/playwright-user-sys.git"
INSTALL_DIR="/opt/playwright-user-sys"
SKIP_CHROME=false
SKIP_BUILD=false
NODE_MAJOR=20

# ============================================================
# 颜色输出
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ============================================================
# 参数解析
# ============================================================
parse_args() {
  for arg in "$@"; do
    case "$arg" in
      --distro=*)        DISTRO="${arg#*=}" ;;
      --repo-url=*)      REPO_URL="${arg#*=}" ;;
      --install-dir=*)   INSTALL_DIR="${arg#*=}" ;;
      --skip-chrome)     SKIP_CHROME=true ;;
      --skip-build)      SKIP_BUILD=true ;;
      --help|-h)
        head -13 "$0"
        exit 0
        ;;
      *)
        warn "未知参数: $arg (忽略)"
        ;;
    esac
  done
}

# ============================================================
# 前置检查
# ============================================================
check_root() {
  if [[ $EUID -ne 0 ]]; then
    die "请使用 root 或 sudo 运行此脚本"
  fi
}

# ============================================================
# 发行版检测
# ============================================================
detect_distro() {
  if [[ -n "$DISTRO" ]]; then
    info "使用手动指定的发行版: $DISTRO"
    return
  fi

  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    local id="${ID:-}"
    local id_like="${ID_LIKE:-}"

    case "$id" in
      ubuntu)               DISTRO="ubuntu" ;;
      debian)               DISTRO="debian" ;;
      centos)               DISTRO="centos" ;;
      rhel)                 DISTRO="rhel" ;;
      rocky|rockylinux)     DISTRO="rocky" ;;
      almalinux)            DISTRO="rhel" ;;
      fedora)               DISTRO="fedora" ;;
      amzn)                 DISTRO="amzn2" ;;
      *)
        # 尝试通过 ID_LIKE 判断
        if echo "$id_like" | grep -qi debian; then
          DISTRO="debian"
        elif echo "$id_like" | grep -qi fedora; then
          DISTRO="fedora"
        elif echo "$id_like" | grep -qi rhel; then
          DISTRO="rhel"
        else
          die "无法识别的发行版: $id。请用 --distro=ubuntu|debian|centos|rhel|rocky|fedora 手动指定"
        fi
        ;;
    esac
  else
    die "找不到 /etc/os-release，无法检测发行版。请用 --distro= 手动指定"
  fi

  ok "检测到发行版: $DISTRO"
}

# 判断是否为 Debian 系（apt）
is_debian_family() {
  [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" ]]
}

# 判断是否为 RHEL 系（dnf/yum）
is_rhel_family() {
  [[ "$DISTRO" == "centos" || "$DISTRO" == "rhel" || "$DISTRO" == "rocky" || "$DISTRO" == "fedora" || "$DISTRO" == "amzn2" ]]
}

# ============================================================
# 步骤 1: 安装 Node.js
# ============================================================
install_node() {
  info "安装 Node.js ${NODE_MAJOR}.x ..."

  # 检查是否已安装且版本满足
  if command -v node &>/dev/null; then
    local current_version
    current_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$current_version" -ge "$NODE_MAJOR" ]]; then
      ok "Node.js $(node -v) 已安装，版本满足 >= ${NODE_MAJOR}"
      return
    else
      warn "Node.js $(node -v) 版本过低，将安装 ${NODE_MAJOR}.x"
    fi
  fi

  if is_debian_family; then
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null || true
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
  elif is_rhel_family; then
    if [[ "$DISTRO" == "amzn2" ]]; then
      curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -
      yum install -y nodejs
    else
      dnf install -y || true  # 确保 dnf 可用
      curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -
      dnf install -y nodejs
    fi
  fi

  ok "Node.js $(node -v) 安装完成"
}

# ============================================================
# 步骤 2: 安装 pnpm
# ============================================================
install_pnpm() {
  info "安装 pnpm ..."

  if command -v pnpm &>/dev/null; then
    ok "pnpm $(pnpm -v) 已安装"
    return
  fi

  npm install -g pnpm@10
  ok "pnpm $(pnpm -v) 安装完成"
}

# ============================================================
# 步骤 3: 安装 Google Chrome
# ============================================================
install_chrome() {
  if [[ "$SKIP_CHROME" == "true" ]]; then
    warn "跳过 Chrome 安装 (--skip-chrome)"
    return
  fi

  info "安装 Google Chrome ..."

  # 检查是否已安装
  if command -v google-chrome-stable &>/dev/null; then
    ok "Google Chrome 已安装: $(google-chrome-stable --version 2>/dev/null || echo '已存在')"
    return
  fi

  if is_debian_family; then
    apt-get install -y -qq wget gnupg
    wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    (dpkg -i /tmp/chrome.deb || apt-get install -y -f -qq) && rm -f /tmp/chrome.deb
  elif is_rhel_family; then
    if [[ "$DISTRO" == "amzn2" ]]; then
      yum install -y wget
      wget -q -O /tmp/chrome.rpm https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
      (yum install -y /tmp/chrome.rpm || yum install -y --skip-broken /tmp/chrome.rpm) && rm -f /tmp/chrome.rpm
    else
      dnf install -y wget
      wget -q -O /tmp/chrome.rpm https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
      (dnf install -y /tmp/chrome.rpm || dnf install -y --skip-broken /tmp/chrome.rpm) && rm -f /tmp/chrome.rpm
    fi
  fi

  ok "Google Chrome 安装完成"
}

# ============================================================
# 步骤 4: 安装 Chromium 运行所需的系统库
# ============================================================
install_chromium_deps() {
  info "安装 Chromium 运行时系统依赖 ..."

  if is_debian_family; then
    apt-get install -y -qq \
      xvfb dbus \
      fonts-freefont-ttf fonts-wqy-zenhei fonts-wqy-microhei fonts-noto-color-emoji \
      libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
      netcat-openbsd || true

  elif is_rhel_family; then
    local pkg_mgr
    if command -v dnf &>/dev/null; then
      pkg_mgr="dnf"
    else
      pkg_mgr="yum"
    fi

    # RHEL 系包名与 Debian 不同，需要映射
    $pkg_mgr install -y \
      xorg-x11-server-Xvfb dbus \
      google-noto-sans-cjk-fonts google-noto-emoji-colors-fonts wqy-zenhei-fonts wqy-microhei-fonts \
      glib2 nss atk at-spi2-atk cups-libs \
      libdrm libxkbcommon libXcomposite libXdamage libXext \
      libXfixes libXrandr libgbm pango cairo alsa-lib \
      nmap-ncat || true
  fi

  ok "系统依赖安装完成"
}

# ============================================================
# 步骤 5: 获取代码
# ============================================================
clone_or_update_repo() {
  info "准备项目目录: $INSTALL_DIR"

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    warn "目录已存在 git 仓库，执行 git pull 更新"
    cd "$INSTALL_DIR"
    git pull || warn "git pull 失败，继续使用现有代码"
  else
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  fi

  cd "$INSTALL_DIR"
  ok "代码就绪: $INSTALL_DIR"
}

# ============================================================
# 步骤 6: 安装依赖 & 构建
# ============================================================
install_deps_and_build() {
  if [[ "$SKIP_BUILD" == "true" ]]; then
    warn "跳过依赖安装和构建 (--skip-build)"
    return
  fi

  cd "$INSTALL_DIR"

  info "安装依赖 (pnpm install --frozen-lockfile) ..."
  # 如果没有 lockfile，退化为普通 install
  if [[ -f pnpm-lock.yaml ]]; then
    pnpm install --frozen-lockfile || pnpm install
  else
    pnpm install
  fi

  info "构建项目 (pnpm build) ..."
  pnpm build

  # 设置路径别名符号链接（prebuild 钩子可能因权限问题失败，手动确保）
  bash scripts/setup-aliases.sh || true

  ok "依赖安装和构建完成"
}

# ============================================================
# 步骤 7: 生成 .env 模板
# ============================================================
generate_env_template() {
  cd "$INSTALL_DIR"

  if [[ -f .env ]]; then
    warn ".env 已存在，跳过生成（请手动检查配置）"
    return
  fi

  info "生成 .env 配置模板 ..."

  if [[ -f .env.production.template ]]; then
    cp .env.production.template .env
  elif [[ -f .env.example ]]; then
    cp .env.example .env
  else
    warn "未找到环境变量模板文件，请手动创建 .env"
    return
  fi

  # 设置合理的默认值
  sed -i.bak \
    -e 's/^HOST=.*/HOST=0.0.0.0/' \
    -e 's/^NODE_ENV=.*/NODE_ENV=production/' \
    .env && rm -f .env.bak

  ok ".env 已生成，请编辑配置: vi $INSTALL_DIR/.env"
}

# ============================================================
# 步骤 8: 输出后续步骤
# ============================================================
print_next_steps() {
  echo ""
  echo -e "${GREEN}============================================================${NC}"
  echo -e "${GREEN}  安装完成！${NC}"
  echo -e "${GREEN}============================================================${NC}"
  echo ""
  echo -e "${CYAN}后续步骤:${NC}"
  echo ""
  echo -e "  ${YELLOW}1. 编辑配置文件:${NC}"
  echo -e "     vi $INSTALL_DIR/.env"
  echo -e "     （配置数据库连接、JWT 密钥、管理员密码等）"
  echo ""
  echo -e "  ${YELLOW}2. 运行数据库迁移:${NC}"
  echo -e "     cd $INSTALL_DIR && pnpm migrate"
  echo ""
  echo -e "  ${YELLOW}3. 启动服务（二选一）:${NC}"
  echo ""
  echo -e "     ${CYAN}方式 A — 直接运行（测试用）:${NC}"
  echo -e "     cd $INSTALL_DIR"
  echo -e "     node dist/manager/server.js    # 管理端"
  echo -e "     node dist/machine/server.js    # 机器端"
  echo ""
  echo -e "     ${CYAN}方式 B — systemd 托管（生产推荐）:${NC}"
  echo -e "     # 使用项目提供的 systemd 模板:"
  echo -e "     cp scripts/playwright-manager.service /etc/systemd/system/"
  echo -e "     cp scripts/playwright-machine.service /etc/systemd/system/"
  echo -e "     # 编辑其中的路径和用户"
  echo -e "     vi /etc/systemd/system/playwright-manager.service"
  echo -e "     systemctl daemon-reload"
  echo -e "     systemctl enable --now playwright-manager"
  echo ""
  echo -e "  ${YELLOW}4. 验证:${NC}"
  echo -e "     curl http://localhost:3000/health"
  echo ""
  echo -e "${CYAN}磁盘占用说明:${NC}"
  echo -e "  - 代码 + 依赖 + 构建产物: ~450 MB"
  echo -e "  - Google Chrome: ~300 MB"
  echo -e "  - 运行时数据（user-data/截图/日志）: 持续增长，建议预留 5-10 GB"
  echo ""
}

# ============================================================
# 主流程
# ============================================================
main() {
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Playwright User Sys 安装脚本${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""

  parse_args "$@"
  check_root
  detect_distro

  install_node
  install_pnpm
  install_chrome
  install_chromium_deps
  clone_or_update_repo
  install_deps_and_build
  generate_env_template

  print_next_steps
}

main "$@"
