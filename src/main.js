// 启动、主循环、全局状态机（§10.3 / §10.4）
//
// 状态机（已确认决策：删除 GAME_CLEAR；第 8 关结算后回主界面）
//   BOOT ──► TITLE ──► PLAYING ⇄ PAUSED
//                        │  │
//                        │  └──► DEAD ──► PLAYING（重生回本关起点）
//                        └──► LEVEL_CLEAR ──► PLAYING（下一关）/ TITLE（第 8 关之后）
//
// 界面（主菜单 / 暂停 / 按键设置 / 结算）全部在 src/ui.js 里，本文件只负责接线与游戏逻辑。

import { LEVELS, LEVEL_GROUPS } from './levels.js';
import { validateAll, TILE } from './stage.js';
import { createSim, step, respawn, FIXED_DT, EV, PHYS } from './sim.js';
import { createTapeRunner } from './solution.js';
import { createInput } from './input.js';
import {
  loadSettings, saveSettings, defaultBindings, makeKeyLabel, findConflict,
  isForbiddenCode, actionLabel, codeLabel, CANCEL_CODE,
} from './settings.js';
import { createRenderer, computeScale, pickAnim, CANVAS_W, CANVAS_H } from './render.js';
import { createFx, updateFx, resetFx, switchOkFx, switchFailFx, deathBurst, landDust, levelClearFx } from './fx.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
import { createHud } from './hud.js';
import { loadAssets, DEFAULT_MANIFEST } from './assets.js';
import { applyCssVars } from './palette.js';
import { createUI } from './ui.js';

// ------------------------------------------------------------------ 成绩持久化（§8.4）

const RECORDS_KEY = 'dual-world.records';
const RECORDS_VERSION = 1;

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__dw_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch (_e) {
    return null;
  }
}

function freshRecords() {
  return { version: RECORDS_VERSION, levelBestMs: {} };
}

function loadRecords() {
  const store = safeStorage();
  if (!store) return freshRecords();
  try {
    const text = store.getItem(RECORDS_KEY);
    if (!text) return freshRecords();
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || raw.version !== RECORDS_VERSION) return freshRecords();
    const best = {};
    if (raw.levelBestMs && typeof raw.levelBestMs === 'object') {
      for (const [k, v] of Object.entries(raw.levelBestMs)) {
        if (typeof v === 'number' && isFinite(v) && v >= 0) best[k] = v;
      }
    }
    return { version: RECORDS_VERSION, levelBestMs: best };
  } catch (err) {
    console.warn('[records] dual-world.records 损坏，已重建：', err && err.message);
    return freshRecords();
  }
}

function saveRecords(rec) {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(RECORDS_KEY, JSON.stringify(rec));
  } catch (err) {
    console.warn('[records] 写入失败（可能处于隐私模式）：', err && err.message);
  }
}

// ------------------------------------------------------------------ 全局

const dom = {
  hud: document.getElementById('hud'),
  level: document.getElementById('hud-level'),
  hint: document.getElementById('hud-hint'),
  time: document.getElementById('hud-time'),
  dev: document.getElementById('foot-dev'),
  stage: document.getElementById('stage'),
  canvas: document.getElementById('game'),
  overlay: document.getElementById('overlay'),
  panel: document.getElementById('panel'),
};

const params = new URLSearchParams(location.search);
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';

