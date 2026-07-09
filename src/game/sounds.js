import { loadSfx, loadMusic } from "./audio.js";

// public/audio/ にこのファイル名で音源を置けば、そのまま再生される。
// タップ音などの効果音はSFX（低遅延）、BGMは通常再生（ループ）で読み込む。
export const SOUNDS = {
  start: loadSfx("/audio/se_start.mp3"), // スタートボタンタップ時
  bgm: loadMusic("/audio/bgm.mp3"), // スタート後、ループ再生するBGM
  flipFirst: loadSfx("/audio/se_flip_first.mp3"), // 1回目のひっくり返しタップ音
  flip: loadSfx("/audio/se_flip.mp3"), // 2〜4回目のひっくり返しタップ音
  toppingTap: loadSfx("/audio/se_topping_tap.mp3"), // トッピングフェーズのタップ音
  gameOver: loadSfx("/audio/se_gameover.mp3"), // 失敗時
  retryTap: loadSfx("/audio/se_retry_tap.mp3"), // 「もういっかいする」「もういちど」共通
  clear: loadSfx("/audio/se_clear.mp3"), // かんせい画面になった瞬間
};
