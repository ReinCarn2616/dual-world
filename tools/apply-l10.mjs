// 生成第 10 关：把第 9 关整体左右镜像（网格 + 磁带一起镜像）。
//
// 为什么这么做：游戏的水平物理、跳跃、换世界判定都是左右对称的，所以"镜像图 + 镜像磁带"
// 必然同样可通关 —— 这样 L10 天生带一条已验证的解法，不用再手写磁带（手写一关磁带要反复试很久）。
// 镜像后的形状与 L9 相反：L9 是"往右 → 左上 → 往左 → 左上 → 往左"，L10 变成
// "往左 → 右上 → 往右 → 右上 → 往右"，起点在右下、终点在右上，终点同样在起始视野之外。
//
//   node tools/apply-l10.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels.js';

const l9 = LEVELS.find((l) => l.id === 9);
if (!l9) { console.error('找不到第 9 关'); process.exit(1); }
const COLS = l9.light[0].length;

const mirrorRow = (row) => [...row].reverse().join('');
const mirrored = { light: l9.light.map(mirrorRow), dark: l9.dark.map(mirrorRow) };

// 磁带镜像：方向取反、untilX 关于地图宽度镜像、其余时间字段不变
const mirrorTape = (tape) => tape.map((seg) => {
  const out = { ...seg };
  if (out.dir === 'left') out.dir = 'right';
  else if (out.dir === 'right') out.dir = 'left';
  // 玩家盒子宽 0.75，x 记录的是左边缘：镜像后 u' = COLS - 0.75 - u
  if (out.untilX != null) out.untilX = Math.round((COLS - 0.75 - out.untilX) * 100) / 100;
  return out;
});

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
    id: 10,
    group: 'advanced',
    name: '镜廊',
    hint: () => '这一关是上一关的镜像：方向反过来，但每一步的时机一样',
    // 由第 9 关整体左右镜像生成（网格 + 磁带一起镜像，见 tools/apply-l10.mjs）。
    // 水平物理与换世界判定左右对称，所以镜像磁带天然可通关：这是 L10 的验证来源。
    // 结构依旧是三层楼 + 两条竖井 + 一条假竖井；每层走廊地面各有一段 4 格宽熔岩且分属两个世界，
    // 走廊里铺满交错方块，地板上散布 1 格高矮台阶（跳得上去、不会卡人）。
    // 路线：地面往左 → 竖井A 右上 → 一层往右 → 竖井B 右上 → 二层往右到终点。
    solution: [
${fmtTape(mirrorTape(l9.solution))}
    ],
    light: [
${fmtGrid(mirrored.light)}
    ],
    dark: [
${fmtGrid(mirrored.dark)}
    ],
  },
`;

const path = 'src/levels.js';
const text = readFileSync(path, 'utf8');
const id10 = /^ {4}id: 10,/m.exec(text);
if (!id10) { console.error('找不到第 10 关'); process.exit(1); }
const start = text.lastIndexOf('  {', id10.index);
if (start < 0) { console.error('找不到第 10 关的块起点'); process.exit(1); }
// 第 10 关块的终点：下一个关卡的块起点（id: 11）或文件里的下一个顶级块
const id11 = /^ {4}id: 11,/m.exec(text);
const end = id11 ? text.lastIndexOf('  {', id11.index) : text.lastIndexOf('};');
writeFileSync(path, text.slice(0, start) + block + text.slice(end));
console.log('已写回第 10 关（第 9 关的左右镜像，含镜像磁带）');
