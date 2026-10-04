// 资源加载、manifest 解析、缺失降级（§7.6）
//
// 启动 → 读取 assets/manifest.json → 逐项加载 PNG
//   成功且尺寸符合声明 → 建纹理，按 manifest 切帧
//   失败 / 尺寸不符 / 解析异常 → 回退到 procedural.js 的同名占位绘制 + 控制台 warn
// 全部处理完毕后进入标题画面。

import { SHEET_SPEC, makeProceduralSheet } from './procedural.js';

export const DEFAULT_MANIFEST = './assets/manifest.json';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
    img.src = src;
  });
}

function resolveSrc(base, src) {
  if (!src) return null;
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
  if (src.startsWith('./') || src.startsWith('../')) return src;
  // manifest 里的路径相对 assets/ 目录，全部使用相对路径（§10.6 C5）
  return `${base}${src}`;
}

/**
 * 返回 { sheets: { key: sheet }, warnings: [string], manifest }
 * sheet = { img, frameW, frameH, frames, anims?, fps?, footOffset, parallax?, procedural }
 */
export async function loadAssets(manifestUrl = DEFAULT_MANIFEST) {
  const warnings = [];
  const sheets = {};
  const dir = manifestUrl.replace(/[^/]*$/, ''); // assets/
  let manifest = null;

  try {
    const res = await fetch(manifestUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
    if (!manifest || typeof manifest !== 'object' || !manifest.sheets) {
      throw new Error('manifest 结构不正确（缺少 sheets）');
    }
  } catch (err) {
    warnings.push(`manifest 读取失败，全部使用程序化占位图：${err.message}`);
    manifest = null;
  }

  const declared = (manifest && manifest.sheets) || {};
  const keys = new Set([...Object.keys(SHEET_SPEC), ...Object.keys(declared)]);

  for (const key of keys) {
    const fallbackSpec = SHEET_SPEC[key];
    const dec = declared[key];
    if (!dec) {
      if (fallbackSpec) {
        warnings.push(`${key}: manifest 未声明，使用程序化占位图`);
        sheets[key] = proceduralSheet(key, fallbackSpec);
      }
      continue;
    }
    const spec = {
      frameW: dec.frameW != null ? dec.frameW : fallbackSpec && fallbackSpec.frameW,
      frameH: dec.frameH != null ? dec.frameH : fallbackSpec && fallbackSpec.frameH,
      frames: dec.frames != null ? dec.frames : fallbackSpec && fallbackSpec.frames,
      footOffset: dec.footOffset != null ? dec.footOffset : (fallbackSpec && fallbackSpec.footOffset) || 0,
      anims: dec.anims || (fallbackSpec && fallbackSpec.anims),
      fps: dec.fps != null ? dec.fps : fallbackSpec && fallbackSpec.fps,
      parallax: dec.parallax != null ? dec.parallax : fallbackSpec && fallbackSpec.parallax,
    };
    // 尺寸与约定不符按加载失败处理（§7.6.2）
    const mismatch = fallbackSpec && (spec.frameW !== fallbackSpec.frameW || spec.frameH !== fallbackSpec.frameH);
    if (mismatch) {
      warnings.push(`${key}: 声明的 frameW/frameH (${spec.frameW}×${spec.frameH}) 与约定 (${fallbackSpec.frameW}×${fallbackSpec.frameH}) 不符，使用程序化占位图`);
      sheets[key] = proceduralSheet(key, fallbackSpec);
      continue;
    }
    const src = resolveSrc(dir, dec.src);
    if (!src) {
      warnings.push(`${key}: 未声明 src，使用程序化占位图`);
      sheets[key] = proceduralSheet(key, fallbackSpec);
      continue;
    }
    try {
      const img = await loadImage(src);
      const frames = spec.frames != null ? spec.frames : Math.max(1, Math.round(img.width / spec.frameW));
      if (img.width !== spec.frameW * frames || img.height !== spec.frameH) {
        throw new Error(`尺寸 ${img.width}×${img.height} 与声明不符（应为 ${spec.frameW * frames}×${spec.frameH}）`);
      }
      sheets[key] = { img, ...spec, frames, procedural: false };
    } catch (err) {
      warnings.push(`${key}: ${err.message}，使用程序化占位图`);
      sheets[key] = proceduralSheet(key, fallbackSpec || spec);
    }
  }

  if (warnings.length) {
    for (const w of warnings) console.warn('[assets] 降级:', w);
  }
  return { sheets, warnings, manifest };
}

function proceduralSheet(key, spec) {
  const canvas = makeProceduralSheet(key);
  const frames = (spec && spec.frames) || (SHEET_SPEC[key] && SHEET_SPEC[key].frames) || 1;
  const frameW = (spec && spec.frameW) || (canvas && canvas.width / frames) || 32;
  const frameH = (spec && spec.frameH) || (canvas && canvas.height) || 32;
  return {
    img: canvas,
    frameW,
    frameH,
    frames,
    footOffset: (spec && spec.footOffset) || 0,
    anims: spec && spec.anims,
    fps: spec && spec.fps,
    parallax: spec && spec.parallax,
    procedural: true,
  };
}

/** 玩家精灵的默认帧序（manifest 未声明时使用；与 §7.5.3 的帧序一致） */
export const DEFAULT_ANIMS = {
  idle: [0, 1, 2, 3],
  run: [4, 5, 6, 7, 8, 9],
  jump: [10, 11],
  fall: [12, 13],
  land: [14, 15],
  die: [16, 17, 18, 19],
};