const game = {
  state: 'BOOT',
  levelIndex: 0,
  sim: null,
  fx: createFx(),
  timers: { land: 0, whiteFlash: 0, dead: 0, clear: 0 },
  timeSec: 0,
  // 摄像机：地图比画面大时跟随玩家（教学关正好 20×12，永远停在 0,0）
  cam: { x: 0, y: 0, ty: 0, snap: true },
  forcedWorld: null,
  dev: params.get('dev') === '1' || isLocal,
  lastResult: null,
  settlementShown: false,
  demo: null,
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 摄像机跟随（马里奥式）：水平方向带一点朝向预见与指数平滑；
 * 垂直方向只在落地时更新目标，这样跳跃不会让画面上下抖。
 * 地图不比画面大时（教学关）目标恒为 0，行为与之前完全一致。
 */
function updateCamera(dt) {
  const sim = game.sim;
  if (!sim) return;
  const stage = sim.stage;
  const p = sim.p;
  const maxX = Math.max(0, stage.cols * TILE - CANVAS_W);
  const maxY = Math.max(0, stage.rows * TILE - CANVAS_H);
  const tx = clamp((p.x + PHYS.W / 2) * TILE - CANVAS_W / 2 + (p.facing || 1) * 28, 0, maxX);
  if (game.cam.snap || p.grounded) {
    game.cam.ty = clamp((p.y + PHYS.H) * TILE - CANVAS_H * 0.62, 0, maxY);
  }
  if (game.cam.snap) {
    game.cam.x = tx;
    game.cam.y = game.cam.ty;
    game.cam.snap = false;
    return;
  }
  const k = 1 - Math.exp(-dt / 0.10);
  game.cam.x += (tx - game.cam.x) * k;
  game.cam.y += (game.cam.ty - game.cam.y) * k;
}

let levels = [];
let groups = LEVEL_GROUPS;
let settings = loadSettings();
let bindings = settings.bindings;
let showGhosts = settings.showGhosts;
let records = loadRecords();
let keyLabel = makeKeyLabel(bindings);
let currentHint = '';
let settingsReturn = 'menu'; // 按键设置子页的返回目标：'menu' | 'pause'
let rebindTarget = null;
let renderer = null;
let hud = null;
let input = null;
let ui = null;
let scaleText = '—';

function groupNameOf(level) {
  const g = groups.find((x) => x.id === (level && level.group));
  return g ? g.name : '';
}

// ------------------------------------------------------------------ 界面接线

function uiState() {
  return {
    levels,
    groups,
    records,
    bindings,
    keyLabel,
    muted: isMuted(),
    showGhosts,
    dev: game.dev,
    currentLevelIndex: game.levelIndex,
    gameState: game.state,
  };
}

/** ui.js 渲染完 DOM 后回调这里，把 data-act 按钮接上动作 */
function wirePanel(panel) {
  if (!panel || !panel.querySelectorAll) return;
  const nodes = panel.querySelectorAll('[data-act]');
  Array.prototype.forEach.call(nodes, (el) => {
    el.onclick = () => {
      initAudio();
      sfx.ui();
      const act = el.dataset.act;
      const idx = Number(el.dataset.index);
      switch (act) {
        case 'play-first': startLevel(0); break;
        case 'play-level': startLevel(idx); break;
        case 'tab-levels': case 'open-levels': ui.showMenu({ tab: 'levels' }); break;
        case 'demo-current': startDemo(); break;
        case 'resume': resumeGame(); break;
        case 'restart': restartLevel(); break;
        case 'go-title': goTitle(); break;
        case 'open-rebind':
          settingsReturn = ui.screen === 'pause' ? 'pause' : 'menu';
          ui.showSettings({ rebind: null, message: '' });
          break;
        case 'close-settings':
          if (settingsReturn === 'pause') ui.showPause(); else ui.showMenu({ tab: 'settings' });
          break;
        case 'rebind':
          beginRebind(el.dataset.action, Number(el.dataset.slot));
          break;
        case 'reset-bindings':
          if (ui.confirm === 'resetBindings') {
            bindings = defaultBindings();
            saveSettings(bindings, showGhosts);
            keyLabel = makeKeyLabel(bindings);
            input.rebuild();
            refreshHint();
            ui.setConfirm(null);
            ui.setMessage('已恢复默认键位。');
            ui.refresh();
            sfx.switchOk();
          } else {
            ui.setConfirm('resetBindings');
            ui.setMessage('');
            ui.refresh();
          }
          break;
        case 'toggle-ghosts':
          showGhosts = !showGhosts;
          saveSettings(bindings, showGhosts);
          ui.refresh();
          break;
        case 'toggle-mute':
          setMuted(!isMuted());
          ui.refresh();
          break;
        case 'clear-records':
          if (ui.confirm === 'clearRecords') {
            records = freshRecords();
            saveRecords(records);
            ui.setConfirm(null);
            ui.setMessage('成绩已清空。');
            ui.refresh();
            sfx.switchOk();
          } else {
            ui.setConfirm('clearRecords');
            ui.setMessage('');
            ui.refresh();
          }
          break;
        case 'toggle-force':
          cycleForcedWorld();
          ui.refresh();
          break;
        case 'next': advanceFromSettlement(); break;
        case 'replay': startLevel(game.levelIndex); break;
        default: break;
      }
    };
  });
  applyCssVars(document.documentElement, game.sim ? game.sim.world : 0);
  ui.setScaleInfo(scaleText);
}

function beginRebind(actionId, slot) {
  ui.setRebind({ actionId, slot });
  ui.setMessage('');
  ui.showSettings({ rebind: { actionId, slot }, message: '' });
  input.captureNextKey((e) => {
    const res = applyRebind(actionId, slot, e.code, e);
    ui.setRebind(null);
    // 提示里必须写"这次真正绑上的那个键"，不能写主绑定的显示名（那样会骗人）
    ui.setMessage(res.ok
      ? `已把「${actionLabel(actionId)}」的第 ${slot + 1} 个键设为 ${codeLabel(e.code)}。`
      : res.error);
    if (res.ok) sfx.switchOk();
    ui.refresh();
  });
}

/** 改键的唯一入口（设置界面与自动化测试共用） */
function applyRebind(actionId, slot, code, modifiers = {}) {
  if (code === CANCEL_CODE) return { ok: false, error: '已取消本次修改。' };
  const forb = isForbiddenCode(code, modifiers);
  if (forb) return { ok: false, error: forb };
  const conflict = findConflict(bindings, actionId, code, slot);
  if (conflict) return { ok: false, error: `该键已用于「${actionLabel(conflict)}」，请换一个。` };
  bindings[actionId][slot] = code;
  saveSettings(bindings, showGhosts);
  keyLabel = makeKeyLabel(bindings);
  input.rebuild();
  refreshHint();
  return { ok: true };
}

// ------------------------------------------------------------------ 状态切换

function refreshHint() {
  const stage = levels[game.levelIndex];
  currentHint = stage ? stage.hint(keyLabel) : '';
}

function startLevel(index) {
  const i = Math.max(0, Math.min(levels.length - 1, index));
  game.levelIndex = i;
  game.sim = createSim(levels[i]);
  game.state = 'PLAYING';
  game.settlementShown = false;
  game.lastResult = null;
  game.timers = { land: 0, whiteFlash: 0, dead: 0, clear: 0 };
  game.demo = null;
  game.cam.snap = true;
  resetFx(game.fx);
  refreshHint();
  ui.hide();
  applyCssVars(document.documentElement, 0);
}

function goTitle() {
  game.state = 'TITLE';
  game.demo = null;
  if (!game.sim) game.sim = createSim(levels[game.levelIndex]);
  else respawn(game.sim);
  game.timers = { land: 0, whiteFlash: 0, dead: 0, clear: 0 };
  resetFx(game.fx);
  refreshHint();
  ui.showMenu({ tab: 'start' });
}

function resumeGame() {
  if (game.state !== 'PAUSED') return;
  game.state = 'PLAYING';
  ui.hide();
}

function togglePause() {
  if (game.state === 'PLAYING') {
    game.state = 'PAUSED';
    ui.showPause();
  } else if (game.state === 'PAUSED') {
    resumeGame();
  }
}

function restartLevel() {
  // §4.1：重开随时可用、无延迟；§8.2：重开不清零计时
  respawn(game.sim);
  game.timers = { land: 0, whiteFlash: 0, dead: 0, clear: 0 };
  game.demo = null;
  game.cam.snap = true;
  resetFx(game.fx);
  game.state = 'PLAYING';
  game.settlementShown = false;
  refreshHint();
  ui.hide();
  applyCssVars(document.documentElement, 0);
}

function startDemo() {
  const stage = levels[game.levelIndex];
  if (!stage || !stage.solution || !stage.solution.length) return;
  respawn(game.sim);
  game.timers = { land: 0, whiteFlash: 0, dead: 0, clear: 0 };
  resetFx(game.fx);
  game.state = 'PLAYING';
  game.settlementShown = false;
  game.demo = createTapeRunner(stage.solution);
  currentHint = `标准解法演示中… 按任意方向键接管（${keyLabel('pause')} 暂停）`;
  ui.hide();
  applyCssVars(document.documentElement, 0);
}

function stopDemo() {
  if (!game.demo) return;
  game.demo = null;
  refreshHint();
}

function cycleForcedWorld() {
  // null（关闭）→ 强制暗世界 → 强制光世界 → 关闭
  game.forcedWorld = game.forcedWorld == null ? 1 : game.forcedWorld === 1 ? 0 : null;
  console.info(`[dev] 单世界调试开关：${game.forcedWorld == null ? '关闭' : game.forcedWorld === 1 ? '强制暗世界' : '强制光世界'}`);
}

function onDeath() {
  game.state = 'DEAD';
  game.timers.dead = 0.30; // 死亡重生总耗时 ≤ 0.4 s（§5.3 / §12.1 A6）
  if (game.demo) { game.demo = null; refreshHint(); }
  sfx.die();
  deathBurst(game.fx, game.sim.p, game.sim.world);
}

function onLevelClear() {
  const sim = game.sim;
  const stage = levels[game.levelIndex];
  const levelKey = String(stage.id);
  const prev = records.levelBestMs[levelKey];
  const timeMs = sim.timeMs;
  const isRecord = prev == null || timeMs < prev;
  if (isRecord) {
    records.levelBestMs[levelKey] = Math.round(timeMs);
    saveRecords(records);
  }
  game.lastResult = {
    levelIndex: game.levelIndex,
    timeMs,
    prev,
    isRecord,
    isLast: game.levelIndex === levels.length - 1,
  };
  game.state = 'LEVEL_CLEAR';
  game.timers.clear = 0.6; // §7.4：终点放大 + 粒子外扩，0.6 s 后进入结算
  game.settlementShown = false;
  game.demo = null;
  sfx.clear();
  levelClearFx(game.fx, stage, sim.world);
}

function advanceFromSettlement() {
  if (!game.lastResult) return;
  if (game.lastResult.isLast) goTitle();
  else startLevel(game.lastResult.levelIndex + 1);
}

// ------------------------------------------------------------------ 每个固定步

function handleEvents(ev) {
  const sim = game.sim;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e === EV.LAND) {
      const impact = ev[i + 1];
      i++;
      sfx.land();
      landDust(game.fx, sim.p, sim.world, typeof impact === 'number' ? impact : 0);
      game.timers.land = 0.12;
    } else if (e === EV.JUMP) {
      sfx.jump();
    } else if (e === EV.SWITCH_OK) {
      sfx.switchOk();
      switchOkFx(game.fx, sim.p, sim.world);
      applyCssVars(document.documentElement, sim.world);
    } else if (e === EV.SWITCH_FAIL) {
      sfx.switchFail();
      switchFailFx(game.fx);
      game.timers.whiteFlash = 2 / 60;
    } else if (e === EV.DEATH) {
      onDeath();
    } else if (e === EV.CLEAR) {
      onLevelClear();
    }
  }
}

