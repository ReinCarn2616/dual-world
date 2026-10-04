// 关卡加载、§6.2 校验、关卡推进
// 纯逻辑模块：不触碰 DOM，可被 Node 端验证脚本复用（tools/verify-levels.mjs）。

export const COLS = 20;
export const ROWS = 12;
export const TILE = 32;

// 教学关固定 20×12；进阶关可以更大（画面 640×384 只显示其中一部分，由摄像机跟随）。
export const MIN_COLS = 20;
export const MIN_ROWS = 12;
export const MAX_COLS = 240;
export const MAX_ROWS = 80;

export const AIR = '.';
export const SOLID = '#';
export const HAZARD = 'X';
export const START = 'P';
export const EXIT = 'E';
export const ONEWAY = '='; // 本版本不实现（§5.1 / §14），出现在关卡数据里算校验失败

export const LEGAL_CHARS = [AIR, SOLID, HAZARD, START, EXIT];

/** 读取瓦片字符。水平越界视为实心（关卡四周本来就该是墙），上下越界视为空气。 */
export function tileAt(stage, worldIndex, c, r) {
  if (c < 0 || c >= stage.cols) return SOLID;
  if (r < 0 || r >= stage.rows) return AIR;
  const row = stage.grids[worldIndex === 1 ? 1 : 0][r];
  return row[c];
}

export function isSolid(stage, worldIndex, c, r) {
  return tileAt(stage, worldIndex, c, r) === SOLID;
}

export function isHazard(stage, worldIndex, c, r) {
  return tileAt(stage, worldIndex, c, r) === HAZARD;
}

export function isExit(stage, worldIndex, c, r) {
  return tileAt(stage, worldIndex, c, r) === EXIT;
}

// ---------------------------------------------------------------- §6.2 校验

function findChar(grid, ch) {
  const out = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === ch) out.push({ c, r });
    }
  }
  return out;
}

/**
 * 加载期校验 V1–V8（§6.2）。
 * 返回 { ok, errors: [{ code, line, msg }] }；任一失败即跳过该关。
 */
