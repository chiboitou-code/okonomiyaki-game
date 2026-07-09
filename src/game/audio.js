import { resolvePath } from "./assets.js";

// ============================================================
// 効果音（SFX）：Web Audio APIで低遅延に再生する
// タップ音のように「すぐ鳴ってほしい音」はこちらを使う
// ============================================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfxCache = new Map(); // フルパス -> { buffer: AudioBuffer|null }

export function loadSfx(path) {
  const fullPath = resolvePath(path);
  if (sfxCache.has(fullPath)) return sfxCache.get(fullPath);

  const entry = { buffer: null };
  sfxCache.set(fullPath, entry);

  // 音声データを取得してデコードし、AudioBufferとしてメモリに持っておく。
  // ファイルが無い/デコード失敗時は entry.buffer が null のままになり、
  // playSfx() 側で無視されるので、今まで通り無音で進行できる。
  fetch(fullPath)
    .then((res) => res.arrayBuffer())
    .then((data) => audioCtx.decodeAudioData(data))
    .then((decoded) => {
      entry.buffer = decoded;
    })
    .catch(() => {});

  return entry;
}

export function playSfx(sfx, { volume = 1 } = {}) {
  if (!sfx || !sfx.buffer) return; // まだ読み込めていない場合は何もしない
  try {
    const source = audioCtx.createBufferSource();
    source.buffer = sfx.buffer;
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode).connect(audioCtx.destination);
    source.start(0);
  } catch (e) {
    // noop
  }
}

// ============================================================
// BGM：今まで通り通常のAudio要素でループ再生する
// （遅延が気にならない用途なので、シンプルなこちらのままでOK）
// ============================================================

const musicCache = new Map();

export function loadMusic(path) {
  const fullPath = resolvePath(path);
  if (musicCache.has(fullPath)) return musicCache.get(fullPath);

  const audio = new Audio(fullPath);
  audio.preload = "auto";
  musicCache.set(fullPath, audio);
  return audio;
}

export function playMusic(music, { loop = true, volume = 1 } = {}) {
  if (!music) return;
  try {
    music.loop = loop;
    music.volume = volume;
    music.currentTime = 0;
    music.play().catch(() => {});
  } catch (e) {
    // noop
  }
}

export function stopMusic(music) {
  if (!music) return;
  try {
    music.pause();
    music.currentTime = 0;
  } catch (e) {
    // noop
  }
}

// ============================================================
// 初回タップでの解錠処理（iOS等の自動再生制限への対策）
// ============================================================
let unlocked = false;
export function unlockAudioOnFirstTap() {
  if (unlocked) return;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    // Web Audio ContextはブラウザによってはSuspended状態で始まるため、明示的に再開させる
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    for (const music of musicCache.values()) {
      music
        .play()
        .then(() => {
          music.pause();
          music.currentTime = 0;
        })
        .catch(() => {});
    }
  };
  document.addEventListener("pointerdown", unlock, { once: true });
}