function update(dt) {
  const t = game.timers;
  if (t.land > 0) t.land = Math.max(0, t.land - dt);
  if (t.whiteFlash > 0) t.whiteFlash = Math.max(0, t.whiteFlash - dt);
  // 界面打开时抑制游戏输入：既不拦按键（空格才能点按钮），也不把菜单里
  // 按过的方向键带进游戏
  if (input) input.setSuppressed(ui.screen !== 'none');
  updateCamera(dt);

  if (game.state === 'PLAYING') {
    let inp;
    if (game.demo) {
      inp = game.demo.next(game.sim.p);
      if (!inp) { game.demo = null; refreshHint(); inp = null; }
    } else {
      inp = input.sample();
    }
    if (inp) {
      if (game.forcedWorld != null) {
        inp.switchPressed = false;
        game.sim.world = game.forcedWorld;
      }
      const ev = step(game.sim, inp);
      if (ev.length) handleEvents(ev);
    }
  } else if (game.state === 'DEAD') {
    t.dead -= dt;
    if (t.dead <= 0) {
      respawn(game.sim); // §5.3：worldIndex 重置为光世界
      game.cam.snap = true;
      applyCssVars(document.documentElement, 0);
      game.state = 'PLAYING';
    }
  } else if (game.state === 'LEVEL_CLEAR') {
    t.clear -= dt;
    if (t.clear <= 0 && !game.settlementShown) {
      game.settlementShown = true;
      ui.showSettlement(game.lastResult);
    }
  }
}

