// 一次性落地第 9 关：网格（密集方块林 + 地板小坑）与解法磁带由本脚本一起写回，
// 不再用 PowerShell 拼接源码（上一轮就是这么把 levels.js 弄坏的）。
//   node tools/apply-l9.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const W = 56; const H = 20;
const SOLID = '#'; const AIR = '.'; const HAZ = 'X';

const spec = {
  slabs: [{ r0: 18, r1: 19 }, { r0: 12, r1: 13 }, { r0: 6, r1: 7 }, { r0: 1, r1: 1 }],
  gaps: [
    { r0: 12, r1: 13, c0: 41, c1: 53 },
    { r0: 6, r1: 7, c0: 4, c1: 14 },
    { r0: 12, r1: 13, c0: 16, c1: 18 },
  ],
  platforms: [
    { w: 'light', r0: 16, r1: 16, c0: 50, c1: 53 },
    { w: 'dark', r0: 14, r1: 14, c0: 46, c1: 48 },
    { w: 'light', r0: 12, r1: 12, c0: 42, c1: 44 },
    { w: 'light', r0: 10, r1: 10, c0: 11, c1: 13 },
    { w: 'dark', r0: 8, r1: 8, c0: 7, c1: 9 },
    { w: 'light', r0: 6, r1: 6, c0: 4, c1: 6 },
  ],
  // 每层走廊铺两排交错小砖（间距 4），密密麻麻但大半跳不到
  fields: [
    { w: 'light', r0: 15, r1: 15, c0: 4, c1: 37, step: 4, len: 2 },
    { w: 'dark', r0: 15, r1: 15, c0: 7, c1: 37, step: 4, len: 2 },
    { w: 'light', r0: 14, r1: 14, c0: 5, c1: 36, step: 4, len: 2 },
    { w: 'dark', r0: 14, r1: 14, c0: 8, c1: 36, step: 4, len: 2 },
    { w: 'light', r0: 9, r1: 9, c0: 18, c1: 38, step: 4, len: 2 },
    { w: 'dark', r0: 9, r1: 9, c0: 21, c1: 38, step: 4, len: 2 },
    { w: 'light', r0: 8, r1: 8, c0: 19, c1: 37, step: 4, len: 2 },
    { w: 'dark', r0: 8, r1: 8, c0: 22, c1: 37, step: 4, len: 2 },
    { w: 'light', r0: 3, r1: 3, c0: 16, c1: 38, step: 4, len: 2 },
    { w: 'dark', r0: 3, r1: 3, c0: 19, c1: 38, step: 4, len: 2 },
    { w: 'light', r0: 2, r1: 2, c0: 17, c1: 37, step: 4, len: 2 },
    { w: 'dark', r0: 2, r1: 2, c0: 20, c1: 37, step: 4, len: 2 },
  ],
  hazards: [
    { w: 'light', r0: 18, r1: 18, c0: 20, c1: 23 },
    { w: 'dark', r0: 18, r1: 18, c0: 30, c1: 33 },
    { w: 'light', r0: 12, r1: 12, c0: 24, c1: 27 },
    { w: 'dark', r0: 12, r1: 12, c0: 34, c1: 37 },
  ],
  bumps: [
    { row: 17, cols: [7, 11, 15, 25, 28, 36, 42] },
    { row: 11, cols: [22, 31, 38] },
    { row: 5, cols: [18, 24, 30, 36, 42, 48] },
  ],
  start: { c: 2, r: 17 },
  exit: { c: 2, r: 5 },
};

const grids = {};
for (const world of ['light', 'dark']) {
  const g = Array.from({ length: H }, () => new Array(W).fill(AIR));
  for (let c = 0; c < W; c++) { g[0][c] = SOLID; g[H - 1][c] = SOLID; }
  for (let r = 0; r < H; r++) { g[r][0] = SOLID; g[r][W - 1] = SOLID; }
  for (const s of spec.slabs) for (let r = s.r0; r <= s.r1; r++) for (let c = 1; c < W - 1; c++) g[r][c] = SOLID;
  for (const s of spec.gaps) for (let r = s.r0; r <= s.r1; r++) for (let c = s.c0; c <= s.c1; c++) g[r][c] = AIR;
  for (const p of spec.platforms.filter((x) => x.w === world)) for (let r = p.r0; r <= p.r1; r++) for (let c = p.c0; c <= p.c1; c++) g[r][c] = SOLID;
  for (const f of spec.fields.filter((x) => x.w === world)) {
    for (let c = f.c0; c <= f.c1; c += f.step) for (let r = f.r0; r <= f.r1; r++) for (let k = 0; k < f.len; k++) if (c + k > 0 && c + k < W - 1) g[r][c + k] = SOLID;
  }
  // 矮台阶：在地板上放 1 格高的实心砖（跳得上去、绝不会把人卡住），并清掉它上方两行的砖作净空
  for (const b of spec.bumps) for (const c of b.cols) {
    g[b.row][c] = SOLID;
    for (let r = b.row - 1; r >= b.row - 2; r--) for (let cc = c - 1; cc <= c + 1; cc++) {
      if (r > 0 && cc > 0 && cc < W - 1 && g[r][cc] === SOLID) g[r][cc] = AIR;
    }
  }
  for (const hz of spec.hazards.filter((x) => x.w === world)) for (let r = hz.r0; r <= hz.r1; r++) for (let c = hz.c0; c <= hz.c1; c++) g[r][c] = HAZ;
  g[spec.start.r][spec.start.c] = 'P';
  g[spec.exit.r][spec.exit.c] = 'E';
  grids[world] = g.map((row) => row.join(''));
}

