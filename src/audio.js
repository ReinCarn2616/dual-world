// Web Audio 程序合成音效（§9）
// 全程使用 Web Audio API，不引入任何音频文件；总音量 ≤ 0.15。
// AudioContext 必须在首次用户手势时创建或恢复（浏览器自动播放策略）。

let ctx = null;
let master = null;
let enabled = true;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    return ctx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.15; // 避免答辩现场音响炸裂
    master.connect(ctx.destination);
  } catch (err) {
    enabled = false;
    console.warn('[audio] AudioContext 创建失败，静音运行：', err && err.message);
  }
  return ctx;
}

export function isAudioReady() {
  return !!(ctx && ctx.state === 'running');
}

function tone({ type = 'sine', from = 440, to = from, dur = 0.12, gain = 0.6, delay = 0 }) {
  if (!enabled || !ctx || !master) return;
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, from = 1800, to = 200, gain = 0.5 }) {
  if (!enabled || !ctx || !master) return;
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
  const t0 = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
}

export const sfx = {
  jump() { tone({ type: 'sine', from: 520, to: 780, dur: 0.09, gain: 0.5 }); },          // §9 短促上扬
  land() { tone({ type: 'triangle', from: 220, to: 180, dur: 0.06, gain: 0.45 }); },      // 闷响
  switchOk() { tone({ type: 'square', from: 880, to: 880, dur: 0.05, gain: 0.35 }); },    // 清脆 blip
  switchFail() { tone({ type: 'sawtooth', from: 160, to: 110, dur: 0.12, gain: 0.4 }); }, // 低沉 buzz
  die() { noise({ dur: 0.3, from: 1800, to: 200, gain: 0.4 }); },                         // 散开感
  clear() {                                                                               // 三音上行琶音
    tone({ type: 'sine', from: 523, to: 523, dur: 0.14, gain: 0.4, delay: 0 });
    tone({ type: 'sine', from: 659, to: 659, dur: 0.14, gain: 0.4, delay: 0.11 });
    tone({ type: 'sine', from: 784, to: 784, dur: 0.22, gain: 0.4, delay: 0.22 });
  },
  ui() { tone({ type: 'square', from: 660, to: 660, dur: 0.04, gain: 0.22 }); },
};

export function setMuted(m) { enabled = !m; if (master) master.gain.value = m ? 0 : 0.15; }
export function isMuted() { return !enabled; }
