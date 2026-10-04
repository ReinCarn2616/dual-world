// 程序化占位图形：永远可用的兜底（§7.6.1）
// 任何素材加载失败都回退到这里，保证"任何时刻游戏都是可玩、有画面的"（§13 R14）。
//
// 尺寸与帧序必须与 assets/manifest.json 的声明完全一致，
// 否则"降级"和"正常加载"两条路径会画出不同的东西。

import { PALETTE } from './palette.js';

export const SHEET_SPEC = {
  'player.light': { frameW: 32, frameH: 64, frames: 20, footOffset: 2 },
  'player.dark': { frameW: 32, frameH: 64, frames: 20, footOffset: 2 },
  'tiles.light': { frameW: 32, frameH: 32, frames: 18 },
  'tiles.dark': { frameW: 32, frameH: 32, frames: 18 },
  'hazard.light': { frameW: 32, frameH: 32, frames: 4, fps: 8 },
  'hazard.dark': { frameW: 32, frameH: 32, frames: 4, fps: 8 },
  'exit.light': { frameW: 32, frameH: 32, frames: 4, fps: 6 },
  'exit.dark': { frameW: 32, frameH: 32, frames: 4, fps: 6 },
  'bg.light': { frameW: 960, frameH: 576, frames: 1, parallax: 0.5 },
  'bg.dark': { frameW: 960, frameH: 576, frames: 1, parallax: 0.5 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const cv = typeof document !== 'undefined'
    ? document.createElement('canvas')
    : { width: w, height: h, getContext: () => null };
  cv.width = w;
  cv.height = h;
  return cv;
}

function worldOf(key) {
  return key.endsWith('dark') ? PALETTE.dark : PALETTE.light;
}

// ------------------------------------------------------------------ 瓦片集

function drawBrick(ctx, x, y, mask, pal) {
  const S = 32;
  // 底色（近黑 / 冷灰蓝）
  ctx.fillStyle = pal.brick;
  ctx.fillRect(x, y, S, S);
  // 内部砖缝纹理：4 px 网格上的两道浅缝
  ctx.fillStyle = pal.bg;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(x, y + 10, S, 2);
  ctx.fillRect(x, y + 22, S, 2);
  ctx.fillRect(x + 8, y, 2, 10);
  ctx.fillRect(x + 22, y + 12, 2, 10);
  ctx.globalAlpha = 1;
  // 暴露侧的 1 px 描边 + 2 px 内部亮带（自动图块，§7.5.4 索引 1–15）
  const band = (bx, by, bw, bh, horizontal) => {
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = 1;
  };
  if (mask & 1) { // 上
    band(x, y + 1, S, 2, true);
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, S, 1);
    ctx.globalAlpha = 1;
  }
  if (mask & 4) { // 下
    band(x, y + S - 3, S, 2, true);
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y + S - 1, S, 1);
    ctx.globalAlpha = 1;
  }
  if (mask & 8) { // 左
    band(x + 1, y, 2, S, false);
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, 1, S);
    ctx.globalAlpha = 1;
  }
  if (mask & 2) { // 右
    band(x + S - 3, y, 2, S, false);
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x + S - 1, y, 1, S);
    ctx.globalAlpha = 1;
  }
}