// ------------------------------------------------------------------ 绘制

function renderFrame() {
  const sim = game.sim;
  if (!sim) return;
  const anim = pickAnim(sim.p, game.timers, game.state);
  const info = renderer.animInfo(sim.world, anim, game.timeSec);
  renderer.render({
    stage: sim.stage,
    world: sim.world,
    player: sim.p,
    timeSec: game.timeSec,
    animFrames: info.frames,
    frameIndex: info.index,
    whiteFlash: game.timers.whiteFlash > 0,
    fx: game.fx,
    dim: game.state === 'PAUSED',
    showGhosts,
    cam: game.cam,
  });
  hud.update({
    levelIndex: game.levelIndex,
    levelCount: levels.length,
    levelName: levels[game.levelIndex].name,
    groupName: groupNameOf(levels[game.levelIndex]),
    hint: currentHint,
    timeMs: sim.timeMs,
    world: sim.world,
    forcedWorld: game.forcedWorld,
    dev: game.dev,
  });
}

function resize() {
  const hudH = dom.hud ? dom.hud.getBoundingClientRect().height : 40;
  const availW = Math.max(160, window.innerWidth - 20);
  const availH = Math.max(120, window.innerHeight - hudH - 46);
  const s = computeScale(availW, availH);
  dom.canvas.style.width = `${Math.round(CANVAS_W * s)}px`;
  dom.canvas.style.height = `${Math.round(CANVAS_H * s)}px`;
  scaleText = `${s.toFixed(2)} 倍（${Math.round(CANVAS_W * s)} × ${Math.round(CANVAS_H * s)}）`;
  if (ui) ui.setScaleInfo(scaleText);
}

