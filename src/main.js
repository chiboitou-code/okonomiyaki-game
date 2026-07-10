import { createGameState, SCENES } from "./game/gameState.js";
import { CookingPhase } from "./game/cookingPhase.js";
import { AdultCookingPhase } from "./game/adultCookingPhase.js";
import { AdultToppingPhase } from "./game/adultToppingPhase.js";
import { ToppingPhase } from "./game/toppingPhase.js";
import { loadImage, isReady, resolvePath, waitForAllImages } from "./game/assets.js";
import { playSfx, playMusic, stopMusic, unlockAudioOnFirstTap } from "./game/audio.js";
import { SOUNDS } from "./game/sounds.js";

unlockAudioOnFirstTap();
let bgmStarted = false;

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const uiLayer = document.getElementById("ui-layer");

// 全シーン共通の背景（無ければCSSの背景色のまま）
const BACKGROUND_IMG = loadImage("/images/ui/background_kitchen.png");
// 背景の縦位置調整：0=画像の上端を画面上端に合わせる／1=画像の下端を画面下端に合わせる／0.5=中央
const BACKGROUND_VERTICAL_ANCHOR = 0.75;

const state = createGameState();
let cookingPhase = null;
let adultCookingPhase = null;
let adultToppingPhase = null;
let toppingPhase = null;

let width = 0;
let height = 0;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  width = rect.width;
  height = rect.height;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// 対応している環境（Androidでホーム画面に追加した場合など）では、念のため縦向き固定を試みる。
// 非対応のブラウザ（iOS Safari等）ではエラーになるだけなので、失敗しても無視してよい。
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock("portrait").catch(() => {
    // 非対応・失敗時は何もしない（CSSの回転案内オーバーレイでカバーされる）
  });
}

// ---------- ローディング画面 ----------
function showLoadingUI() {
  uiLayer.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.id = "loading-wrap";
  wrap.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#fdf6e3;";

  const label = document.createElement("div");
  label.id = "loading-label";
  label.textContent = "よみこみちゅう… 0%";
  label.style.cssText = "font-size:18px;font-weight:bold;color:#5a2d0c;";

  const barOuter = document.createElement("div");
  barOuter.style.cssText = "width:70%;max-width:280px;height:14px;background:#eee;border-radius:999px;overflow:hidden;";
  const barInner = document.createElement("div");
  barInner.id = "loading-bar-inner";
  barInner.style.cssText = "width:0%;height:100%;background:#ff8a3d;transition:width 0.15s ease-out;";
  barOuter.appendChild(barInner);

  wrap.append(label, barOuter);
  uiLayer.appendChild(wrap);
}

function updateLoadingUI(loaded, total) {
  const percent = total === 0 ? 100 : Math.floor((loaded / total) * 100);
  const label = document.getElementById("loading-label");
  const barInner = document.getElementById("loading-bar-inner");
  if (label) label.textContent = `よみこみちゅう… ${percent}%`;
  if (barInner) barInner.style.width = `${percent}%`;
}

// ---------- UI描画（タイトル画面のみDOM。それ以外はCanvas側で描画する） ----------
function renderUI() {
  uiLayer.innerHTML = "";

  if (state.scene === SCENES.TITLE) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;";

    const title = document.createElement("div");
    title.textContent = "くるっと！おこのみやき";
    title.style.cssText = "font-size:28px;font-weight:bold;color:#5a2d0c;";

    const logoImg = document.createElement("img");
    logoImg.src = resolvePath("/images/ui/title_logo.png");
    logoImg.alt = "くるっと！おこのみやき";
    logoImg.style.cssText = "max-width:104%;display:none;";
    logoImg.onload = () => {
      logoImg.style.display = "block";
      title.style.display = "none";
    };
    logoImg.onerror = () => {
      logoImg.remove();
    };

    const simpleBtn = document.createElement("button");
    simpleBtn.className = "btn";
    simpleBtn.textContent = "シンプルモード";
    simpleBtn.onclick = () => {
      playSfx(SOUNDS.start);
      if (!bgmStarted) {
        bgmStarted = true;
        playMusic(SOUNDS.bgm, { loop: true, volume: 0.5 });
      }
      startCooking();
    };

    const scoreBtn = document.createElement("button");
    scoreBtn.className = "btn";
    scoreBtn.style.cssText = "background:#5a2d0c;box-shadow:0 4px 0 #3a1d08;";
    scoreBtn.textContent = "スコアモード";
    scoreBtn.onclick = () => {
      playSfx(SOUNDS.start);
      if (!bgmStarted) {
        bgmStarted = true;
        playMusic(SOUNDS.bgm, { loop: true, volume: 0.5 });
      }
      startAdultCooking();
    };

    wrap.append(logoImg, title, simpleBtn, scoreBtn);
    uiLayer.appendChild(wrap);
  }
}

