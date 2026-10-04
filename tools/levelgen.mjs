// 关卡生成 + 直接改写 src/levels.js 的工具（设计辅助，不参与游戏运行）。
//
//   node tools/levelgen.mjs            # 只打印生成的两个网格
//   node tools/levelgen.mjs --patch    # 生成并写回 src/levels.js 的第 9 关
//
// 为什么要它：多层关是 56 格宽、20 行高、带楼板/竖井/台阶/方块林的结构，
// 手写 ASCII 数错一个 # 就要重跑一轮验证；这里结构描述 → 网格 → 直接写回。
// 网格字符：'.' 空、'#' 实心、'X' 熔岩、'P' 出生点、'E' 终点。

import { readFileSync, writeFileSync } from 'node:fs';

const AIR = '.';
const SOLID = '#';
const HAZARD = 'X';

function buildGrids(spec) {
  const { width: W, height: H } = spec;
  const mk = () => Array.from({ length: H }, () => new Array(W).fill(AIR));
  const worlds = { light: mk(), dark: mk() };
  for (const world of ['light', 'dark']) {
    const g = worlds[world];
    for (let c = 0; c < W; c++) { g[0][c] = SOLID; g[H - 1][c] = SOLID; }
    for (let r = 0; r < H; r++) { g[r][0] = SOLID; g[r][W - 1] = SOLID; }
    for (const s of spec.slabs) for (let r = s.r0; r <= s.r1; r++) for (let c = 1; c < W - 1; c++) g[r][c] = SOLID;
    for (const s of spec.gaps) for (let r = s.r0; r <= s.r1; r++) for (let c = s.c0; c <= s.c1; c++) g[r][c] = AIR;
  }
  // 地板小坑：只挖实心砖（熔岩不动），两个世界一起挖 —— 打破"一路按方向键"
  for (const d of spec.dips || []) {
    for (const w of ['light', 'dark']) {
      for (const c of d.cols) {
        if (worlds[w][d.row][c] === SOLID) worlds[w][d.row][c] = AIR;
      }
    }
  }  for (const p of spec.platforms || []) {
    const g = worlds[p.world];
    for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) g[r][c] = SOLID;
  }
  // 方块林：沿一行按间距铺 w 格宽的小砖，两个世界错开 —— 密密麻麻，但大半跳不到
  for (const f of spec.fields || []) {
    const g = worlds[f.world];
    for (let c = f.c0; c <= f.c1; c += f.step) {
      for (let r = f.r0; r <= f.r1; r++) {
        for (let k = 0; k < (f.w || 2); k++) {
          const cc = c + k;
          if (cc > 0 && cc < W - 1) g[r][cc] = SOLID;
        }
      }
    }
  }
  // 小坑净空：清掉小坑正上方两行、左右各一列的砖，保证掉进坑里还能跳出来
  for (const d of spec.dips || []) {
    for (const w of ['light', 'dark']) {
      for (const c of d.cols) {
        for (let r = d.row - 2; r >= d.row - 4; r--) {
          for (let cc = c - 1; cc <= c + 1; cc++) {
            if (r > 0 && cc > 0 && cc < W - 1 && worlds[w][r][cc] === SOLID) worlds[w][r][cc] = AIR;
          }
        }
      }
    }
  }  for (const hz of spec.hazards || []) {
    const g = worlds[hz.world];
    for (let r = hz.r0; r <= hz.r1; r++) for (let c = hz.c0; c <= hz.c1; c++) g[r][c] = HAZARD;
  }
  const put = (ch, c, r) => { worlds.light[r][c] = ch; worlds.dark[r][c] = ch; };
  put('P', spec.start.c, spec.start.r);
  put('E', spec.exit.c, spec.exit.r);
  return { light: worlds.light.map((r) => r.join('')), dark: worlds.dark.map((r) => r.join('')) };
}

