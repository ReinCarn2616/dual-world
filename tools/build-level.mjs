// 多层关卡的网格生成器（关卡设计辅助工具，不参与游戏运行）
//
// 为什么需要它：进阶关是 60 多格宽、带楼板/竖井/台阶的多层结构，
// 手写 ASCII 行极容易数错 # 的个数（V2 会报错，但定位一次要一轮）。
// 这里用"楼板 + 竖井 + 台阶 + 地面熔岩"的结构描述生成两个世界的网格，
// 打印成可以直接贴进 src/levels.js 的数组字面量。
//
//   node tools/build-level.mjs                 # 打印内置的 L9「三层」
//   node tools/build-level.mjs --spec l10      # 打印内置的 L10 规格

const AIR = '.';
const SOLID = '#';
const HAZARD = 'X';

/** 生成一关的两个网格 */
export function buildGrids(spec) {
  const { width: W, height: H } = spec;
  const mk = () => Array.from({ length: H }, () => new Array(W).fill(AIR));

  const worlds = { light: mk(), dark: mk() };
  for (const world of ['light', 'dark']) {
    const g = worlds[world];
    // 外框
    for (let c = 0; c < W; c++) { g[0][c] = SOLID; g[H - 1][c] = SOLID; }
    for (let r = 0; r < H; r++) { g[r][0] = SOLID; g[r][W - 1] = SOLID; }
    // 楼板（两个世界一模一样：外框、楼板是"建筑物"，不是机关）
    for (const slab of spec.slabs) {
      for (let r = slab.r0; r <= slab.r1; r++) {
        for (let c = 1; c < W - 1; c++) g[r][c] = SOLID;
      }
    }
    // 竖井 / 天花板缺口：把楼板打通
    for (const gap of spec.gaps) {
      for (let r = gap.r0; r <= gap.r1; r++) {
        for (let c = gap.c0; c <= gap.c1; c++) g[r][c] = AIR;
      }
    }
  }
  // 台阶 / 浮台（分世界）
  for (const p of spec.platforms || []) {
    const g = worlds[p.world];
    for (let r = p.r0; r <= p.r1; r++) {
      for (let c = p.c0; c <= p.c1; c++) g[r][c] = SOLID;
    }
  }
  // 地面熔岩（分世界）
  for (const hz of spec.hazards || []) {
    const g = worlds[hz.world];
    for (let r = hz.r0; r <= hz.r1; r++) {
      for (let c = hz.c0; c <= hz.c1; c++) g[r][c] = HAZARD;
    }
  }
  // 终点与出生点（两个世界同一坐标）
  const put = (ch, c, r) => { worlds.light[r][c] = ch; worlds.dark[r][c] = ch; };
  put('P', spec.start.c, spec.start.r);
  put('E', spec.exit.c, spec.exit.r);
  // 终点在暗世界那一侧可能要补一块砖（V7 要求两个世界里都至少有一侧是 '#'）
  for (const fix of spec.exitFixes || []) {
    worlds[fix.world][fix.r][fix.c] = SOLID;
  }
  return { light: worlds.light.map((row) => row.join('')), dark: worlds.dark.map((row) => row.join('')) };
}

const SPECS = {
  // L9「折返」：解谜为主、死亡为辅（用户确认的方向）
  //   两层楼 + 两条竖井：
  //     地面走廊（4 格净高）地面上的熔岩带在两个世界里互补 —— 每一条都是 4 格宽，
  //       在走廊里跳不过去，只能"在哪一条前面换世界"；
  //     右端竖井里是三阶交错台阶，而且整体是**往左上方**爬的（光14行 → 暗10行 → 光6行，
  //       每阶 2 格高、5 格横move），落点都有 3 格宽，不考手速；
  //     爬到一层之后沿一层走廊**往左走**，一层走廊的地面同样有两段互补熔岩；
  //     终点在一层走廊的最左端 —— 也就是起点正上方。方向是"右 → 左上 → 左"。
  //   两条竖井里靠左那条是无梯的（假路口），掉下去只是回到地面走廊，不会死。
  l9: {
    width: 56,
    height: 14,
    slabs: [
      { r0: 12, r1: 13 }, // 地面楼板
      { r0: 6, r1: 7 },   // 一层楼板
      { r0: 1, r1: 1 },   // 二层走廊的天花板（只留 1 格厚，让最后的平跳不被削）
    ],
    gaps: [
      { r0: 6, r1: 7, c0: 41, c1: 53 }, // 真竖井（有楼梯）
      { r0: 6, r1: 7, c0: 16, c1: 18 }, // 假竖井（3 格宽，能跳过去；看得见爬不上）
    ],
    platforms: [
      // 竖井里的三阶台阶（整体往左上方，每阶落点 3~4 格宽，不考手速）
      { world: 'light', r0: 10, r1: 10, c0: 50, c1: 53 },
      { world: 'dark', r0: 8, r1: 8, c0: 46, c1: 48 },
      { world: 'light', r0: 6, r1: 6, c0: 42, c1: 44 },
    ],
    hazards: [
      // 地面走廊的熔岩带：两个世界互补，每条 4 格宽（跳不过去，必须换世界）
      { world: 'light', r0: 12, r1: 12, c0: 20, c1: 23 },
      { world: 'dark', r0: 12, r1: 12, c0: 30, c1: 33 },
      // 一层走廊的熔岩带：同样互补
      { world: 'light', r0: 6, r1: 6, c0: 24, c1: 27 },
      { world: 'dark', r0: 6, r1: 6, c0: 10, c1: 13 },
    ],
    start: { c: 2, r: 11 },
    exit: { c: 4, r: 5 },
  },
};

function emit(name, spec) {
  const { light, dark } = buildGrids(spec);
  const fmt = (rows) => rows.map((r) => `      '${r}',`).join('\n');
  console.log(`// ${name}  ${spec.width}×${spec.height}`);
  console.log(`    light: [\n${fmt(light)}\n    ],`);
  console.log(`    dark: [\n${fmt(dark)}\n    ],`);
}

const args = process.argv.slice(2);
const which = args.includes('--spec') ? args[args.indexOf('--spec') + 1] : 'l9';
if (!SPECS[which]) {
  console.error(`没有名为 ${which} 的规格；可选：${Object.keys(SPECS).join(', ')}`);
  process.exit(1);
}
emit(which, SPECS[which]);
