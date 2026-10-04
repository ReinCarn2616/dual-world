// 键盘状态、输入缓冲、土狼时间计时（读取 settings 的绑定）
//
// 硬性要求（§4.5.2）：一律使用 event.code，绝不能用 event.key。
// 中文输入法下 event.key 可能是 "Process"/全角字符/不触发，而 event.code 永远是物理键位。

import { ACTIONS } from './settings.js';

export function createInput(getBindings) {
  const down = new Set();          // 当前按住的物理键
  const actionByCode = new Map();  // code -> actionId
  const listeners = { anyKey: [], action: [], capture: null };

  let pendingJump = false;
  let pendingSwitch = false;
  let consumedThisFrame = false;
  let suppressed = false; // 界面（主菜单/暂停/结算）打开时抑制游戏输入

  function rebuild() {
    actionByCode.clear();
    const bindings = getBindings();
    for (const a of ACTIONS) {
      for (const code of bindings[a.id] || []) actionByCode.set(code, a.id);
    }
  }

  function isGameCode(code) {
    return actionByCode.has(code);
  }

  function onKeyDown(e) {
    // 捕获模式（改键）优先：吃掉这一次按键
    if (listeners.capture) {
      e.preventDefault();
      const fn = listeners.capture;
      listeners.capture = null;
      fn(e);
      return;
    }
    if (suppressed) {
      // 界面打开时：绝不 preventDefault —— 否则空格/Esc 这类游戏按键
      // 会让浏览器"激活当前聚焦按钮"的默认行为失效（用户报过这个 bug：
      // 结算界面按空格进不了下一关）。也不记录按下状态，避免菜单里按过的
      // 方向键被带进游戏。
      if (!e.repeat) for (const cb of listeners.anyKey) cb(e);
      return;
    }
    const action = actionByCode.get(e.code);
    if (action) e.preventDefault();
    if (e.repeat) return; // 长按不重复触发按下沿（§10.5：切换键只在按下沿触发）
    down.add(e.code);
    if (action === 'jump') pendingJump = true;
    if (action === 'switchWorld') pendingSwitch = true;
    for (const cb of listeners.anyKey) cb(e);
    if (action) for (const cb of listeners.action) cb(action, e);
  }

  function onKeyUp(e) {
    down.delete(e.code);
  }

  function onBlur() {
    down.clear(); // 切走窗口时松开全部按键，避免"回来还在跑"
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  rebuild();

  function isActionDown(actionId) {
    const bindings = getBindings();
    const slots = bindings[actionId] || [];
    return slots.some((c) => down.has(c));
  }

  return {
    rebuild,
    isGameCode,
    isActionDown,
    /** 界面打开/关闭时切换：打开时不再拦截按键、不再记录按下状态 */
    setSuppressed(v) {
      const next = !!v;
      if (next && !suppressed) {
        down.clear();
        pendingJump = false;
        pendingSwitch = false;
      }
      suppressed = next;
    },
    get suppressed() { return suppressed; },
    onAnyKey(cb) { listeners.anyKey.push(cb); },
    onAction(cb) { listeners.action.push(cb); },
    captureNextKey(cb) { listeners.capture = cb; },

    /** 每帧调用一次 */
    beginFrame() {
      consumedThisFrame = false;
    },

    /** 每个固定步调用一次；按下沿只在当帧的第一个固定步里为 true */
    sample() {
      const first = !consumedThisFrame;
      consumedThisFrame = true;
      const jumpPressed = first && pendingJump;
      const switchPressed = first && pendingSwitch;
      if (first) {
        pendingJump = false;
        pendingSwitch = false;
      }
      return {
        left: isActionDown('moveLeft'),
        right: isActionDown('moveRight'),
        jumpHeld: isActionDown('jump'),
        jumpPressed,
        switchPressed,
      };
    },

    /** 直接注入一次按下沿（用于演示/自动化测试） */
    press(actionId) {
      if (actionId === 'jump') pendingJump = true;
      if (actionId === 'switchWorld') pendingSwitch = true;
    },
  };
}