function drawTileset(ctx, pal) {
  for (let mask = 0; mask < 16; mask++) {
    const index = mask === 15 ? 0 : 1 + mask;
    drawBrick(ctx, index * 32, 0, mask, pal);
  }
  // 16 单向平台（本版本不实现，仅按规格生成）
  const px = 16 * 32;
  ctx.fillStyle = pal.brick;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(px, 0, 32, 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(px, 1, 32, 2);
  // 17 终点门底座
  const ex = 17 * 32;
  ctx.fillStyle = pal.brick;
  ctx.fillRect(ex, 0, 32, 32);
  ctx.fillStyle = pal.exit;
  ctx.fillRect(ex + 7, 6, 18, 26);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(ex + 13, 12, 6, 10);
}

// ------------------------------------------------------------------ 熔岩

function drawHazard(ctx, pal) {
  for (let f = 0; f < 4; f++) {
    const x = f * 32;
    ctx.fillStyle = pal.hazard;
    ctx.fillRect(x, 0, 32, 32);
    // 表面波浪（每帧相位不同）
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 32; i++) {
      const h = 3 + Math.round(2.5 + 2.5 * Math.sin((i + f * 5) * 0.45));
      ctx.fillRect(x + i, 0, 1, h);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 32; i++) {
      const h = 1 + Math.round(1.5 + 1.5 * Math.sin((i + f * 3) * 0.7));
      ctx.fillRect(x + i, 0, 1, h);
    }
    ctx.globalAlpha = 1;
    // 少量气泡
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 6 + ((f * 7) % 5), 14, 3, 3);
    ctx.fillRect(x + 21 - ((f * 5) % 4), 22, 2, 2);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ 终点门

function drawExit(ctx, pal) {
  for (let f = 0; f < 4; f++) {
    const x = f * 32;
    const pulse = [0, 1, 2, 1][f];
    ctx.fillStyle = pal.bg;
    ctx.fillRect(x, 0, 32, 32);
    // 门框
    ctx.fillStyle = pal.brick;
    ctx.fillRect(x + 4, 2, 24, 30);
    // 门面
    ctx.fillStyle = pal.exit;
    ctx.fillRect(x + 7, 5, 18, 27);
    // 内部发光随帧脉动
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.18 + pulse * 0.08;
    ctx.fillRect(x + 10, 9, 12, 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.bg;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x + 20, 18, 3, 3);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ 角色

function drawActor(ctx, ox, oy, world, pose) {
  const pal = world === 'dark' ? PALETTE.dark : PALETTE.light;
  const c = pal.player;
  const line = pal.brick;
  const eye = pal.bg;
  const { bob = 0, legL = 0, legR = 0, squash = 0, stretch = 0, dieT = 0, arms = 0 } = pose;
  const S = 32, H = 64;
  const cx = ox + S / 2;
  const feet = oy + H - 2; // 底部留 2 px 给白色描边
  const bodyH = 56 + stretch - squash;
  const top = feet - bodyH + bob;

  ctx.save();
  if (dieT > 0) ctx.globalAlpha = Math.max(0, 1 - dieT);

  const rect = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

  // 轮廓（用砖色当描边，保证在背景上有形）
  const outline = (x, y, w, h, col) => {
    rect(x - 1, y - 1, w + 2, h + 2, line);
    rect(x, y, w, h, col);
  };

  // 腿
  const legTop = top + bodyH * 0.62;
  const legH = feet - legTop - (squash ? 0 : 0);
  outline(cx - 8 + legL, legTop, 6, legH, c);
  outline(cx + 2 + legR, legTop, 6, legH, c);

  // 身体
  outline(cx - 9, top + 12, 18, bodyH - 12 - (feet - legTop) + 6, c);

  // 手臂
  const armY = top + 16 - arms;
  outline(cx - 13, armY, 5, 16, c);
  outline(cx + 8, armY, 5, 16, c);

  // 头
  outline(cx - 8, top, 16, 15, c);

  // 眼（朝右）
  rect(cx + 1, top + 5, 5, 5, eye);
  rect(cx + 3, top + 6, 2, 3, line);

  ctx.restore();
}

const ANIM_FRAMES = {
  idle: [0, 1, 2, 3],
  run: [4, 5, 6, 7, 8, 9],
  jump: [10, 11],
  fall: [12, 13],
  land: [14, 15],
  die: [16, 17, 18, 19],
};

function poseFor(index) {
  if (ANIM_FRAMES.idle.includes(index)) {
    const i = ANIM_FRAMES.idle.indexOf(index);
    return { bob: [0, -1, 0, 1][i] };
  }
  if (ANIM_FRAMES.run.includes(index)) {
    const i = ANIM_FRAMES.run.indexOf(index);
    return { bob: [0, -1, 0, 0, -1, 0][i], legL: [0, -3, -5, 0, 3, 5][i], legR: [0, 3, 5, 0, -3, -5][i], arms: i % 2 ? 2 : 0 };
  }
  if (index === 10) return { stretch: 2, legL: 2, legR: -2, arms: 3 };
  if (index === 11) return { stretch: 1, legL: 1, legR: -1, arms: 2 };
  if (index === 12) return { legL: 2, legR: -3, arms: 2 };
  if (index === 13) return { legL: -2, legR: 3, arms: 1 };
  if (index === 14) return { squash: 5, legL: -2, legR: 2 };
  if (index === 15) return { squash: 3, legL: -1, legR: 1 };
  const i = index - 16;
  return { dieT: [0.2, 0.45, 0.7, 0.95][i], bob: [0, 2, 4, 6][i], legL: [0, 3, -3, 5][i], legR: [0, -3, 3, -5][i] };
}

function drawPlayerSheet(ctx, world) {
  for (let i = 0; i < 20; i++) {
    drawActor(ctx, (i % 20) * 32, 0, world, poseFor(i));
  }
}

// ------------------------------------------------------------------ 视差远景

function drawBackground(ctx, world, w, h) {
  const pal = world === 'dark' ? PALETTE.dark : PALETTE.light;
  const rng = mulberry32(world === 'dark' ? 20261004 : 20261005);

  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (world === 'dark') {
    g.addColorStop(0, pal.bg);
    g.addColorStop(0.55, '#1B1F2E');
    g.addColorStop(1, '#0E1017');
  } else {
    g.addColorStop(0, pal.bg);
    g.addColorStop(0.55, '#EFE7D6');
    g.addColorStop(1, '#E4DAC5');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 圆形光斑 / 星点（全部收在 5 色调色板内）
  for (let i = 0; i < (world === 'dark' ? 150 : 90); i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = world === 'dark' ? 1 + rng() * 2.5 : 4 + rng() * 9;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.brick;
    ctx.globalAlpha = world === 'dark' ? 0.12 + rng() * 0.3 : 0.03 + rng() * 0.04;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 远景几何剪影（山 / 拱），用砖色低透明堆叠
  for (let layer = 0; layer < 3; layer++) {
    ctx.globalAlpha = world === 'dark' ? 0.10 + layer * 0.05 : 0.06 + layer * 0.03;
    ctx.fillStyle = pal.brick;
    ctx.beginPath();
    const base = h * (0.62 + layer * 0.11);
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 24) {
      const y = base - Math.sin((x / w) * Math.PI * (1.5 + layer * 0.7) + layer) * (40 - layer * 10) - layer * 18;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ 工厂

/** 生成某个 sheet 的程序化替身（与 manifest 声明同尺寸、同帧序） */
export function makeProceduralSheet(key) {
  const spec = SHEET_SPEC[key];
  if (!spec) return null;
  const world = worldOf(key);
  const cv = makeCanvas(spec.frameW * spec.frames, spec.frameH);
  const ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return cv;
  ctx.imageSmoothingEnabled = false;
  const kind = key.split('.')[0];
  if (kind === 'player') drawPlayerSheet(ctx, world);
  else if (kind === 'tiles') drawTileset(ctx, world);
  else if (kind === 'hazard') drawHazard(ctx, world);
  else if (kind === 'exit') drawExit(ctx, world);
  else if (kind === 'bg') drawBackground(ctx, world, spec.frameW, spec.frameH);
  return cv;
}

/** 所有 sheet 的程序化替身表 */
export function makeAllProceduralSheets() {
  const out = {};
  for (const key of Object.keys(SHEET_SPEC)) out[key] = makeProceduralSheet(key);
  return out;
}