// ---------- シーン遷移 ----------
function startCooking() {
  state.scene = SCENES.COOKING;
  cookingPhase = new CookingPhase({
    onComplete: () => {
      state.scene = SCENES.TOPPING;
      toppingPhase = new ToppingPhase({
        onRetry: () => {
          resetGame();
        },
      });
      renderUI();
    },
    onFail: () => {
      startCooking();
    },
  });
  renderUI();
}

function startAdultCooking() {
  state.scene = SCENES.ADULT_COOKING;
  adultCookingPhase = new AdultCookingPhase({
    onComplete: (cookingScore) => {
      state.scene = SCENES.ADULT_TOPPING;
      adultToppingPhase = new AdultToppingPhase({
        initialScore: cookingScore,
        onFinish: () => {
          resetGame();
        },
      });
      renderUI();
    },
  });
  renderUI();
}

function resetGame() {
  state.scene = SCENES.TITLE;
  cookingPhase = null;
  adultCookingPhase = null;
  adultToppingPhase = null;
  toppingPhase = null;
  stopMusic(SOUNDS.bgm);
  bgmStarted = false;
  renderUI();
}

// ---------- ポインター操作 ----------
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (e) => {
  const t = performance.now() / 1000;
  if (state.scene === SCENES.COOKING && cookingPhase) {
    cookingPhase.handleTap(t);
  } else if (state.scene === SCENES.ADULT_COOKING && adultCookingPhase) {
    adultCookingPhase.handleTap(t);
  } else if (state.scene === SCENES.ADULT_TOPPING && adultToppingPhase) {
    const { x, y } = getPos(e);
    adultToppingPhase.handleTap(t);
    adultToppingPhase.handlePointerDown(x, y, t, width, height);
  } else if (state.scene === SCENES.TOPPING && toppingPhase) {
    toppingPhase.handleTap(t);
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (state.scene !== SCENES.ADULT_TOPPING || !adultToppingPhase) return;
  const t = performance.now() / 1000;
  const { x, y } = getPos(e);
  adultToppingPhase.handlePointerMove(x, y, t, width, height);
});

canvas.addEventListener("pointerup", (e) => {
  if (state.scene !== SCENES.ADULT_TOPPING || !adultToppingPhase) return;
  const t = performance.now() / 1000;
  const { x, y } = getPos(e);
  adultToppingPhase.handlePointerUp(x, y, t);
});

// ---------- メインループ ----------
let lastTime = performance.now();
function loop(now) {
  const deltaSeconds = (now - lastTime) / 1000;
  lastTime = now;
  const elapsedSeconds = now / 1000;

  ctx.clearRect(0, 0, width, height);

  // 背景（全シーン共通）
  if (isReady(BACKGROUND_IMG)) {
    const scale = Math.max(width / BACKGROUND_IMG.naturalWidth, height / BACKGROUND_IMG.naturalHeight);
    const drawW = BACKGROUND_IMG.naturalWidth * scale;
    const drawH = BACKGROUND_IMG.naturalHeight * scale;
    const offsetY = (height - drawH) * BACKGROUND_VERTICAL_ANCHOR;
    ctx.drawImage(BACKGROUND_IMG, (width - drawW) / 2, offsetY, drawW, drawH);
  }

  if (state.scene === SCENES.COOKING && cookingPhase) {
    cookingPhase.update(deltaSeconds, elapsedSeconds);
    cookingPhase.render(ctx, width, height, elapsedSeconds);
  } else if (state.scene === SCENES.ADULT_COOKING && adultCookingPhase) {
    adultCookingPhase.update(deltaSeconds, elapsedSeconds);
    adultCookingPhase.render(ctx, width, height, elapsedSeconds);
  } else if (state.scene === SCENES.ADULT_TOPPING && adultToppingPhase) {
    adultToppingPhase.update(deltaSeconds, elapsedSeconds);
    adultToppingPhase.render(ctx, width, height, elapsedSeconds);
  } else if (state.scene === SCENES.TOPPING && toppingPhase) {
    toppingPhase.update(deltaSeconds, elapsedSeconds);
    toppingPhase.render(ctx, width, height, elapsedSeconds);
  }

  requestAnimationFrame(loop);
}

// ---------- 起動処理：画像が揃うまでローディング画面を表示してから開始 ----------
showLoadingUI();
waitForAllImages({ timeoutMs: 10000, onProgress: updateLoadingUI }).then(() => {
  renderUI();
  requestAnimationFrame(loop);
});
