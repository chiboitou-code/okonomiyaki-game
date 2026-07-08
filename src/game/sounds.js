import { loadSound } from "./audio.js";

// public/audio/ にこのファイル名で音源を置けば、そのまま再生される。
export const SOUNDS = {
  start: loadSound("/audio/se_start.mp3"), // スタートボタンタップ時
  bgm: loadSound("/audio/bgm.mp3"), // スタート後、ループ再生するBGM
  flipFirst: loadSound("/audio/se_flip_first.mp3"), // 1回目のひっくり返しタップ音
  flip: loadSound("/audio/se_flip.mp3"), // 2〜4回目のひっくり返しタップ音
  toppingTap: loadSound("/audio/se_topping_tap.mp3"), // トッピングフェーズのタップ音
  gameOver: loadSound("/audio/se_gameover.mp3"), // 失敗時
  retryTap: loadSound("/audio/se_retry_tap.mp3"), // 「もういっかいする」「もういちど」共通
  clear: loadSound("/audio/se_clear.mp3"), // かんせい画面になった瞬間
};
