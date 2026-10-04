// 瓦片与精灵绘制、叠影渲染、画布缩放（§7.2 / §7.4 / §7.5.5）

import { GHOST, FAIL_FLASH, paletteOf } from './palette.js';
import { COLS, ROWS, TILE, tileAt, SOLID, HAZARD } from './stage.js';
import { exposedMask, tileIndexForMask, otherWorld } from './world.js';
import { PHYS } from './player.js';
import { DEFAULT_ANIMS } from './assets.js';

export const CANVAS_W = COLS * TILE; // 640
export const CANVAS_H = ROWS * TILE; // 384

/** 精灵动画速率（帧序本身来自 manifest，这里只是播放速率） */
const ANIM_FPS = { idle: 4, run: 13, jump: 6, fall: 6, land: 12, die: 8 };

/**
 * 缩放策略（§7.5.5 + 已确认决策"非整数倍 ≥ 1.5 时铺满屏幕"）：
 *   整数倍 ≥ 2 → 用整数倍（像素严格等大）
 *   1.5 ≤ 比例 < 2 → 用非整数倍铺满（1366×768 → 1.89×，与文档表格一致）
 *   1 ≤ 比例 < 1.5 → 用 1 倍
 *   比例 < 1 → 退化为非整数等比缩放（保证铺满）
 */
export function computeScale(availW, availH) {
  const raw = Math.min(availW / CANVAS_W, availH / CANVAS_H);
  if (!isFinite(raw) || raw <= 0) return 1;
  if (raw >= 2) return Math.floor(raw);
  if (raw >= 1.5) return raw;
  if (raw >= 1) return 1;
  return raw;
}

export function pickAnim(p, timers, state) {
  if (state === 'DEAD') return 'die';
  if (timers && timers.land > 0) return 'land';
  if (!p.grounded) return p.vy < 0 ? 'jump' : 'fall';
  return Math.abs(p.vx) > 0.4 ? 'run' : 'idle';
}

function buildSilhouette(sheet) {
  const cv = document.createElement('canvas');
  cv.width = sheet.img.width;
  cv.height = sheet.img.height;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(sheet.img, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, cv.width, cv.height);
  return cv;
}

