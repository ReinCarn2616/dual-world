// 界面层：主菜单、暂停菜单、按键设置、通关结算
//
// 需求：主界面要有清晰的功能分区（开始游戏 / 选择关卡 / 设置 / 操作说明），
// 并且鼠标与键盘都能操作。所有文字都在 DOM 里，canvas 只画游戏画面（§12.5 E1）。
//
// 依赖注入：host.getState() 提供数据，host.cb 提供动作回调，这个模块不直接碰主循环。

import { ACTIONS, keyLabelsOf } from './settings.js';
import { formatTime, formatDelta } from './hud.js';

const TABS = [
  { id: 'start', label: '开始游戏' },
  { id: 'levels', label: '选择关卡' },
  { id: 'settings', label: '设置' },
  { id: 'help', label: '操作说明' },
];

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function createUI(host) {
  const { dom, cb } = host;
  const st = () => host.getState();

  let screen = 'none'; // 'menu' | 'pause' | 'settings' | 'settlement'
  let tab = 'start';
  let message = '';
  let confirm = null; // 'clearRecords' | 'resetBindings'
  let settlement = null;
  let rebind = null; // { actionId, slot }

  // ---------------------------------------------------------------- 基础

  function open(html, cls) {
    dom.panel.className = cls || 'panel';
    dom.panel.innerHTML = html;
    dom.overlay.classList.remove('hidden');
    // 注意：这里**故意不自动聚焦**第一个按钮。自动聚焦会让刚打开菜单就有一个
    // 按钮带上焦点外框（用户反馈"一打开就有一个按钮有红框，不需要"）。
    // 键盘用户按下方向键时再由 moveFocus() 聚焦，鼠标用户直接点。
  }

  function hide() {
    dom.overlay.classList.add('hidden');
    dom.panel.innerHTML = '';
    screen = 'none';
    rebind = null;
    confirm = null;
    message = '';
  }

  function focusables() {
    const list = dom.panel.querySelectorAll ? dom.panel.querySelectorAll('button') : [];
    return Array.prototype.slice.call(list).filter((b) => !b.disabled);
  }

  /** 当前有没有"按钮"持有焦点（键盘用户用方向键聚焦后就是这个） */
  function focusedButton() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || active === dom.panel) return null;
    const f = focusables();
    return f.indexOf(active) >= 0 ? active : null;
  }

  function isActivateKey(code) {
    return code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
  }

  /** 处理回车/空格：优先激活当前聚焦的按钮，否则执行本界面的"主要动作" */
  function activate(e, primary) {
    const focused = focusedButton();
    if (focused && focused.click) {
      if (e && e.preventDefault) e.preventDefault();
      focused.click();
      return true;
    }
    if (primary) {
      if (e && e.preventDefault) e.preventDefault();
      primary();
      return true;
    }
    return false;
  }

  function moveFocus(delta) {
    const f = focusables();
    if (!f.length) return;
    const cur = f.indexOf(focusedButton());
    const next = cur < 0 ? (delta > 0 ? 0 : f.length - 1) : (cur + delta + f.length) % f.length;
    if (f[next] && f[next].focus) f[next].focus();
  }

  function wireTabs() {
    const tabs = dom.panel.querySelectorAll ? dom.panel.querySelectorAll('.tab') : [];
    Array.prototype.forEach.call(tabs, (b) => {
      b.onclick = () => { cb.uiSound(); tab = b.dataset.tab; message = ''; confirm = null; renderMenu(); };
    });
  }

  function levelsOf() { return st().levels || []; }

  function groupOf(groupId) {
    const list = st().groups || [];
    return list.find((g) => g.id === groupId) || { id: groupId, name: groupId || '', desc: '' };
  }

  /** 关卡在本组里的序号（从 0 起）：加了新分组之后，"第几关"按组内算更清楚 */
  function inGroupIndex(globalIndex) {
    const all = levelsOf();
    const g = (all[globalIndex] && all[globalIndex].group) || 'default';
    let n = -1;
    for (let i = 0; i <= globalIndex; i++) {
      if (((all[i] && all[i].group) || 'default') === g) n++;
    }
    return Math.max(0, n);
  }

  function levelLabel(globalIndex) {
    const all = levelsOf();
    const lv = all[globalIndex];
    if (!lv) return '';
    const g = groupOf(lv.group);
    return `${g.name ? `${g.name} ` : ''}第 ${inGroupIndex(globalIndex) + 1} 关 · ${lv.name}`;
  }

  // ---------------------------------------------------------------- 主菜单

  function renderMenu() {
    screen = 'menu';
    rebind = null;
    const s = st();
    const panels = { start: panelStart(), levels: panelLevels(), settings: panelSettings(), help: panelHelp() };
    const tabs = TABS.map((t) => `<button class="tab ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
    open(`
      <div class="menu-head">
        <h1>光影之间</h1>
        <p class="tagline">同一张地图，光与暗两条路 · 任何一个世界都无法单独通关</p>
      </div>
      <nav class="tabs">${tabs}</nav>
      <div class="tab-panel">${panels[tab] || panels.start}</div>
      <div class="menu-foot">
        <span>${s.dev ? '开发模式：<kbd>,</kbd> <kbd>.</kbd> 切关 · <kbd>0</kbd> 单世界调试' : '键盘与鼠标都可以操作'}</span>
        <span>v1.0 · 纯静态 · 零依赖</span>
      </div>
    `, 'panel menu');
    wireTabs();
    cb.wirePanel(dom.panel); // 让主模块接上各按钮的点击
  }

  function panelStart() {
    const s = st();
    const total = levelsOf().length;
    const firstGroup = groupOf(levelsOf()[0] && levelsOf()[0].group);
    const clearedCount = levelsOf().filter((l) => s.records && s.records.levelBestMs[String(l.id)] != null).length;
    return `
      <div class="section">
        <h3>开始</h3>
        <div class="cta-row">
          <button class="btn primary big" data-act="play-first">开始游戏</button>
          <button class="btn" data-act="tab-levels">选择关卡</button>
        </div>
        <p class="footnote">从「${esc(firstGroup.name)}」第 1 关开始。所有关卡一开始就全部开放，随时可以跳到任意一关；通关进度会自动保存在本机。</p>
      </div>
      <div class="section">
        <h3>进度</h3>
        <div class="kv-row"><span class="lab">已通关</span><span><span class="badge ${clearedCount ? 'ok' : ''}">${clearedCount} / ${total} 关</span></span></div>
      </div>
      <div class="section">
        <h3>怎么玩</h3>
        <p class="footnote">
          一张地图有光与暗两个世界，起点终点完全相同、路线完全不同。<br>
          按 <kbd>${esc(s.keyLabel('switchWorld'))}</kbd> 可以在<b>任意时刻</b>切换世界，位置与速度都会原样保留 ——
          在空中切换，跳跃的抛物线会被接续下去。<br>
          切换失败不会有任何代价（只闪一下红），死了也只是回到本关起点。放心试。
        </p>
      </div>
    `;
  }

  /** 关卡卡片：不显示成绩，只标"已通关"（成绩在关卡结算界面里看） */
  function levelCard(lv, globalIndex, inGroupIndex, cleared) {
    return `
      <button class="level-card ${cleared ? 'clear' : ''}" data-act="play-level" data-index="${globalIndex}">
        <span class="no">第 ${inGroupIndex + 1} 关${cleared ? ' · 已通关' : ''}</span>
        <span class="nm">${esc(lv.name)}</span>
        <span class="bs dim">${lv.solution ? '有标准解法' : ''}</span>
      </button>`;
  }

  function panelLevels() {
    const s = st();
    const declared = s.groups && s.groups.length ? s.groups.slice() : [];
    const all = levelsOf().map((lv, i) => ({ lv, i }));
    // 关卡里出现、但 LEVEL_GROUPS 没声明的分组也照样显示（免得新关卡"隐形"）
    for (const { lv } of all) {
      const id = lv.group || 'default';
      if (!declared.some((g) => g.id === id)) declared.push({ id, name: id, desc: '' });
    }
    const clearedCount = all.filter(({ lv }) => s.records && s.records.levelBestMs[String(lv.id)] != null).length;

    const sections = declared.map((g) => {
      const items = all.filter(({ lv }) => (lv.group || 'default') === g.id);
      const cards = items.length
        ? `<div class="level-grid">${items.map(({ lv, i }, k) => levelCard(lv, i, k, s.records && s.records.levelBestMs[String(lv.id)] != null)).join('')}</div>`
        : '<p class="placeholder">正在设计 —— 这一组会放更难、更复杂的关卡。</p>';
      return `
        <div class="section">
          <h3>${esc(g.name)} <span class="badge">${items.length} 关</span></h3>
          ${g.desc ? `<p class="footnote">${esc(g.desc)}</p>` : ''}
          ${cards}
        </div>`;
    }).join('');

    return `
      ${sections}
      <div class="section">
        <h3>说明</h3>
        <p class="footnote">
          已通关 ${clearedCount} / ${all.length} 关。每关都经过"只在光世界走不通、只在暗世界也走不通"的双向验证。<br>
          游戏内按 <kbd>${esc(s.keyLabel('pause'))}</kbd> 可以暂停并查看本关的标准解法演示。
        </p>
      </div>
    `;
  }

  function panelSettings() {
    const s = st();
    const rows = ACTIONS.map((a) => `
      <div class="kv-row">
        <span class="lab">${a.label}</span>
        <span class="keys">${keyLabelsOf(s.bindings, a.id).map((k) => `<kbd>${esc(k)}</kbd>`).join(' ')}</span>
      </div>`).join('');
    const clearedCount = levelsOf().filter((l) => s.records && s.records.levelBestMs[String(l.id)] != null).length;
    return `
      <div class="section">
        <h3>声音</h3>
        <div class="kv-row">
          <span class="lab">音效（Web Audio 程序合成，无音频文件）</span>
          <span><button class="btn" data-act="toggle-mute">${s.muted ? '已静音' : '开启中'}</button></span>
        </div>
      </div>
      <div class="section">
        <h3>按键</h3>
        <div class="kv-rows compact">${rows}</div>
        <div class="cta-row">
          <button class="btn" data-act="open-rebind">按键设置…</button>
          <button class="btn" data-act="reset-bindings">${confirm === 'resetBindings' ? '再点一次确认恢复默认' : '恢复默认键位'}</button>
        </div>
        <p class="footnote">每个动作支持多个槽位：改键是"增加一个键"，不会把原来的键弄丢。所有操作提示都会跟着当前绑定自动变化。</p>
      </div>
      <div class="section">
        <h3>成绩</h3>
        <div class="kv-row">
          <span class="lab">已保存 ${clearedCount} 关的最佳成绩</span>
          <span><button class="btn danger" data-act="clear-records">${confirm === 'clearRecords' ? '再点一次确认清空' : '清空成绩'}</button></span>
        </div>
        <p class="footnote">清空只影响本机 localStorage 里的成绩，不影响关卡与键位。</p>
      </div>
      <div class="section">
        <h3>显示</h3>
        <div class="kv-row">
          <span class="lab">显示另一个世界的残影（叠影）</span>
          <span><button class="btn" data-act="toggle-ghosts">${s.showGhosts ? '开' : '关'}</button></span>
        </div>
        <p class="footnote">关掉时看不见另一个世界的形状，得靠记忆判断 —— 难度会明显上升。默认关闭。</p>
        <div class="kv-row"><span class="lab">画布缩放</span><span class="mono" data-role="scale-info">—</span></div>
        <div class="kv-row"><span class="lab">逻辑分辨率</span><span class="mono">640 × 384（20 × 12 格，5 : 3）</span></div>
        ${s.dev ? '<div class="kv-row"><span class="lab">单世界调试开关</span><span><button class="btn" data-act="toggle-force">强制单世界</button></span></div>' : ''}
      </div>
      ${message ? `<p class="msg">${esc(message)}</p>` : ''}
    `;
  }

  function panelHelp() {
    const s = st();
    const k = (a) => esc(s.keyLabel(a));
    return `
      <div class="section">
        <h3>操作</h3>
        <div class="kv-rows compact">
          <div class="kv-row"><span class="lab">左移 / 右移</span><span class="keys"><kbd>${k('moveLeft')}</kbd> <kbd>${k('moveRight')}</kbd></span></div>
          <div class="kv-row"><span class="lab">跳跃（按住跳更高）</span><span class="keys"><kbd>${k('jump')}</kbd></span></div>
          <div class="kv-row"><span class="lab">切换世界</span><span class="keys"><kbd>${k('switchWorld')}</kbd></span></div>
          <div class="kv-row"><span class="lab">重开本关</span><span class="keys"><kbd>${k('restart')}</kbd></span></div>
          <div class="kv-row"><span class="lab">暂停 / 菜单</span><span class="keys"><kbd>${k('pause')}</kbd></span></div>
        </div>
      </div>
      <div class="section">
        <h3>核心机制</h3>
        <p class="footnote">
          ① <b>定位换世界</b>：切换不移动、不改变速度矢量。跳跃中切换，抛物线会接着走。<br>
          ② <b>目标位置必须全空</b>：切换会把玩家的整个碰撞盒拿到另一个世界做判定；被挡住就切换失败，
          失败没有冷却、没有惩罚，只有一次闪红。<br>
          ③ <b>每边都有代价</b>：光世界的坑在暗世界是地板，暗世界别处又有熔岩 —— 没有任何一个世界能单独走通。
        </p>
      </div>
      <div class="section">
        <h3>其他</h3>
        <div class="kv-rows compact">
          <div class="kv-row"><span class="lab">看本关标准解法</span><span class="keys"><kbd>H</kbd></span></div>
          <div class="kv-row"><span class="lab">计时口径</span><span class="footnote">只统计实际游玩时间：暂停不计时、切标签页不暴涨、死亡与重开都不清零</span></div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------- 暂停菜单

  function showPause() {
    screen = 'pause';
    rebind = null;
    const s = st();
    const lv = levelsOf()[s.currentLevelIndex];
    open(`
      <div class="menu-head">
        <h2>已暂停</h2>
        <p class="tagline">${esc(levelLabel(s.currentLevelIndex))} · 本关计时已停止</p>
      </div>
      <div class="tab-panel">
        <div class="section">
          <h3>继续</h3>
          <div class="cta-row">
            <button class="btn primary big" data-act="resume">继续游戏（<kbd>${esc(s.keyLabel('pause'))}</kbd>）</button>
            <button class="btn" data-act="restart">重开本关（<kbd>${esc(s.keyLabel('restart'))}</kbd>）</button>
          </div>
        </div>
        <div class="section">
          <h3>关卡</h3>
          <div class="cta-row">
            <button class="btn" data-act="demo-current">看本关解法演示（<kbd>H</kbd>）</button>
            <button class="btn" data-act="open-levels">选择关卡</button>
          </div>
        </div>
        <div class="section">
          <h3>设置</h3>
          <div class="cta-row">
            <button class="btn" data-act="open-rebind">按键设置…</button>
            <button class="btn" data-act="toggle-mute">音效：${s.muted ? '关' : '开'}</button>
          </div>
        </div>
        <div class="section">
          <h3>其他</h3>
          <div class="cta-row">
            <button class="btn" data-act="go-title">返回主界面</button>
          </div>
        </div>
      </div>
      <div class="menu-foot"><span>切换世界 <kbd>${esc(s.keyLabel('switchWorld'))}</kbd></span><span>进度与成绩保存在本机</span></div>
    `, 'panel menu');
    cb.wirePanel(dom.panel);
  }

  // ---------------------------------------------------------------- 按键设置子页

  function showSettings(opts = {}) {
    screen = 'settings';
    if (opts.message != null) message = opts.message;
    rebind = opts.rebind !== undefined ? opts.rebind : null;
    const s = st();
    const rows = ACTIONS.map((a) => {
      const slots = keyLabelsOf(s.bindings, a.id).map((label, i) => {
        const waiting = rebind && rebind.actionId === a.id && rebind.slot === i;
        return `<button class="slot ${waiting ? 'waiting' : ''}" data-act="rebind" data-action="${a.id}" data-slot="${i}">${waiting ? '请按键…' : esc(label)}</button>`;
      }).join(' ');
      return `<div class="kv-row"><span class="lab">${a.label}</span><span class="keys">${slots}</span></div>`;
    }).join('');
    open(`
      <div class="menu-head">
        <h2>按键设置</h2>
        <p class="tagline">点一个槽位，再按下新键即可。每个动作可以有多个键；<kbd>Esc</kbd> 取消本次修改。</p>
      </div>
      <div class="tab-panel">
        <div class="kv-rows">${rows}</div>
        ${message ? `<p class="msg">${esc(message)}</p>` : ''}
        <div class="cta-row">
          <button class="btn" data-act="reset-bindings">${confirm === 'resetBindings' ? '再点一次确认恢复默认' : '恢复默认'}</button>
          <button class="btn primary" data-act="close-settings">返回</button>
        </div>
        <p class="footnote">禁止绑定：<kbd>F5</kbd> <kbd>F11</kbd> <kbd>F12</kbd> <kbd>Esc</kbd> <kbd>Tab</kbd>、Win 键、以及任何 Ctrl / Alt 组合键。</p>
      </div>
    `, 'panel menu');
    cb.wirePanel(dom.panel);
  }

  // ---------------------------------------------------------------- 结算

  function showSettlement(result) {
    screen = 'settlement';
    settlement = result;
    const s = st();
    const lv = levelsOf()[result.levelIndex];
    const best = s.records ? s.records.levelBestMs[String(lv.id)] : null;
    const delta = best != null && !result.isRecord ? result.timeMs - best : null;
    const jumpKey = esc(s.keyLabel('jump'));
    open(`
      <div class="menu-head">
        <h2>${result.isLast ? '全部通关' : `${esc(levelLabel(result.levelIndex))} 完成`}</h2>
        <p class="tagline">${result.isLast ? '全部关卡走完，谢谢试玩' : '结算界面不计时'}</p>
      </div>
      <div class="tab-panel">
        <div class="section">
          <h3>成绩</h3>
          <div class="kv-row"><span class="lab">本关用时</span><span class="big">${formatTime(result.timeMs)}</span></div>
          <div class="kv-row"><span class="lab">本关最佳</span><span class="mono">${best != null ? formatTime(best) : '—'}
            ${result.isRecord ? '<span class="record">NEW RECORD</span>' : delta != null ? `<span class="delta">${formatDelta(delta)}</span>` : ''}</span></div>
        </div>
        <p class="footnote">死亡与重开都不会清零本关用时，所以这个时间包含了所有试错 —— 本作比的是"想清楚"，不是手速。</p>
        <div class="cta-row">
          <button class="btn primary big" data-act="next">${result.isLast ? '返回主界面' : `进入下一关（<kbd>${jumpKey}</kbd>）`}</button>
          <button class="btn" data-act="replay">再玩一次</button>
          ${result.isLast ? '' : '<button class="btn" data-act="go-title">返回主界面</button>'}
        </div>
      </div>
    `, 'panel menu');
    cb.wirePanel(dom.panel);
  }

  // ---------------------------------------------------------------- 键盘

  /** 返回 true 表示这次按键已经被界面消费掉 */
  function handleKey(e) {
    if (screen === 'none' || !e) return false;
    if (e.code === 'Escape') {
      if (screen === 'settings') { cb.closeSettings(); return true; }
      if (screen === 'pause') { cb.resume(); return true; }
      return true; // 主界面 / 结算：吃掉 Esc，不做别的事
    }
    if (isActivateKey(e.code)) {
      if (screen === 'settlement') return activate(e, cb.advance);
      if (screen === 'pause') return activate(e, cb.resume);
      if (screen === 'menu' && tab === 'start') return activate(e, cb.startFirst);
      return activate(e, null); // 其它页签：只激活聚焦的按钮（鼠标用户没有焦点就不响应）
    }
    if (screen === 'menu' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      const i = TABS.findIndex((t) => t.id === tab);
      const next = (i + (e.code === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      tab = TABS[next].id;
      message = '';
      confirm = null;
      renderMenu();
      return true;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      moveFocus(e.code === 'ArrowDown' ? 1 : -1);
      return true;
    }
    return false; // 其余交给浏览器
  }

  return {
    showMenu(opts = {}) {
      if (opts.tab) tab = opts.tab;
      if (opts.message != null) message = opts.message;
      confirm = null;
      renderMenu();
    },
    showPause,
    showSettings,
    showSettlement,
    hide,
    handleKey,
    get screen() { return screen; },
    get tab() { return tab; },
    get confirm() { return confirm; },
    setTab(t) { tab = t; },
    setMessage(m) { message = m; },
    setRebind(r) { rebind = r; },
    setConfirm(c) { confirm = c; },
    refresh() {
      if (screen === 'menu') renderMenu();
      else if (screen === 'pause') showPause();
      else if (screen === 'settings') showSettings({});
    },
    /** 设置页里显示当前画布缩放倍率 */
    setScaleInfo(text) {
      const el = dom.panel.querySelector ? dom.panel.querySelector('[data-role="scale-info"]') : null;
      if (el) el.textContent = text;
    },
    get settlementResult() { return settlement; },
  };
}

export { TABS };