// 磁带：地面往右（3 个坑 + 两道互补熔岩）→ 竖井A 左上三阶 → 一层往左（含跳假竖井 + 2 个坑）
//       → 竖井B 左上三阶 → 二层往左到终点。每个地板小坑后面都跟一个小跳。
const T = [
  // 地面走廊（光世界）：坑 7/11/15 —— 每个坑前 0.6 格先站定，再轻点跳（jumpHold 0.05，落点约 1.9 格）
  { dir: 'right', dur: 3.0, untilX: 6.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 10.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 14.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 19.4 },
  // 第一道门：光 20–23 熔岩 → 换暗世界；暗世界的坑 20/25/28
  { dur: 0.25, switchAt: 0 },
  { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 24.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 27.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 29.1 },
  // 第二道门：暗 30–33 熔岩 → 换回光世界；坑 36/42
  { dur: 0.25, switchAt: 0 },
  { dir: 'right', dur: 3.0, untilX: 35.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 41.9 }, { dur: 0.15 }, { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 47.8 },
  // 竖井 A：三阶交错台阶（光16行 → 暗14行 → 光12行 → 一层）
  { dir: 'right', dur: 0.5, jumpAt: 0, jumpHold: 0.5 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 50.6 },
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 46.4 },
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 42.6 },
  { dir: 'left', dur: 0.7, jumpAt: 0, jumpHold: 0.7 },
  // 一层走廊（往左）：坑 38/31 → 跳过假竖井(16–18) → 坑 22
  { dir: 'left', dur: 3.0, untilX: 39.1 }, { dur: 0.15 }, { dir: 'left', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'left', dur: 3.0, untilX: 32.1 }, { dur: 0.15 }, { dir: 'left', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'left', dur: 3.0, untilX: 28.0 },
  { dur: 0.25, switchAt: 0 },
  { dir: 'left', dur: 3.0, untilX: 23.1 }, { dur: 0.15 }, { dir: 'left', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'left', dur: 3.0, untilX: 19.2 },
  { dir: 'left', dur: 0.7, jumpAt: 0, jumpHold: 0.7 }, { dur: 0.3 },
  // 竖井 B：三阶交错台阶（光10行 → 暗8行 → 光6行 → 二层）
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 11.6 },
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 8.6 },
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'left', dur: 0.3, untilX: 5.0 },
  { dir: 'left', dur: 0.6, jumpAt: 0, jumpHold: 0.6 },
  { dir: 'right', dur: 0.5 },
];

const fmtGrid = (rows) => rows.map((r) => `      '${r}',`).join('\n');
const fmtTape = (segs) => segs.map((s) => {
  const parts = [`dir: ${s.dir ? `'${s.dir}'` : 'null'}`];
  if (s.dur != null) parts.push(`dur: ${s.dur}`);
  if (s.untilX != null) parts.push(`untilX: ${s.untilX}`);
  if (s.jumpAt != null) parts.push(`jumpAt: ${s.jumpAt}`);
  if (s.jumpHold != null) parts.push(`jumpHold: ${s.jumpHold}`);
  if (s.switchAt != null) parts.push(`switchAt: ${s.switchAt}`);
  return `      { ${parts.join(', ')} },`;
}).join('\n');

const block = `  {
    id: 9,
    group: 'advanced',
    name: '三层折返',
    hint: () => '终点在最上层，开局连它在哪都看不到',
    // 三层楼 + 两条竖井 + 一条假竖井（网格与磁带由 tools/apply-l9.mjs 一起生成）。
    // 每层走廊地面各有一段 4 格宽熔岩且分属两个世界（跳不过去 → 必须换世界），
    // 走廊里铺满交错小砖（两世界错开，大半跳不到），地板上每隔几格有一个 1 格深小坑，
    // 所以"一路按住方向键"走不通，每一步都要想。
    // 路线：地面往右 → 竖井A 左上 → 一层往左 → 竖井B 左上 → 二层往左到终点。
    solution: [
${fmtTape(T)}
    ],
    light: [
${fmtGrid(grids.light)}
    ],
    dark: [
${fmtGrid(grids.dark)}
    ],
  },
`;

const path = 'src/levels.js';
const text = readFileSync(path, 'utf8');
// L9 块起点：从"三层折返"这个名字往前找最近的 {；L10 块起点：从 id: 10 往前找最近的 {
// （第 10 关的 { 和 id 之间有注释行，所以不能把两者写成一个连续锚点）
const name9 = text.indexOf("    name: '三层折返',");
const id10 = /^ {4}id: 10,/m.exec(text);
if (name9 < 0 || !id10) { console.error('找不到第 9 / 第 10 关的锚点'); process.exit(1); }
const l9Start = text.lastIndexOf('  {', name9);
const l10Start = text.lastIndexOf('  {', id10.index);
if (l9Start < 0 || l10Start <= l9Start) { console.error('关卡块边界异常'); process.exit(1); }
writeFileSync(path, text.slice(0, l9Start) + block + text.slice(l10Start));
console.log('已写回第 9 关（网格 + 磁带）');
