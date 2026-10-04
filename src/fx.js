// 屏幕震动、粒子、闪红（§7.3 / §7.4）
// 坐标一律用逻辑画布像素（640×384）；震动只作用于 ctx.translate，不改游戏坐标。

import { TILE } from './stage.js';
import { paletteOf, FAIL_FLASH } from './palette.js';

export function createFx() {
  return {
    shakeX: 0,
    shakeY: 0,
    shakeT: 0,
    shakeDur: 0,
    shakeMag: 0,
    flashAlpha: 0,
    flashT: 0,
    flashDur: 0,
    zoom: 1,
    zoomT: 0,
    zoomDur: 0,
    exitScale: 1,
    exitT: 0,
    particles: [],
    seed: 1,
  };
}

function rand(fx) {
  // 简单确定性随机，避免依赖 Math.random 的时序（粒子观感一致）
  fx.seed = (fx.seed * 1664525 + 1013904223) >>> 0;
  return fx.seed / 4294967296;
}

export function addShake(fx, mag, dur) {
  fx.shakeMag = Math.max(fx.shakeMag, mag);
  fx.shakeDur = Math.max(fx.shakeDur, dur);
  fx.shakeT = fx.shakeDur;
}

export function addFlash(fx, dur) {
  fx.flashDur = dur;
  fx.flashT = dur;
  fx.flashAlpha = 0.35;
}

export function addZoom(fx, amount, dur) {
  fx.zoomDur = dur;
  fx.zoomT = dur;
  fx.zoomAmount = amount;
}

export function spawnParticles(fx, opts) {
  const { x, y, count, color, speedMin = 3, speedMax = 6, life = 0.35, size = 3, up = false, radial = true, dirX = 0 } = opts;
  for (let i = 0; i < count; i++) {
    const a = radial ? rand(fx) * Math.PI * 2 : (rand(fx) - 0.5) * 0.9 + (dirX > 0 ? 0 : Math.PI);
    const sp = (speedMin + rand(fx) * (speedMax - speedMin)) * TILE;
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (up ? TILE * 2 : 0),
      life,
      maxLife: life,
      color,
      size: size + Math.floor(rand(fx) * 2),
      gravity: 9 * TILE,
    });
  }
  if (fx.particles.length > 600) fx.particles.splice(0, fx.particles.length - 600);
}

/** 死亡爆散：16 个粒子，玩家色（§7.4） */
export function deathBurst(fx, player, world) {
  spawnParticles(fx, {
    x: (player.x + 0.375) * TILE,
    y: (player.y + 0.875) * TILE,
    count: 16,
    color: paletteOf(world).player,
    speedMin: 3,
    speedMax: 6,
    life: 0.35,
    size: 3,
  });
}

/** 落地烟尘：下落速度 > 12 格/s 时左右各 3 个（§7.4） */
export function landDust(fx, player, world, impactVy) {
  if (impactVy <= 12) return;
  const y = (player.y + 1.75) * TILE;
  const cx = (player.x + 0.375) * TILE;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sp = (1.2 + rand(fx) * 1.8) * TILE;
      fx.particles.push({
        x: cx + dir * 4,
        y,
        vx: dir * sp,
        vy: -rand(fx) * TILE * 0.8,
        life: 0.25,
        maxLife: 0.25,
        color: paletteOf(world).brick,
        size: 2,
        gravity: 9 * TILE,
      });
    }
  }
}

/** 切换成功：4 个方向各 6 个短寿命粒子 + 轻微径向缩放（§7.3，总时长 ≤ 0.10 s） */
export function switchOkFx(fx, player, world) {
  const cx = (player.x + 0.375) * TILE;
  const cy = (player.y + 0.875) * TILE;
  spawnParticles(fx, { x: cx, y: cy, count: 24, color: paletteOf(world).player, speedMin: 6, speedMax: 11, life: 0.10, size: 2 });
  addZoom(fx, 0.03, 0.10);
}

/** 切换失败：闪红 vignette 0.12 s + 震动 4 px 0.15 s（§7.3） */
export function switchFailFx(fx) {
  addFlash(fx, 0.12);
  addShake(fx, 4, 0.15);
}

/** 通关：终点放大 + 8 个粒子外扩（§7.4） */
export function levelClearFx(fx, stage, world) {
  const cx = (stage.exit.c + 0.5) * TILE;
  const cy = (stage.exit.r + 0.5) * TILE;
  spawnParticles(fx, { x: cx, y: cy, count: 8, color: paletteOf(world).exit, speedMin: 3, speedMax: 6, life: 0.5, size: 3 });
  fx.exitT = 0.6;
}

export function resetFx(fx) {
  fx.shakeT = 0;
  fx.shakeMag = 0;
  fx.shakeX = 0;
  fx.shakeY = 0;
  fx.flashT = 0;
  fx.flashAlpha = 0;
  fx.zoomT = 0;
  fx.zoom = 1;
  fx.exitT = 0;
  fx.exitScale = 1;
  fx.particles.length = 0;
}

export function updateFx(fx, dt) {
  // 震动
  if (fx.shakeT > 0) {
    fx.shakeT = Math.max(0, fx.shakeT - dt);
    const k = fx.shakeDur > 0 ? fx.shakeT / fx.shakeDur : 0;
    const mag = fx.shakeMag * k;
    fx.shakeX = (fx.seed % 2 === 0 ? 1 : -1) * mag;
    fx.shakeY = ((fx.seed >> 1) % 2 === 0 ? 1 : -1) * mag * 0.6;
    fx.seed = (fx.seed * 1664525 + 1013904223) >>> 0;
    if (fx.shakeT === 0) { fx.shakeX = 0; fx.shakeY = 0; fx.shakeMag = 0; }
  }
  // 闪红
  if (fx.flashT > 0) {
    fx.flashT = Math.max(0, fx.flashT - dt);
    fx.flashAlpha = 0.35 * (fx.flashDur > 0 ? fx.flashT / fx.flashDur : 0);
  } else {
    fx.flashAlpha = 0;
  }
  // 径向缩放：1.00 → 1.03 → 1.00
  if (fx.zoomT > 0) {
    fx.zoomT = Math.max(0, fx.zoomT - dt);
    const k = fx.zoomDur > 0 ? 1 - fx.zoomT / fx.zoomDur : 1;
    fx.zoom = 1 + (fx.zoomAmount || 0.03) * Math.sin(k * Math.PI);
    if (fx.zoomT === 0) fx.zoom = 1;
  }
  // 终点放大
  if (fx.exitT > 0) {
    fx.exitT = Math.max(0, fx.exitT - dt);
    const k = 1 - fx.exitT / 0.6;
    fx.exitScale = 1 + 0.35 * Math.sin(k * Math.PI);
    if (fx.exitT === 0) fx.exitScale = 1;
  }
  // 粒子
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const q = fx.particles[i];
    q.life -= dt;
    if (q.life <= 0) { fx.particles.splice(i, 1); continue; }
    q.vy += q.gravity * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
}

export { FAIL_FLASH };