export function validateLevel(def) {
  const errors = [];
  const grid = (name) => {
    const g = def && def[name];
    return Array.isArray(g) ? g : null;
  };
  const push = (code, line, msg) => errors.push({ code, line, msg });
  const where = `关卡 ${def && def.id != null ? def.id : '?'}${def && def.name ? `（${def.name}）` : ''}`;

  const light = grid('light');
  const dark = grid('dark');
  if (!light || !dark) {
    push('V1', 0, `${where}: light / dark 缺失或不是数组`);
    return { ok: false, errors };
  }

  // V1 行数相同
  if (light.length !== dark.length) {
    push('V1', 0, `${where}: light 有 ${light.length} 行，dark 有 ${dark.length} 行`);
  }
  // V3 行数下限/上限（教学关是 12 行；进阶关可以更高，画面由摄像机滚动）
  for (const [name, g] of [['light', light], ['dark', dark]]) {
    if (g.length < MIN_ROWS) push('V3', 0, `${where}: ${name} 有 ${g.length} 行，至少要 ${MIN_ROWS} 行`);
    if (g.length > MAX_ROWS) push('V3', 0, `${where}: ${name} 有 ${g.length} 行，超过上限 ${MAX_ROWS} 行`);
  }
  // 宽度：同一关两个世界的每一行都必须等宽，且不小于 MIN_COLS
  const widths = new Set();
  for (const [name, g] of [['light', light], ['dark', dark]]) {
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      if (typeof row !== 'string') continue;
      widths.add(row.length);
      if (row.length < MIN_COLS) {
        push('V2', r, `${where}: ${name} 第 ${r} 行长度 ${row.length}，至少要 ${MIN_COLS}`);
      }
      if (row.length > MAX_COLS) {
        push('V2', r, `${where}: ${name} 第 ${r} 行长度 ${row.length}，超过上限 ${MAX_COLS}`);
      }
    }
  }
  if (widths.size > 1) {
    const target = Math.max(...widths);
    // 把"哪一行多长"列出来：手写大关卡时最容易数错 # 的个数
    for (const [name, g] of [['light', light], ['dark', dark]]) {
      const bad = [];
      for (let r = 0; r < g.length; r++) {
        if (typeof g[r] === 'string' && g[r].length !== target) bad.push(`第 ${r} 行=${g[r].length}`);
      }
      if (bad.length) push('V2', 0, `${where}: ${name} 行宽应为 ${target}，但 ${bad.join('，')}`);
    }
  }
  // V8 只允许合法字符
  for (const [name, g] of [['light', light], ['dark', dark]]) {
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      if (typeof row !== 'string') {
        push('V8', r, `${where}: ${name} 第 ${r} 行不是字符串`);
        continue;
      }
      for (let c = 0; c < row.length; c++) {
        if (!LEGAL_CHARS.includes(row[c])) {
          push('V8', r, `${where}: ${name} 第 ${r} 行第 ${c} 列出现非法字符 '${row[c]}'，只允许 ${LEGAL_CHARS.join(' ')}`);
        }
      }
    }
  }
  // V4 / V5 恰好一个 P、一个 E
  for (const [name, g] of [['light', light], ['dark', dark]]) {
    const ps = findChar(g, START);
    const es = findChar(g, EXIT);
    const code = name === 'light' ? 'V4' : 'V5';
    if (ps.length !== 1) push(code, ps.length ? ps[0].r : 0, `${where}: ${name} 有 ${ps.length} 个 'P'，应恰好 1 个`);
    if (es.length !== 1) push(code, es.length ? es[0].r : 0, `${where}: ${name} 有 ${es.length} 个 'E'，应恰好 1 个`);
  }
  // V6 P / E 坐标跨世界一致
  const lp = findChar(light, START)[0];
  const dp = findChar(dark, START)[0];
  const le = findChar(light, EXIT)[0];
  const de = findChar(dark, EXIT)[0];
  if (lp && dp && (lp.c !== dp.c || lp.r !== dp.r)) {
    push('V6', lp.r, `${where}: P 坐标不一致 light(${lp.c},${lp.r}) dark(${dp.c},${dp.r})`);
  }
  if (le && de && (le.c !== de.c || le.r !== de.r)) {
    push('V6', le.r, `${where}: E 坐标不一致 light(${le.c},${le.r}) dark(${de.c},${de.r})`);
  }
  // V7 P / E 四周至少一侧是 '#'，防止悬空出生
  const nearSolid = (g, c, r) => {
    const at = (cc, rr) => (rr >= 0 && rr < g.length && cc >= 0 && cc < (g[rr] || '').length ? g[rr][cc] : AIR);
    return at(c, r - 1) === SOLID || at(c, r + 1) === SOLID || at(c - 1, r) === SOLID || at(c + 1, r) === SOLID;
  };
  for (const [name, g] of [['light', light], ['dark', dark]]) {
    for (const ch of [START, EXIT]) {
      const found = findChar(g, ch)[0];
      if (found && !nearSolid(g, found.c, found.r)) {
        push('V7', found.r, `${where}: ${name} 的 '${ch}' 在 (${found.c},${found.r}) 四周没有 '#'（悬空）`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** 校验一整份关卡列表，返回 { ok, levels, problems }（problems 里是每一关的报错文本） */
export function validateAll(defs) {
  const levels = [];
  const problems = [];
  for (const def of defs) {
    const res = validateLevel(def);
    if (res.ok) {
      levels.push(buildStage(def));
    } else {
      for (const e of res.errors) {
        problems.push(`[${e.code}] 第 ${e.line} 行: ${e.msg}`);
        // eslint-disable-next-line no-console
        console.error(`[关卡校验失败][${e.code}] 第 ${e.line} 行: ${e.msg}`);
      }
    }
  }
  return { ok: problems.length === 0, levels, problems };
}

/** 由关卡数据构造运行时 stage 对象 */
export function buildStage(def) {
  const light = def.light.map((s) => s);
  const dark = def.dark.map((s) => s);
  const lp = findChar(light, START)[0];
  const le = findChar(light, EXIT)[0];
  const cols = light.length ? light[0].length : COLS;
  const rows = light.length || ROWS;
  return {
    id: def.id,
    group: def.group || 'tutorial',
    name: def.name,
    hint: typeof def.hint === 'function' ? def.hint : () => String(def.hint || ''),
    solution: Array.isArray(def.solution) ? def.solution : null,
    cols,
    rows,
    grids: [light, dark],
    start: { c: lp.c, r: lp.r },
    exit: { c: le.c, r: le.r },
  };
}

/** 关卡推进：最后一关之后回到标题（GAME_CLEAR 已按已确认决策删除） */
export function nextLevelIndex(current, total) {
  const n = current + 1;
  return n < total ? n : -1;
}
