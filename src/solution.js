// 标准解法磁带：把"我脑子里的路线"写成可回放的输入序列。
//
// 用途有三个：
//   1. 证明每一关真的可以通关（tools/run-solutions.mjs 用**同一份物理**回放，跑到终点即构造性证明）
//   2. 游戏内的"看解法"演示（暂停菜单 / 按 H），答辩时可以现场放
//   3. 关卡改一行之后，立刻知道解法是否失效
//
// 磁带是段落数组，每段字段：
//   dir       'right' | 'left' | null   这一段持续按住的方向
//   dur       秒                         这一段最长持续多久
//   untilX    到达该 x 坐标就提前结束这一段
//   jumpAt    段落开始后第几秒按下跳跃
//   jumpHold  按下后保持多少秒（省略 = 保持到段落结束）
//   switchAt  段落开始后第几秒按下切换世界

import { createSim, step, respawn, FIXED_DT } from './sim.js';

/** 磁带播放器：逐步产出输入（游戏内演示模式用它，逐固定步推进） */
export function createTapeRunner(tape) {
  let segIndex = 0;
  let i = 0;
  let finished = false;

  return {
    get finished() { return finished; },
    /** 返回当前固定步的输入；磁带播完返回 null */
    next(player) {
      if (finished) return null;
      while (segIndex < tape.length) {
        const seg = tape[segIndex];
        const durSteps = Math.max(1, Math.round(((seg.dur != null ? seg.dur : 0) || 0) / FIXED_DT));
        // 到达 x 边界提前结束本段
        if (seg.untilX != null && seg.dir) {
          if ((seg.dir === 'right' && player.x >= seg.untilX) || (seg.dir === 'left' && player.x <= seg.untilX)) {
            segIndex++;
            i = 0;
            continue;
          }
        }
        if (i >= durSteps) {
          // 最后一段且没有开关动作时结束
          if (segIndex === tape.length - 1) {
            finished = true;
            return null;
          }
          segIndex++;
          i = 0;
          continue;
        }
        const jumpStep = seg.jumpAt != null ? Math.round(seg.jumpAt / FIXED_DT) : null;
        const holdSteps = seg.jumpHold != null ? Math.round(seg.jumpHold / FIXED_DT) : null;
        const switchStep = seg.switchAt != null ? Math.round(seg.switchAt / FIXED_DT) : null;
        const input = {
          left: seg.dir === 'left',
          right: seg.dir === 'right',
          jumpHeld: jumpStep != null && i >= jumpStep && (holdSteps == null || i < jumpStep + holdSteps),
          jumpPressed: jumpStep != null && i === jumpStep,
          switchPressed: switchStep != null && i === switchStep,
        };
        i++;
        return input;
      }
      finished = true;
      return null;
    },
  };
}

/**
 * 用真实物理完整回放一段磁带。
 * 返回 { cleared, switches, steps, timeMs, reason, sim }
 */
export function runTape(stage, tape, opts = {}) {
  const sim = createSim(stage, opts.world || 0);
  const runner = createTapeRunner(tape);
  const maxSteps = opts.maxSteps || Math.round(150 / FIXED_DT); // 多层大图（L11 回廊）的解法需要 60~90 秒
  let steps = 0;
  let switches = 0;

  for (;;) {
    const input = runner.next(sim.p);
    if (!input) return { cleared: false, reason: 'tapeEnd', switches, steps, timeMs: sim.timeMs, sim };
    if (steps++ > maxSteps) return { cleared: false, reason: 'maxSteps', switches, steps, timeMs: sim.timeMs, sim };
    const ev = step(sim, input);
    if (ev.includes('switchOk')) switches++;
    if (ev.includes('clear')) return { cleared: true, reason: 'clear', switches, steps, timeMs: sim.timeMs, sim };
    if (ev.includes('death')) return { cleared: false, reason: 'death', switches, steps, timeMs: sim.timeMs, sim };
  }
}

export { respawn };