// ── L9「三层折返」56×20 ────────────────────────────────────────────────
// 设计目标：一进去绝看不出该往哪走。
//   * 视野只有 12 行，地图 20 行：终点在最上层、离出生点 12 行 —— 开局看不见；
//   * 三层楼 + 两条竖井打通上下，楼梯都在竖井里、整体往左上方爬；
//   * 每层走廊净高 4 格，地面各有一段 4 格宽熔岩且分属两个世界（跳不过去 → 必须换世界）；
//   * 每条走廊上半部铺满交错小砖（两世界错开）：看着密，实际大半够不到，逼玩家判断；
//   * 一层楼板上留 3 格宽假竖井：看得见、爬不上，掉下去只是回地面走廊；
//   * 路线形状：地面往右 → 竖井A 左上 → 一层往左 → 竖井B 左上 → 二层往左到终点。
const L9 = {
  width: 56,
  height: 20,
  slabs: [
    { r0: 18, r1: 19 }, // 地面楼板
    { r0: 12, r1: 13 }, // 一层楼板
    { r0: 6, r1: 7 },   // 二层楼板
    { r0: 1, r1: 1 },   // 二层走廊的天花板（只 1 格厚，别削掉最后的平跳）
  ],
  gaps: [
    { r0: 12, r1: 13, c0: 41, c1: 53 }, // 竖井 A：地面 → 一层
    { r0: 6, r1: 7, c0: 4, c1: 14 },    // 竖井 B：一层 → 二层
    { r0: 12, r1: 13, c0: 16, c1: 18 }, // 假竖井（3 格宽，能跳过、爬不上）
  ],
  platforms: [
    // 竖井 A 的楼梯（光 16行 → 暗 14行 → 光 12行，整体往左上）
    { world: 'light', r0: 16, r1: 16, c0: 50, c1: 53 },
    { world: 'dark', r0: 14, r1: 14, c0: 46, c1: 48 },
    { world: 'light', r0: 12, r1: 12, c0: 42, c1: 44 },
    // 竖井 B 的楼梯（光 10行 → 暗 8行 → 光 6行，整体往左上）
    { world: 'light', r0: 10, r1: 10, c0: 11, c1: 13 },
    { world: 'dark', r0: 8, r1: 8, c0: 7, c1: 9 },
    { world: 'light', r0: 6, r1: 6, c0: 4, c1: 6 },
  ],
  fields: [
    { world: 'light', r0: 15, r1: 15, c0: 4, c1: 37, step: 6, w: 2 },
    { world: 'dark', r0: 15, r1: 15, c0: 7, c1: 40, step: 6, w: 2 },
    { world: 'light', r0: 9, r1: 9, c0: 18, c1: 38, step: 6, w: 2 },
    { world: 'dark', r0: 9, r1: 9, c0: 21, c1: 39, step: 6, w: 2 },
    { world: 'light', r0: 3, r1: 3, c0: 16, c1: 38, step: 6, w: 2 },
    { world: 'dark', r0: 3, r1: 3, c0: 19, c1: 41, step: 6, w: 2 },
  ],
  hazards: [
    { world: 'light', r0: 18, r1: 18, c0: 20, c1: 23 },
    { world: 'dark', r0: 18, r1: 18, c0: 30, c1: 33 },
    { world: 'light', r0: 12, r1: 12, c0: 24, c1: 27 },
    { world: 'dark', r0: 12, r1: 12, c0: 34, c1: 37 },
  ],
  dips: [
    { row: 18, cols: [7, 11, 15, 25, 28, 36, 42, 50, 54] },
    { row: 12, cols: [4, 8, 12, 22, 31, 38] },
    { row: 6, cols: [22, 28, 34, 40, 46, 52] },
  ],
  start: { c: 2, r: 17 },
  exit: { c: 2, r: 5 },
};

const fmt = (rows) => rows.map((r) => `      '${r}',`).join('\n');

function blockText(spec, meta) {
  const { light, dark } = buildGrids(spec);
  return `  {
    id: 9,
    group: 'advanced',
    name: '${meta.name}',
    hint: () => '${meta.hint}',
${meta.comment}
    solution: [],
    light: [
${fmt(light)}
    ],
    dark: [
${fmt(dark)}
    ],
  },
`;
}

const COMMENT = `    // 设计目标：一进去看不出该往哪走（见 tools/levelgen.mjs 的规格注释）。
    //   三层楼 + 两条竖井：地面往右 → 竖井A 左上 → 一层往左 → 竖井B 左上 → 二层往左到终点；
    //   每层走廊地面各有一段 4 格宽熔岩、分属两个世界（跳不过去，必须换世界）；
    //   走廊上半部铺满交错小砖（两世界错开），大半够不到，逼玩家判断哪些真能踩；
    //   一层留一个 3 格宽假竖井：看得见、爬不上。
    // ⚠ 解法磁带未完成：本关暂时没有内置演示（按 H 无效），A1 检查会红一条。
`;

// 更密的变体：方块林间距减半、熔岩带切成互补两段（必须半空连续换世界）
const DENSER = JSON.parse(JSON.stringify(L9));
DENSER.fields = DENSER.fields.map((f) => ({ ...f, step: 4 }));
DENSER.fields = DENSER.fields.concat(DENSER.fields.map((f) => ({ ...f, r0: f.r0 - 1, r1: f.r1 - 1, c0: f.c0 + 1, c1: f.c1 - 1 })));
DENSER.hazards = [
  { world: 'light', r0: 18, r1: 18, c0: 20, c1: 21 },
  { world: 'dark', r0: 18, r1: 18, c0: 22, c1: 25 },
  { world: 'light', r0: 18, r1: 18, c0: 26, c1: 27 },
  { world: 'dark', r0: 18, r1: 18, c0: 30, c1: 33 },
  { world: 'light', r0: 12, r1: 12, c0: 24, c1: 25 },
  { world: 'dark', r0: 12, r1: 12, c0: 26, c1: 29 },
  { world: 'light', r0: 12, r1: 12, c0: 30, c1: 31 },
  { world: 'dark', r0: 12, r1: 12, c0: 34, c1: 37 },
];

const args = process.argv.slice(2);
const wantDense = args.includes('--dense');
const spec = wantDense ? { ...DENSER, hazards: L9.hazards } : L9;
const wantPatch = args.includes('--patch');

if (!wantPatch) {
  const { light, dark } = buildGrids(spec);
  console.log(`// L9  ${L9.width}×${L9.height}`);
  console.log(`    light: [\n${fmt(light)}\n    ],`);
  console.log(`    dark: [\n${fmt(dark)}\n    ],`);
} else {
  const path = 'src/levels.js';
  const text = readFileSync(path, 'utf8');
  const a = text.indexOf('    id: 9,');
  const b = text.indexOf('    id: 10,');
  if (a < 0 || b < 0 || b < a) { console.error('没找到第 9 关的块边界'); process.exit(1); }
  const blockStart = text.lastIndexOf('  {', a);
  const newBlock = blockText(spec, { name: '三层折返', hint: '终点在最上层，开局连它在哪都看不到', comment: COMMENT });
  const out = text.slice(0, blockStart) + newBlock + text.slice(b - 3);
  writeFileSync(path, out);
  const { light, dark } = buildGrids(spec);
  console.log(`已写回 ${path}（第 9 关块替换完成）`);
  console.log(`light 行数=${light.length} 行宽=${light[0].length}；dark 行数=${dark.length} 行宽=${dark[0].length}`);
}
