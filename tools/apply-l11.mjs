// 生成第 11 关「回廊」：与 L9 同模板但**结构不同**。
//   * 竖井 B 的三阶台阶在缺口内左右镜像（变成"往右上方爬"），终点从二层最左端移到最右端，
//     于是最后一段从"往左走"变成"往右走"，并要在二层地面连过两道互补熔岩。
//   * 磁带 = L9 已验证磁带的前半段（地面走廊 + 竖井 A + 一层走廊 + 跳过假竖井，逐字复用）
//          + 新写的后半段（竖井 B 右上三阶 + 二层往右到终点）。
//     前半段之所以能逐字复用：这部分几何与 L9 完全相同（物理平移/旋转对称性）。
//   node tools/apply-l11.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels.js';

const W = 56; const H = 20;
const SOLID = '#'; const AIR = '.'; const HAZ = 'X';

const spec = {
  slabs: [{ r0: 18, r1: 19 }, { r0: 12, r1: 13 }, { r0: 6, r1: 7 }, { r0: 1, r1: 1 }],
  gaps: [
    { r0: 12, r1: 13, c0: 41, c1: 53 }, // 竖井 A（地面 → 一层）
    { r0: 6, r1: 7, c0: 4, c1: 14 },    // 竖井 B（一层 → 二层）
    { r0: 12, r1: 13, c0: 16, c1: 18 }, // 假竖井
  ],
  platforms: [
    // 竖井 A：与 L9 完全相同（往左上三阶）
    { w: 'light', r0: 16, r1: 16, c0: 50, c1: 53 },
    { w: 'dark', r0: 14, r1: 14, c0: 46, c1: 48 },
    { w: 'light', r0: 12, r1: 12, c0: 42, c1: 44 },
    // 竖井 B：左右镜像 —— 变成往右上三阶（光 10行 → 暗 8行 → 光 6行）
    { w: 'light', r0: 10, r1: 10, c0: 5, c1: 7 },
    { w: 'dark', r0: 8, r1: 8, c0: 8, c1: 10 },
    { w: 'light', r0: 6, r1: 6, c0: 11, c1: 13 },
  ],
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
    // 地面走廊（与 L9 相同）
    { w: 'light', r0: 18, r1: 18, c0: 20, c1: 23 },
    { w: 'dark', r0: 18, r1: 18, c0: 30, c1: 33 },
    // 一层走廊（与 L9 相同）
    { w: 'light', r0: 12, r1: 12, c0: 24, c1: 27 },
    { w: 'dark', r0: 12, r1: 12, c0: 34, c1: 37 },
    // 二层走廊新增两道互补熔岩：光 30–33、暗 40–43（最后一段必须连换两次世界）
    { w: 'light', r0: 6, r1: 6, c0: 30, c1: 33 },
    { w: 'dark', r0: 6, r1: 6, c0: 40, c1: 43 },
  ],
  bumps: [
    { row: 17, cols: [7, 11, 15, 25, 28, 36, 42] },
    { row: 11, cols: [22, 31, 38] },
    { row: 5, cols: [18, 24, 36, 46, 50] },
  ],
  start: { c: 2, r: 17 },
  exit: { c: 53, r: 5 },
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
  for (const b of spec.bumps) for (const c of b.cols) {
    if (g[b.row][c] !== HAZ) g[b.row][c] = SOLID;
    for (let r = b.row - 1; r >= b.row - 2; r--) for (let cc = c - 1; cc <= c + 1; cc++) {
      if (r > 0 && cc > 0 && cc < W - 1 && g[r][cc] === SOLID) g[r][cc] = AIR;
    }
  }
  for (const hz of spec.hazards.filter((x) => x.w === world)) for (let r = hz.r0; r <= hz.r1; r++) for (let c = hz.c0; c <= hz.c1; c++) g[r][c] = HAZ;
  g[spec.start.r][spec.start.c] = 'P';
  g[spec.exit.r][spec.exit.c] = 'E';
  grids[world] = g.map((row) => row.join(''));
}

// 前半段：逐字复用 L9 磁带里到"跳过假竖井"为止的部分
const l9 = LEVELS.find((l) => l.id === 9);
const cut = l9.solution.findIndex((s) => s.untilX === 11.6); // 一层走廊里"走向竖井 B"那一段之前
if (cut < 0) { console.error('L9 磁带里找不到 untilX 11.6 的分界'); process.exit(1); }
const head = l9.solution.slice(0, cut);

// 后半段：竖井 B（往右上三阶，每跳都要在半空换世界）+ 二层往右（两道互补熔岩 + 矮台阶）
const tail = [
  { dir: 'left', dur: 3.0, untilX: 9.9 },
  { dir: 'left', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'right', dur: 0.3, untilX: 6.2 },
  { dir: 'right', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'right', dur: 0.3, untilX: 9.2 },
  { dir: 'right', dur: 0.5, jumpAt: 0, jumpHold: 0.5, switchAt: 0.25 }, { dur: 0.3 },
  { dir: 'right', dur: 0.3, untilX: 13.2 },
  { dir: 'right', dur: 0.7, jumpAt: 0, jumpHold: 0.7 },
  { dir: 'right', dur: 3.0, untilX: 17.9 }, { dur: 0.15 },
  { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 23.9 }, { dur: 0.15 },
  { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 29.1 },
  { dur: 0.25, switchAt: 0 },
  { dir: 'right', dur: 3.0, untilX: 35.9 }, { dur: 0.15 },
  { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 39.1 },
  { dur: 0.25, switchAt: 0 },
  { dir: 'right', dur: 3.0, untilX: 45.9 }, { dur: 0.15 },
  { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 49.9 }, { dur: 0.15 },
  { dir: 'right', dur: 0.3, jumpAt: 0, jumpHold: 0.22 },
  { dir: 'right', dur: 3.0, untilX: 52.4 },
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
    id: 11,
    group: 'advanced',
    name: '回廊',
    hint: () => '楼梯改成往右上爬，终点在二层另一头 —— 最后一段要连换两次世界',
    // 与第 9 关同模板、不同布局：竖井 B 的三阶台阶在缺口内左右镜像（改成往右上方爬），
    // 终点从二层最左端移到最右端（仍然在起始视野之外），二层地面新加两道互补熔岩
    //（光 30–33、暗 40–43，谁都无法单独走过）。磁带前半段与 L9 逐字相同，后半段为本关新写。
    solution: [
${fmtTape([...head, ...tail])}
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
const id11 = /^ {4}id: 11,/m.exec(text);
if (!id11) { console.error('找不到第 11 关'); process.exit(1); }
const start = text.lastIndexOf('  {', id11.index);
const end = text.indexOf("`n];", start); // 数组收尾：LEVELS 数组的 ];
writeFileSync(path, text.slice(0, start) + block + text.slice(end));
console.log(`已写回第 11 关（前半段复用 ${head.length} 段 + 新写 ${tail.length} 段）`);
