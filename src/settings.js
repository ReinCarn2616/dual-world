// 键位绑定、冲突检测、持久化（§4.5）
// 纯逻辑 + 少量 localStorage：不触碰 DOM，可在 Node 里被验证脚本安全导入。

export const STORAGE_SETTINGS = 'dual-world.settings';
export const SETTINGS_VERSION = 1;

/** 默认绑定（§4.5.1）。每个动作支持多个槽位，"改键"永远是增加一个键而不是替换。 */
export const DEFAULT_BINDINGS = {
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'KeyW', 'ArrowUp'],
  switchWorld: ['KeyJ', 'ShiftLeft'],
  restart: ['KeyR'],
  pause: ['Escape', 'KeyP'],
};

/** 动作显示名（顺序即设置界面顺序） */
export const ACTIONS = [
  { id: 'moveLeft', label: '左移' },
  { id: 'moveRight', label: '右移' },
  { id: 'jump', label: '跳跃' },
  { id: 'switchWorld', label: '切换世界' },
  { id: 'restart', label: '重开本关' },
  { id: 'pause', label: '暂停' },
];

/** 固定不可改：取消重绑（§4.5.1） */
export const CANCEL_CODE = 'Escape';

/** 禁止绑定的键（§4.5.4） */
export const FORBIDDEN_CODES = ['F5', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'Escape', 'Tab'];

/** 被浏览器/系统抢先处理，或与 Ctrl/Alt 组合的键（§4.5.4） */
export function isForbiddenCode(code, modifiers = {}) {
  if (!code) return '无效按键';
  if (FORBIDDEN_CODES.includes(code)) return `${code} 被系统占用，不能绑定`;
  if (modifiers.ctrlKey || modifiers.altKey) return '不允许绑定 Ctrl / Alt 组合键';
  return null;
}

function cloneBindings(src) {
  const out = {};
  for (const a of ACTIONS) out[a.id] = [...src[a.id]];
  return out;
}

/** 默认绑定的一份副本 */
export function defaultBindings() {
  return cloneBindings(DEFAULT_BINDINGS);
}

/**
 * 逐字段容错解析（§4.5.5 / §8.4）：解析失败、字段类型不对、未知动作 id
 * 一律回退到默认值，绝不因为设置损坏而打不开游戏。
 */
export function sanitizeBindings(raw) {
  const out = defaultBindings();
  if (!raw || typeof raw !== 'object') return out;
  for (const a of ACTIONS) {
    const v = raw[a.id];
    if (!Array.isArray(v)) continue;
    const slots = v.filter((x) => typeof x === 'string' && x.length > 0 && !FORBIDDEN_CODES.includes(x));
    if (slots.length === DEFAULT_BINDINGS[a.id].length) out[a.id] = slots;
    else if (slots.length > 0) {
      // 槽位数量不符时保留玩家已改的键，其余补默认值（仍然可用）
      const merged = [...slots];
      for (const d of DEFAULT_BINDINGS[a.id]) {
        if (merged.length >= DEFAULT_BINDINGS[a.id].length) break;
        if (!merged.includes(d)) merged.push(d);
      }
      out[a.id] = merged.slice(0, DEFAULT_BINDINGS[a.id].length);
    }
  }
  return out;
}

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Safari 无痕等环境可能直接抛异常（§8.4）
    const probe = '__dw_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch (_e) {
    return null;
  }
}

export function loadSettings() {
  const fallback = { version: SETTINGS_VERSION, bindings: defaultBindings(), showGhosts: false };
  const store = safeStorage();
  if (!store) return fallback;
  try {
    const text = store.getItem(STORAGE_SETTINGS);
    if (!text) return fallback;
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || raw.version !== SETTINGS_VERSION) return fallback;
    return {
      version: SETTINGS_VERSION,
      bindings: sanitizeBindings(raw.bindings),
      // 叠影默认关闭（已确认的显示偏好）；字段缺失或类型不对都回退到默认值
      showGhosts: typeof raw.showGhosts === 'boolean' ? raw.showGhosts : false,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[settings] dual-world.settings 损坏，已回退默认键位：', err && err.message);
    return fallback;
  }
}

export function saveSettings(bindings, showGhosts = false) {
  const store = safeStorage();
  if (!store) return false;
  try {
    store.setItem(STORAGE_SETTINGS, JSON.stringify({
      version: SETTINGS_VERSION,
      bindings,
      showGhosts: !!showGhosts,
    }));
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[settings] 写入失败（可能处于隐私模式）：', err && err.message);
    return false;
  }
}

/**
 * 冲突检测：返回占用该键的**其他动作** id（同一个槽位自己不算冲突）。
 * 一个键只能对应一个动作，避免歧义（§4.5.4）。
 */
export function findConflict(bindings, actionId, code, exceptSlot = -1) {
  for (const a of ACTIONS) {
    const slots = bindings[a.id] || [];
    for (let i = 0; i < slots.length; i++) {
      if (a.id === actionId && i === exceptSlot) continue;
      if (slots[i] === code) return a.id;
    }
  }
  return null;
}

export function actionLabel(actionId) {
  const a = ACTIONS.find((x) => x.id === actionId);
  return a ? a.label : actionId;
}

const CODE_LABELS = {
  Space: '空格',
  Escape: 'Esc',
  ShiftLeft: '左Shift',
  ShiftRight: '右Shift',
  ControlLeft: '左Ctrl',
  ControlRight: '右Ctrl',
  AltLeft: '左Alt',
  AltRight: '右Alt',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '回车',
  Backspace: '退格',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
};

/**
 * 全项目唯一一处 code → 显示文本 的转换（§4.5.5）。
 * KeyA → A，Space → 空格，ArrowLeft → ←，ShiftLeft → 左Shift，Digit1 → 1。
 */
export function codeLabel(code) {
  if (!code) return '—';
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad')) return `小键盘${code.slice(6)}`;
  return code;
}

/** 取某动作的主绑定显示文本：hint 文案与所有面向玩家的提示都走这里 */
export function makeKeyLabel(bindings) {
  return (actionId) => {
    const slots = bindings[actionId];
    if (!slots || !slots.length) return '—';
    return codeLabel(slots[0]);
  };
}

/** 取某动作全部槽位的显示文本 */
export function keyLabelsOf(bindings, actionId) {
  return (bindings[actionId] || []).map(codeLabel);
}
