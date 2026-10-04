// 双世界调色板（需求文档 §7.1）
// 这 10 个颜色构成像素画总调色板（每世界 5 色）。
// 所有颜色必须是配置常量，不得散落在渲染代码中；DOM HUD 通过 CSS 变量读取同一组值。

export const PALETTE = {
  light: {
    bg: '#F4EFE2',      // 暖米白
    brick: '#2B2B33',   // 近黑
    player: '#E4572E',  // 橙红
    hazard: '#C1292E',  // 深红
    exit: '#3D9970',    // 橄榄绿
  },
  dark: {
    bg: '#14161F',      // 深靛
    brick: '#8A93B5',   // 冷灰蓝
    player: '#4ECDC4',  // 青绿
    hazard: '#FF6B35',  // 亮橙
    exit: '#F5D547',    // 亮黄
  },
};

// 叠影（幽灵）渲染参数（§7.2）
export const GHOST = {
  color: '#7A7A7A',
  solidAlpha: 0.18,
  hazardAlpha: 0.12,
};

// 切换失败的屏幕闪红（§7.3）
export const FAIL_FLASH = '#FF3B30';

export const WORLD_NAMES = ['光', '暗'];

/** 世界索引归一化（0 = 光，1 = 暗） */
export function worldKey(index) {
  return index === 1 ? 'dark' : 'light';
}

/** 取某世界的调色板 */
export function paletteOf(index) {
  return PALETTE[worldKey(index)];
}

/** 把当前世界调色板写到 CSS 变量上（供 DOM HUD 使用，§8.3 主题联动） */
export function applyCssVars(root, index) {
  if (!root || !root.style || !root.style.setProperty) return;
  const c = paletteOf(index);
  root.style.setProperty('--c-bg', c.bg);
  root.style.setProperty('--c-brick', c.brick);
  root.style.setProperty('--c-player', c.player);
  root.style.setProperty('--c-hazard', c.hazard);
  root.style.setProperty('--c-exit', c.exit);
  root.style.setProperty('--ghost', GHOST.color);
  root.style.setProperty('--fail', FAIL_FLASH);
}
