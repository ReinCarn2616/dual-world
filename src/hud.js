// DOM HUD 的更新（§8.3）
// HUD 是普通 HTML 元素，与 canvas 是兄弟节点，物理上不可能重叠；主题由 CSS 变量驱动。

/** mm:ss.cc（超过 1 小时显示 h:mm:ss.cc） */
export function formatTime(ms) {
  const clamped = Math.max(0, Math.floor(ms));
  const totalCs = Math.floor(clamped / 10);
  const cs = totalCs % 100;
  const totalS = Math.floor(totalCs / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** 带符号差值，例如 + 00:03.21 / - 00:01.00 */
export function formatDelta(ms) {
  const sign = ms >= 0 ? '+' : '-';
  return `${sign} ${formatTime(Math.abs(ms))}`;
}

export function createHud(doc, els) {
  let lastTime = null;
  let lastLevel = null;
  let lastHint = null;

  return {
    update(view) {
      const { levelIndex, levelCount, levelName, groupName, hint, timeMs, world, forcedWorld } = view;
      const group = groupName ? `${groupName} ` : '';
      const levelText = `${group}${levelIndex + 1} / ${levelCount} · ${levelName}`;
      if (levelText !== lastLevel && els.level) {
        els.level.textContent = levelText;
        lastLevel = levelText;
      }
      const timeText = `本关 ${formatTime(timeMs)}`;
      if (timeText !== lastTime && els.time) {
        els.time.textContent = timeText;
        lastTime = timeText;
      }
      if (hint !== lastHint && els.hint) {
        els.hint.textContent = hint || '';
        lastHint = hint;
      }
      if (els.hud) {
        els.hud.classList.toggle('world-dark', world === 1);
        els.hud.classList.toggle('world-light', world === 0);
      }
      if (els.dev) {
        const parts = [];
        if (forcedWorld != null) parts.push(`单世界调试：强制${forcedWorld === 1 ? '暗' : '光'}世界（按 0 切换）`);
        if (view.dev) parts.push('开发模式：, / . 切换关卡');
        els.dev.textContent = parts.join(' · ');
      }
    },
  };
}
