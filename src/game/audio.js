import { resolvePath } from "./assets.js";

// 画像の assets.js と同じ考え方の、音声版ヘルパー。
// public/audio/ にファイルを置くと、次回再生時から自動的にこちらが使われる。
// まだファイルが無い間はエラーが握りつぶされるだけなので、今まで通り無音のまま進行できる。

const cache = new Map();
let unlocked = false;

export function loadSound(path) {
  const fullPath = resolvePath(path);
  if (cache.has(fullPath)) return cache.get(fullPath);

  const audio = new Audio(fullPath);
  audio.preload = "auto";
  cache.set(fullPath, audio);
  return audio;
}

export function playSound(sound, { loop = false, volume = 1 } = {}) {
  if (!sound) return;
  try {
    sound.loop = loop;
    sound.volume = volume;
    sound.currentTime = 0;
    // ファイルが無い/再生が許可されていない場合はエラーになるが、無視して進行させる
    sound.play().catch(() => {});
  } catch (e) {
    // noop
  }
}

export function stopSound(sound) {
  if (!sound) return;
  try {
    sound.pause();
    sound.currentTime = 0;
  } catch (e) {
    // noop
  }
}

// iOSなど、ユーザーが一度も画面に触れないと音を鳴らせないブラウザ向けの対策。
// 画面のどこかが最初にタップされた瞬間、読み込み済みの音を一瞬だけ再生→即停止して「解錠」する。
// これをしておかないと、スタートボタンを押してもBGM等が鳴らないことがある。
export function unlockAudioOnFirstTap() {
  if (unlocked) return;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    for (const audio of cache.values()) {
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {});
    }
  };
  document.addEventListener("pointerdown", unlock, { once: true });
}