export function createRenderer(canvas, assets) {
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx.imageSmoothingEnabled = false;
  const silhouettes = new Map();

  const sheetOf = (key) => assets.sheets[key] || null;

  /** 只画可见范围内的瓦片：进阶关地图可能很大（几百格 × 几十格） */
  function visibleRange(stage, cam) {
    const cx = cam ? cam.x : 0;
    const cy = cam ? cam.y : 0;
    return {
      c0: Math.max(0, Math.floor(cx / TILE) - 1),
      c1: Math.min(stage.cols - 1, Math.floor((cx + CANVAS_W) / TILE) + 1),
      r0: Math.max(0, Math.floor(cy / TILE) - 1),
      r1: Math.min(stage.rows - 1, Math.floor((cy + CANVAS_H) / TILE) + 1),
    };
  }

  function frame(sheet, index, dx, dy, extra) {
    const i = ((index % sheet.frames) + sheet.frames) % sheet.frames;
    const sx = i * sheet.frameW;
    ctx.drawImage(sheet.img, sx, 0, sheet.frameW, sheet.frameH, dx, dy, sheet.frameW, sheet.frameH);
    if (extra) extra(dx, dy);
  }

  function playerAnims(world) {
    const sheet = sheetOf(`player.${world === 1 ? 'dark' : 'light'}`);
    return (sheet && sheet.anims) || DEFAULT_ANIMS;
  }

  // ---------------------------------------------------------------- 各层

  function drawBackground(world, cam, stage) {
    const key = `bg.${world === 1 ? 'dark' : 'light'}`;
    const sheet = sheetOf(key);
    if (!sheet) {
      ctx.fillStyle = paletteOf(world).bg;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }
    const par = sheet.parallax != null ? sheet.parallax : 0.5;
    const scrollX = (cam ? cam.x : 0) * par;
    const scrollY = (cam ? cam.y : 0) * par;
    const bgW = sheet.frameW;
    const bgH = sheet.frameH;
    // 地图可能比背景大得多，所以按背景尺寸平铺，保证任何偏移都不露边
    const ox = -(((scrollX % bgW) + bgW) % bgW);
    const oy = -(((scrollY % bgH) + bgH) % bgH);
    for (let x = ox; x < CANVAS_W; x += bgW) {
      for (let y = oy; y < CANVAS_H; y += bgH) {
        ctx.drawImage(sheet.img, x, y, bgW, bgH);
      }
    }
  }

  function drawGhostLayer(stage, world, ch, alpha, range) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = GHOST.color;
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        if (tileAt(stage, world, c, r) === ch) {
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSolids(stage, world, range) {
    const sheet = sheetOf(`tiles.${world === 1 ? 'dark' : 'light'}`);
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        if (tileAt(stage, world, c, r) !== SOLID) continue;
        const dx = c * TILE;
        const dy = r * TILE;
        if (sheet) {
          const idx = tileIndexForMask(exposedMask(stage, world, c, r));
          frame(sheet, idx, dx, dy);
        } else {
          ctx.fillStyle = paletteOf(world).brick;
          ctx.fillRect(dx, dy, TILE, TILE);
        }
      }
    }
  }

  function drawHazards(stage, world, timeSec, range) {
    const sheet = sheetOf(`hazard.${world === 1 ? 'dark' : 'light'}`);
    const fps = (sheet && sheet.fps) || 8;
    const idx = Math.floor(timeSec * fps);
    const pulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((timeSec / 1.2) * Math.PI * 2)); // §7.2 第 5 层
    ctx.globalAlpha = pulse;
    for (let r = range.r0; r <= range.r1; r++) {
      for (let c = range.c0; c <= range.c1; c++) {
        if (tileAt(stage, world, c, r) !== HAZARD) continue;
        if (sheet) frame(sheet, idx, c * TILE, r * TILE);
        else {
          ctx.fillStyle = paletteOf(world).hazard;
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawExit(stage, world, timeSec, scale) {
    const sheet = sheetOf(`exit.${world === 1 ? 'dark' : 'light'}`);
    const fps = (sheet && sheet.fps) || 6;
    const idx = Math.floor(timeSec * fps);
    const dx = stage.exit.c * TILE;
    const dy = stage.exit.r * TILE;
    const s = scale || 1;
    if (sheet) {
      if (s !== 1) {
        const cx = dx + TILE / 2;
        const cy = dy + TILE / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        frame(sheet, idx, dx, dy);
        ctx.restore();
      } else {
        frame(sheet, idx, dx, dy);
      }
      return;
    }
    ctx.fillStyle = paletteOf(world).exit;
    ctx.fillRect(dx + 6 * s, dy + 6 * s, 20 * s, 26 * s);
  }

  function drawPlayer(view) {
    const { player: p, world, animFrames, frameIndex, whiteFlash } = view;
    const key = `player.${world === 1 ? 'dark' : 'light'}`;
    const sheet = sheetOf(key);
    if (!sheet) return;
    const feetY = (p.y + PHYS.H) * TILE;
    const dx = p.x * TILE + (PHYS.W * TILE) / 2 - sheet.frameW / 2;
    const dy = feetY - (sheet.frameH - (sheet.footOffset || 0));
    const idx = animFrames[frameIndex % animFrames.length];
    const sx = (((idx % sheet.frames) + sheet.frames) % sheet.frames) * sheet.frameW;

    let sil = silhouettes.get(key);
    if (!sil) {
      sil = buildSilhouette(sheet);
      silhouettes.set(key, sil);
    }

    // 2 px 白色描边（§7.2 第 6 层）：先画白色剪影的八向偏移，再叠本体
    const OUT = 2;
    const OFFS = [[-OUT, 0], [OUT, 0], [0, -OUT], [0, OUT], [-OUT, -OUT], [OUT, OUT], [-OUT, OUT], [OUT, -OUT]];
    const flip = p.facing < 0;
    const cx = dx + sheet.frameW / 2;
    const blit = (img, sxx, atX, atY) => {
      if (flip) {
        ctx.save();
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
        ctx.drawImage(img, sxx, 0, sheet.frameW, sheet.frameH, atX, atY, sheet.frameW, sheet.frameH);
        ctx.restore();
      } else {
        ctx.drawImage(img, sxx, 0, sheet.frameW, sheet.frameH, atX, atY, sheet.frameW, sheet.frameH);
      }
    };
    for (const [ox, oy] of OFFS) blit(sil, sx, dx + ox, dy + oy);
    blit(sheet.img, sx, dx, dy);

    if (whiteFlash) {
      // 切换失败：玩家精灵闪白 2 帧（§7.3）
      ctx.globalAlpha = 0.8;
      blit(sil, sx, dx, dy);
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles(particles) {
    for (const q of particles) {
      const a = Math.max(0, q.life / q.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      const s = q.size;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawFailVignette(alpha) {
    if (alpha <= 0.001) return;
    const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.25, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.75);
    g.addColorStop(0, 'rgba(255,59,48,0)');
    g.addColorStop(1, FAIL_FLASH);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 主绘制

  function render(view) {
    const { stage, world, timeSec, fx } = view;
    const cam = view.cam || { x: 0, y: 0 };
    const range = visibleRange(stage, cam);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 屏幕震动只作用在 translate 上，不修改任何游戏坐标（§7.4）
    ctx.translate(Math.round(fx.shakeX), Math.round(fx.shakeY));
    if (fx.zoom && fx.zoom !== 1) {
      const cx = CANVAS_W / 2;
      const cy = CANVAS_H / 2;
      ctx.translate(cx, cy);
      ctx.scale(fx.zoom, fx.zoom);
      ctx.translate(-cx, -cy);
    }

    // 背景是视差层：只跟摄像机走，不跟世界坐标走
    drawBackground(world, cam, stage);

    // 世界空间：整体平移摄像机（取整，保证像素对齐）
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    // 叠影（§7.2）：把另一世界的实体/危险以低透明度幽灵画出来。
    // 这是可以在「设置 → 显示」里关掉的显示项，默认关闭（用户偏好）；
    // 关掉之后玩家需要靠记忆判断另一世界的形状，难度会明显上升。
    if (view.showGhosts) {
      const ghostWorld = otherWorld(world);
      drawGhostLayer(stage, ghostWorld, SOLID, GHOST.solidAlpha, range);
      drawGhostLayer(stage, ghostWorld, HAZARD, GHOST.hazardAlpha, range);
    }
    drawSolids(stage, world, range);
    drawHazards(stage, world, timeSec, range);
    drawExit(stage, world, timeSec, fx.exitScale);
    drawParticles(fx.particles);
    drawPlayer(view);
    ctx.restore();
    ctx.restore();

    drawFailVignette(fx.flashAlpha);

    if (view.dim) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.globalAlpha = 1;
    }
  }

  function animInfo(world, anim, timeSec) {
    const anims = playerAnims(world);
    const frames = anims[anim] || anims.idle || [0];
    const fps = ANIM_FPS[anim] || 6;
    return { frames, index: Math.floor(timeSec * fps) };
  }

  return { ctx, canvas, render, animInfo, sheetOf, CANVAS_W, CANVAS_H };
}