// ------------------------------------------------------------------ 主循环

let lastNow = 0;
let acc = 0;

function frame(now) {
  if (!lastNow) lastNow = now;
  const elapsed = (now - lastNow) / 1000;
  lastNow = now;
  const clamped = Math.min(elapsed, 0.25); // 防止切标签页后爆炸（§4.4）
  acc += clamped;
  game.timeSec += clamped;

  input.beginFrame();
  let steps = 0;
  while (acc >= FIXED_DT) {
    update(FIXED_DT);
    acc -= FIXED_DT;
    if (++steps > 300) { acc = 0; break; }
  }
  updateFx(game.fx, clamped);
  renderFrame();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ 输入接线

function wireInput() {
  let consumedByUi = false;

  input.onAnyKey((e) => {
    initAudio(); // 首次用户手势解锁音频（§9）
    if (game.demo && ui.screen === 'none' && input.isGameCode(e.code)) stopDemo(); // 玩家一按键就接管
    consumedByUi = ui.handleKey(e);
  });

  // 鼠标用户也要能解锁音频
  window.addEventListener('pointerdown', () => initAudio());

  input.onAction((action) => {
    if (consumedByUi) { consumedByUi = false; return; }
    if (ui.screen !== 'none') return; // 界面打开时由界面自己处理按键
    if (action === 'pause') {
      if (game.state === 'PLAYING' || game.state === 'PAUSED') togglePause();
      return;
    }
    if (action === 'restart') {
      // §4.1：随时可用、无延迟 —— 死亡动画与结算界面里也允许直接重开
      if (game.state !== 'TITLE' && game.state !== 'BOOT') restartLevel();
    }
  });

  // 开发用快捷键（§6.5）：, / . 上一关下一关；0 单世界调试开关；H 看解法演示
  window.addEventListener('keydown', (e) => {
    if (ui.screen !== 'none') return;
    if (e.repeat) return;
    if (e.code === 'KeyH') {
      e.preventDefault();
      initAudio();
      startDemo();
      return;
    }
    if (e.code === 'Comma' || e.code === 'Period') {
      const dir = e.code === 'Comma' ? -1 : 1;
      const n = game.levelIndex + dir;
      if (n >= 0 && n < levels.length) {
        e.preventDefault();
        startLevel(n);
        console.info(`[dev] 跳到第 ${n + 1} 关`);
      }
      return;
    }
    if (e.code === 'Digit0') {
      cycleForcedWorld();
    }
  });
}

// ------------------------------------------------------------------ 启动

async function boot() {
  const res = validateAll(LEVELS);
  levels = res.levels;
  if (levels.length === 0) {
    dom.panel.innerHTML = '<h2>关卡数据全部校验失败</h2><p class="footnote">请查看控制台输出的关卡 id 与行号。</p>';
    dom.overlay.classList.remove('hidden');
    return;
  }
  if (res.problems.length) console.warn('[levels] 有关卡被跳过：\n' + res.problems.join('\n'));

  const assets = await loadAssets(DEFAULT_MANIFEST);
  renderer = createRenderer(dom.canvas, assets);
  hud = createHud(document, { hud: dom.hud, level: dom.level, hint: dom.hint, time: dom.time, dev: dom.dev });
  input = createInput(() => bindings);
  ui = createUI({ dom, getState: uiState, cb: {
    wirePanel,
    uiSound: () => sfx.ui(),
    resume: resumeGame,
    startFirst: () => startLevel(0),
    advance: advanceFromSettlement,
    closeSettings: () => { if (settingsReturn === 'pause') ui.showPause(); else ui.showMenu({ tab: 'settings' }); },
  } });
  wireInput();

  applyCssVars(document.documentElement, 0);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  const lvlParam = Number(params.get('lvl'));
  const jumpTo = Number.isInteger(lvlParam) && lvlParam >= 1 && lvlParam <= levels.length ? lvlParam - 1 : null;
  game.levelIndex = jumpTo != null ? jumpTo : 0;
  game.sim = createSim(levels[game.levelIndex]);
  refreshHint();
  if (jumpTo != null) {
    startLevel(jumpTo); // ?lvl=N 直接进关卡，跳过主界面（§6.5 的跳关工作流）
  } else {
    game.state = 'TITLE';
    ui.showMenu({ tab: 'start' });
  }

  if (isLocal) {
    console.info('%c光影之间', 'font-weight:bold', '— 开发模式：, / . 切关，0 单世界调试，H 看解法，?lvl=N 直接跳关。');
  }

  // 调试/自动化钩子：浏览器控制台与 tools/smoke-test.mjs 都用它读写内部状态
  window.__dualWorld__ = {
    version: '1.0',
    game,
    levels,
    ui,
    input,
    records: () => records,
    startLevel,
    goTitle,
    restartLevel,
    startDemo,
    applyRebind,
    beginRebind,
    conflict: (actionId, code) => findConflict(bindings, actionId, code, -1),
    get bindings() { return bindings; },
    get hint() { return currentHint; },
    get ghosts() { return showGhosts; },
    setGhosts(v) { showGhosts = !!v; saveSettings(bindings, showGhosts); },
    keyLabel: (a) => keyLabel(a),
    setForcedWorld(v) { game.forcedWorld = v; },
  };

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('[boot] 启动失败：', err);
  dom.panel.innerHTML = `<h2>启动失败</h2><p class="footnote">${String(err && err.message ? err.message : err)}</p>`;
  dom.overlay.classList.remove('hidden');
});
