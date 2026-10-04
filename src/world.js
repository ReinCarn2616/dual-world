// 双世界模型、切换判定（§2.2）、叠影数据
// 纯逻辑模块：不触碰 DOM，可被 Node 端验证脚本复用。

import { overlapsSolid } from './player.js';
import { isSolid, isHazard, tileAt, SOLID, HAZARD } from './stage.js';

export const LIGHT = 0;
export const DARK = 1;

export function otherWorld(index) {
  return index === DARK ? LIGHT : DARK;
}

/**
 * 世界切换判定（§2.2）。
 * 成功：只改 worldIndex，位置与速度矢量原样保留（S1 / S2），返回 { ok: true }。
 * 失败：位置、速度、状态完全不变，不产生任何副作用（S5），返回 { ok: false }。
 */
export function trySwitch(stage, sim) {
  const target = otherWorld(sim.world);
  const p = sim.p;
  if (overlapsSolid(stage, target, p.x, p.y)) {
    return { ok: false, reason: 'blocked', target };
  }
  sim.world = target;
  return { ok: true, target };
}

/** 叠影数据：遍历目标世界的实心砖与危险物（§7.2 第 2、3 层） */
export function eachTile(stage, worldIndex, fn) {
  const grid = stage.grids[worldIndex === DARK ? DARK : LIGHT];
  for (let r = 0; r < stage.rows; r++) {
    const row = grid[r];
    for (let c = 0; c < stage.cols; c++) {
      const ch = row[c];
      if (ch === SOLID || ch === HAZARD) fn(ch, c, r);
    }
  }
}

/**
 * 瓦片集索引（§7.5.4）：0 = 通用砖，1–15 = 边缘/角落变体，16 = 单向平台，17 = 终点门底座。
 * mask 的 4 个 bit 表示上/右/下/左四侧是否"暴露"（即邻居不是实心砖）。
 */
export function tileIndexForMask(mask) {
  return mask === 15 ? 0 : 1 + mask;
}

/** 计算某实心砖的暴露掩码（同一世界的网格） */
export function exposedMask(stage, worldIndex, c, r) {
  let mask = 0;
  if (!isSolid(stage, worldIndex, c, r - 1)) mask |= 1; // 上
  if (!isSolid(stage, worldIndex, c + 1, r)) mask |= 2; // 右
  if (!isSolid(stage, worldIndex, c, r + 1)) mask |= 4; // 下
  if (!isSolid(stage, worldIndex, c - 1, r)) mask |= 8; // 左
  return mask;
}

export { isSolid, isHazard, tileAt };
