#!/usr/bin/env python3
"""零依赖本地静态服务器（Node.js 之外的备选）。

    python tools/dev-server.py            # http://localhost:5173
    python tools/dev-server.py --open     # 起服务并自动打开浏览器
    python tools/dev-server.py --port 8080

为什么会有这个文件：游戏本身是纯静态的，只需要一个会用正确 MIME 类型返回
.js / .json / .png 的 HTTP 服务器。装不了 Node.js 的机器（或者只想用 Python
验证一遍）可以直接跑这个。Windows 上 Python 自带的 `http.server` 会把 .js
按注册表映射成 text/plain，ES Modules 就加载不了，所以这里显式写死 MIME 表。

只使用 Python 标准库，不需要 pip install 任何东西。
"""

from __future__ import annotations

import argparse
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 5173

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".woff2": "font/woff2",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """把请求映射到项目根目录，并强制使用正确的 MIME 与 no-store 缓存头。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def guess_type(self, path):
        ext = Path(str(path)).suffix.lower()
        return MIME.get(ext, "application/octet-stream")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只打印请求行，去掉默认的时间戳噪音
        sys.stdout.write("  %s\n" % (fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def pick_port(start: int, attempts: int = 12) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                print(f"  端口 {port} 被占用，换到 {port + 1} …")
    raise SystemExit(f"从 {start} 起连续 {attempts} 个端口都被占用了")


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="光影之间 · 本地静态服务器（Python 版）")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--open", "-o", action="store_true", help="启动后自动打开浏览器")
    args = ap.parse_args()

    port = pick_port(args.port)
    url = f"http://localhost:{port}/"

    with Server(("127.0.0.1", port), Handler) as httpd:
        print("")
        print("  光影之间 · 本地服务器已启动（Python 版）")
        print(f"  ➜  {url}")
        print("")
        print(f"  根目录：{ROOT}")
        print("  调试：?lvl=5 直接跳关 · , / . 切换关卡 · 0 单世界调试开关 · H 看解法演示")
        print("  停止：Ctrl+C")
        print("")
        if args.open:
            threading.Timer(0.4, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  已停止。")


if __name__ == "__main__":
    main()
