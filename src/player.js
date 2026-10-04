// 玩家物理、AABB 碰撞、状态（§4.2 / §4.3 / §10.5）
// 纯逻辑模块：不触碰 DOM，可被 Node 端验证脚本复用。

import { COLS, ROWS, isSolid, isHazard, tileAt, EXIT } from './stage.js';

/** 运动参数表（§4.2，Day 1 冻结）。物理量单位全部是「格」。 */
export const PHYS = {
  W: 0.75,          // 碰撞盒宽 = 24 px
  H: 1.75,          // 碰撞盒高 = 56 px
  G: 42,            // 重力加速度 格/s²
  JUMP_V: 14,       // 跳跃初速度 格/s
  MAX_RUN: 5.5,     // 水平最大速度 格/s
  ACC_GROUND: 60,   // 地面加速度
  ACC_AIR: 35,      // 空中加速度
  MAX_FALL: 22,     // 最大下落速度
  JUMP_CUT: 0.45,   // 松手上升减速（= 1 / 2.2）
  COYOTE: 0.10,     // 土狼时间 s
  JUMP_BUFFER: 0.10,// 跳跃输入缓冲 s
};

/** 固定物理步长（§4.4） */
export const FIXED_DT = 1 / 120;

const EPS = 1e-6;

function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return v;
}

/** 出生：站在 P 瓦片上，脚底贴住该瓦片的下边缘（§5.2） */
export function spawnPlayer(stage) {
  const { c, r } = stage.start;
  return {
    x: c + 0.5 - PHYS.W / 2,
    y: r + 1 - PHYS.H,
    vx: 0,
    vy: 0,
    grounded: true,
    coyote: PHYS.COYOTE,
    jumpBuffer: 0,
    jumpCut: false,
    facing: 1,
  };
}

/** 与出生状态等价的复位（保留朝向） */
export function resetPlayer(p, stage) {
  const s = spawnPlayer(stage);
  p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
  p.grounded = true; p.coyote = PHYS.COYOTE;
  p.jumpBuffer = 0; p.jumpCut = false;
  return p;
}

export function aabb(p) {
  return { l: p.x, r: p.x + PHYS.W, t: p.y, b: p.y + PHYS.H };
}

function cellRange(x, y) {
  return {
    c0: Math.floor(x + EPS),
    c1: Math.floor(x + PHYS.W - EPS),
    r0: Math.floor(y + EPS),
    r1: Math.floor(y + PHYS.H - EPS),
  };
}

/** 完整 AABB 是否与实心瓦片相交（S3：切换判定必须用完整碰撞盒） */
export function overlapsSolid(stage, worldIndex, x, y) {
  const { c0, c1, r0, r1 } = cellRange(x, y);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (isSolid(stage, worldIndex, c, r)) return true;
    }
  }
  return false;
}

/** AABB 是否与熔岩/尖刺重叠（§5.3） */
export function overlapsHazard(stage, worldIndex, p) {
  const { c0, c1, r0, r1 } = cellRange(p.x, p.y);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (isHazard(stage, worldIndex, c, r)) return true;
    }
  }
  return false;
}

/** AABB 是否碰到终点（§10.4 第 8 步） */
export function overlapsExit(stage, worldIndex, p) {
  const { c0, c1, r0, r1 } = cellRange(p.x, p.y);
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      if (tileAt(stage, worldIndex, c, r) === EXIT) return true;
    }
  }
  return false;
}

/** 水平移动 + 解算（先 X，§10.4 第 5 步） */
export function moveX(stage, worldIndex, p, dx) {
  if (dx === 0) return false;
  p.x += dx;
  const { c0, c1, r0, r1 } = cellRange(p.x, p.y);
  if (dx > 0) {
    const c = c1;
    for (let r = r0; r <= r1; r++) {
      if (isSolid(stage, worldIndex, c, r)) {
        p.x = c - PHYS.W;
        p.vx = 0;
        return true;
      }
    }
  } else {
    const c = c0;
    for (let r = r0; r <= r1; r++) {
      if (isSolid(stage, worldIndex, c, r)) {
        p.x = c + 1;
        p.vx = 0;
        return true;
      }
    }
  }
  return false;
}

/** 垂直移动 + 解算（后 Y，§10.4 第 5 步） */
export function moveY(stage, worldIndex, p, dy) {
  if (dy === 0) return false;
  p.y += dy;
  const { c0, c1, r0, r1 } = cellRange(p.x, p.y);
  if (dy > 0) {
    const r = r1;
    for (let c = c0; c <= c1; c++) {
      if (isSolid(stage, worldIndex, c, r)) {
        p.y = r - PHYS.H;
        p.vy = 0;
        p.grounded = true;
        return true;
      }
    }
  } else {
    const r = r0;
    for (let c = c0; c <= c1; c++) {
      if (isSolid(stage, worldIndex, c, r)) {
        p.y = r + 1;
        p.vy = 0;
        return true;
      }
    }
  }
  return false;
}

/** 是否越出画布下边界（§5.3） */
export function isOutOfBounds(p, stage) {
  return p.y > stage.rows || p.x + PHYS.W < 0 || p.x > stage.cols;
}

export { approach, COLS, ROWS };
