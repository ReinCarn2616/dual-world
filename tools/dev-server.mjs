// 零依赖本地静态服务器（§10.6）
//
//   node tools/dev-server.mjs                 # http://localhost:5173
//   node tools/dev-server.mjs --open           # 起服务并自动打开浏览器
//   node tools/dev-server.mjs --port 8080
//
// 也可以直接双击项目根目录的 start-game.bat（Windows）或 ./start-game.sh（macOS / Linux）。
//
// ES Modules 无法通过 file:// 协议工作（CORS 限制），所以本地开发需要一个静态服务器。
// 只使用 Node 内置模块，不需要 npm install 任何东西。

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const WANT_PORT = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.PORT || 5173);
const SHOULD_OPEN = args.includes('--open') || args.includes('-o');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Cache-Control': 'no-store, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'X-Dual-World': '1', // 标记：让重复启动的脚本能认出"这个端口上已经是本项目"
    ...headers,
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = resolve(join(ROOT, normalize(pathname)));
    // 防目录穿越：必须仍在项目根目录内
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      send(res, 403, 'Forbidden');
      return;
    }
    const info = await stat(filePath);
    if (info.isDirectory()) {
      const idx = join(filePath, 'index.html');
      const body = await readFile(idx);
      send(res, 200, body, { 'Content-Type': MIME['.html'] });
      return;
    }
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    send(res, 200, body, { 'Content-Type': type });
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) send(res, 404, 'Not Found');
    else {
      console.error(err);
      send(res, 500, 'Internal Server Error');
    }
  }
});

/** 用系统默认浏览器打开 URL（零依赖，失败也不报错） */
function openBrowser(url) {
  try {
    let cmd;
    let cmdArgs;
    if (process.platform === 'win32') {
      cmd = 'cmd';
      cmdArgs = ['/c', 'start', '', url];
    } else if (process.platform === 'darwin') {
      cmd = 'open';
      cmdArgs = [url];
    } else {
      cmd = 'xdg-open';
      cmdArgs = [url];
    }
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch (_e) {
    /* 打不开浏览器不影响服务器 */
  }
}

/** 这个端口上是不是已经有本项目在跑了？是的话就别再起一个（一键启动连点两次也别开两个服务） */
async function alreadyRunning(port) {
  if (typeof fetch !== 'function') return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.headers.get('x-dual-world') === '1';
  } catch (_e) {
    return false;
  }
}

/** 端口被占用就往后找（一键启动时最怕"端口占用"直接退出） */
function listen(port, attemptsLeft = 12) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  端口 ${port} 被占用，换到 ${port + 1} …`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(`启动失败：${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    // 注意：实际端口要从 server.address() 取。用闭包里的 port 会在
    // "换了端口"的情况下打印错的地址（失败的 listen 回调也会挂到监听事件上）。
    const actual = (server.address() && server.address().port) || port;
    const url = `http://localhost:${actual}/`;
    console.log('');
    console.log('  光影之间 · 本地开发服务器已启动');
    console.log(`  ➜  ${url}`);
    console.log('');
    console.log(`  根目录：${ROOT}`);
    console.log('  调试：?lvl=5 直接跳关 · , / . 切换关卡 · 0 单世界调试开关 · H 看解法演示');
    console.log('  停止：关闭本窗口，或按 Ctrl+C');
    console.log('');
    if (SHOULD_OPEN) {
      console.log('  正在打开浏览器…');
      openBrowser(url);
    }
  });
}

const run = async () => {
  if (await alreadyRunning(WANT_PORT)) {
    const url = `http://localhost:${WANT_PORT}/`;
    console.log('');
    console.log('  光影之间已经在运行了，直接打开：');
    console.log(`  ➜  ${url}`);
    console.log('');
    if (SHOULD_OPEN) openBrowser(url);
    process.exit(0);
  }
  listen(WANT_PORT);
};

run();
