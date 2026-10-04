#!/usr/bin/env bash
# ============================================================
#  《光影之间》一键启动（macOS / Linux）：起服务器 + 打开浏览器
#    chmod +x start-game.sh && ./start-game.sh
#  优先用 Node.js；没有 Node 会尝试自动安装；仍不行则退回 Python 版服务器。
# ============================================================
set -u
cd "$(dirname "$0")"

NODE_VER="v20.11.1"
NODE_HOME="${HOME}/.local/node"
OS="$(uname -s)"

echo
echo "  ============================================================"
echo "   光影之间 · 本地启动"
echo "  ============================================================"
echo

# ---- 找到 node（PATH 或之前自动解包的位置）----------------------------------
find_node() {
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"; return 0; fi
  for cand in "${NODE_HOME}/bin/node" "${NODE_HOME}/node" "/usr/local/bin/node" "/opt/homebrew/bin/node"; do
    if [ -x "$cand" ]; then NODE_BIN="$cand"; return 0; fi
  done
  return 1
}

# ---- 自动安装 Node.js -------------------------------------------------------
install_node() {
  echo "  没有找到 Node.js，尝试自动安装..."
  echo

  # a) 包管理器（有则用，可能要求输入密码）
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "  [1/2] brew install node ..."
    brew install node && return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    echo "  [1/2] apt-get install -y nodejs ..."
    if [ "$(id -u)" = "0" ]; then apt-get update && apt-get install -y nodejs && return 0
    elif command -v sudo >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y nodejs && return 0; fi
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "  [1/2] dnf install -y nodejs ..."
    if [ "$(id -u)" = "0" ]; then dnf install -y nodejs && return 0
    elif command -v sudo >/dev/null 2>&1; then sudo dnf install -y nodejs && return 0; fi
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "  [1/2] pacman -S --noconfirm nodejs ..."
    if [ "$(id -u)" = "0" ]; then pacman -S --noconfirm nodejs && return 0
    elif command -v sudo >/dev/null 2>&1; then sudo pacman -S --noconfirm nodejs && return 0; fi
  fi

  # b) 官方压缩包，解到 ~/.local/node（不需要管理员权限）
  case "$OS" in
    Darwin) PKG="node-${NODE_VER}-darwin-$( [ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64 ).tar.gz" ;;
    Linux)  PKG="node-${NODE_VER}-linux-$( [ "$(uname -m)" = "aarch64" ] && echo arm64 || echo x64 ).tar.gz" ;;
    *)      echo "  不认识这个系统：$OS"; return 1 ;;
  esac
  URL="https://nodejs.org/dist/${NODE_VER}/${PKG}"
  echo "  [2/2] 下载 ${PKG}（解压到 ${NODE_HOME}，无需管理员权限）..."
  mkdir -p "$NODE_HOME"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$URL" -o "/tmp/${PKG}" || { echo "  下载失败（检查网络）"; return 1; }
  elif command -v wget >/dev/null 2>&1; then
    wget -O "/tmp/${PKG}" "$URL" || { echo "  下载失败（检查网络）"; return 1; }
  else
    echo "  既没有 curl 也没有 wget，无法自动下载。"; return 1
  fi
  tar -xzf "/tmp/${PKG}" -C "$NODE_HOME" --strip-components=1 || { echo "  解压失败"; return 1; }
  rm -f "/tmp/${PKG}"
  export PATH="${NODE_HOME}/bin:${PATH}"
  echo "  Node.js 已解压到 ${NODE_HOME}"
  return 0
}

if ! find_node; then
  install_node || true
  find_node || true
fi

if [ -n "${NODE_BIN:-}" ]; then
  echo "  Node.js $("$NODE_BIN" --version 2>/dev/null || echo '?')  ($NODE_BIN)"
  echo "  正在启动本地服务器，浏览器会自动打开..."
  echo "  （按 Ctrl+C 停止服务器）"
  echo
  exec "$NODE_BIN" tools/dev-server.mjs --open
fi

for PY in python3 python; do
  if command -v "$PY" >/dev/null 2>&1; then
    echo "  Node.js 不可用，改用 Python 版服务器：$("$PY" --version 2>&1)"
    echo "  正在启动本地服务器，浏览器会自动打开..."
    echo "  （按 Ctrl+C 停止服务器）"
    echo
    exec "$PY" tools/dev-server.py --open
  fi
done

echo "  [x] 既没有 Node.js 也没有 Python，且自动安装 Node.js 没成功。"
echo
echo "      游戏本身是纯静态的，只需要一个会正确返回 .js / .json / .png 的 HTTP 服务器"
echo "      （ES Modules 不能通过 file:// 打开）。"
echo
echo "      请手动安装 Node.js（建议 18 以上）：https://nodejs.org/"
echo "      或安装 Python：https://www.python.org/"
echo "      装好后重新运行本脚本即可。"
exit 1
