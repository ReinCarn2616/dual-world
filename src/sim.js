// 固定步长的单步推进：把 §10.4 主循环里"每个固定步内必须严格按顺序执行"的 9 步集中在这里。
//
// 为什么单独成文件：游戏主循环与 Node 端验证脚本（tools/verify-levels.mjs）必须走
// 完全相同的物理与规则顺序，否则"写好的书面推理"和"跑起来的行为"会悄悄分叉。

import { FIXED_DT, PHYS, spawnPlayer, resetPlayer, overlapsSolid, overlapsHazard, overlapsExit, moveX, moveY, isOutOfBounds, approach } from './player.js';
import { trySwitch, otherWorld } from './world.js';

export const EV = {
  JUMP: 'jump',
  LAND: 'land',
  SWITCH_OK: 'switchOk',
  SWITCH_FAIL: 'switchFail',
  DEATH: 'death',
  CLEAR: 'clear',
};

export { FIXED_DT, PHYS };

export function createSim(stage, worldIndex = 0) {
  return {
    stage,
    world: worldIndex === 1 ? 1 : 0,
    p: spawnPlayer(stage),
    timeMs: 0,
    alive: true,
    cleared: false,
  };
}

/** 死亡/按 R 之后回到起点：位置与速度归零，worldIndex 重置为光世界（§5.3） */
export function respawn(sim) {
  resetPlayer(sim.p, sim.stage);
  sim.world = 0;
  sim.alive = true;
  sim.cleared = false;
}

/**
 * 推进一个固定步长。input 为这一刻的输入快照：
 *   { left, right, jumpHeld, jumpPressed, switchPressed }
 * jumpPressed / switchPressed 是"按下沿"（由 input.js 或验证脚本维护）。
 * 返回本步产生的事件列表（供音效 / 粒子 / 状态机使用）。
 */
export function step(sim, input) {
  const { stage } = sim;
  const p = sim.p;
  const ev = [];
  if (!sim.alive || sim.cleared) return ev;

  // ---- 1. 采样输入（含输入缓冲判定，§10.5）
  if (input.jumpPressed) p.jumpBuffer = PHYS.JUMP_BUFFER;
  let jumped = false;
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -PHYS.JUMP_V;
    p.jumpBuffer = 0;
    p.coyote = 0;
    p.jumpCut = false;
    jumped = true;
    ev.push(EV.JUMP);
  }

  // ---- 2. 处理世界切换请求（§2.2 判定；只在按下沿触发，不响应长按）
  if (input.switchPressed) {
    const res = trySwitch(stage, sim);
    ev.push(res.ok ? EV.SWITCH_OK : EV.SWITCH_FAIL);
  }

  // ---- 3. 玩家水平移动与加速度
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const acc = (p.grounded ? PHYS.ACC_GROUND : PHYS.ACC_AIR) * FIXED_DT;
  if (dir !== 0) {
    p.vx = approach(p.vx, dir * PHYS.MAX_RUN, acc);
    p.facing = dir;
  } else {
    p.vx = approach(p.vx, 0, acc);
  }

  // ---- 4. 重力积分 → 可变跳跃高度
  if (!jumped) p.vy += PHYS.G * FIXED_DT;
  if (!input.jumpHeld && p.vy < 0 && !p.jumpCut) {
    p.vy *= PHYS.JUMP_CUT;   // §4.3 松手上升减速
    p.jumpCut = true;
  }
  if (p.vy > PHYS.MAX_FALL) p.vy = PHYS.MAX_FALL;

  // ---- 5. 分轴 AABB 碰撞解算（先 X 后 Y，避免斜向穿墙）
  const wasGrounded = p.grounded;
  moveX(stage, sim.world, p, p.vx * FIXED_DT);
  const impactVy = p.vy;
  p.grounded = false;
  moveY(stage, sim.world, p, p.vy * FIXED_DT);
  if (p.grounded && !wasGrounded) ev.push(EV.LAND, impactVy);

  // ---- 6. 危险瓦片重叠判定
  if (overlapsHazard(stage, sim.world, p)) {
    sim.alive = false;
    ev.push(EV.DEATH);
  }

  // ---- 7. 越界判定
  if (sim.alive && isOutOfBounds(p, stage)) {
    sim.alive = false;
    ev.push(EV.DEATH);
  }

  // ---- 8. 终点判定
  if (sim.alive && overlapsExit(stage, sim.world, p)) {
    sim.cleared = true;
    ev.push(EV.CLEAR);
  }

  // ---- 计时器相关的输入计时器衰减（§10.5）
  p.jumpBuffer = Math.max(0, p.jumpBuffer - FIXED_DT);
  if (p.grounded) p.coyote = PHYS.COYOTE;
  else p.coyote = Math.max(0, p.coyote - FIXED_DT);

  // ---- 9. 计时累加（§8.2，必须排在最后，否则通关那一帧会多算 1/120 s）
  sim.timeMs += FIXED_DT * 1000;

  return ev;
}

export { otherWorld, overlapsSolid };
