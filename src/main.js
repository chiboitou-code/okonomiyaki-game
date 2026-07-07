import { createGameState, SCENES } from "./game/gameState.js";
import { CookingPhase } from "./game/cookingPhase.js";
import { ToppingPhase } from "./game/toppingPhase.js";
import { loadImage, isReady } from "./game/assets.js";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const uiLayer = document.getElementById("ui-layer");

// 全シーン共通の背景（無ければCSSの背景色のまま）
const BACKGROUND_IMG = loadImage("/images/ui/background_kitchen.png");
// 背景の縦位置調整：0=画像の上端を画面上端に合わせる／1=画像の下端を画面下端に合わせる／0.5=中央
const BACKGROUND_VERTICAL_ANCHOR = 0.75;

const state = createGameState();
let cookingPhase = null;
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
    logoImg.src = "/images/ui/title_logo.png";
    logoImg.alt = "くるっと！おこのみやき";
    logoImg.style.cssText = "max-width:80%;display:none;";
    logoImg.onload = () => {
      logoImg.style.display = "block";
      title.style.display = "none";
    };
    logoImg.onerror = () => {
      logoImg.remove();
    };

    const startBtn = document.createElement("button");
    startBtn.className = "btn";
    startBtn.textContent = "スタート";
    startBtn.onclick = startCooking;
    wrap.append(logoImg, title, startBtn);
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

function resetGame() {
  state.scene = SCENES.TITLE;
  cookingPhase = null;
  toppingPhase = null;
  renderUI();
}

// ---------- ポインター操作 ----------
canvas.addEventListener("pointerdown", () => {
  const t = performance.now() / 1000;
  if (state.scene === SCENES.COOKING && cookingPhase) {
    cookingPhase.handleTap(t);
  } else if (state.scene === SCENES.TOPPING && toppingPhase) {
    toppingPhase.handleTap(t);
  }
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
  } else if (state.scene === SCENES.TOPPING && toppingPhase) {
    toppingPhase.update(deltaSeconds, elapsedSeconds);
    toppingPhase.render(ctx, width, height, elapsedSeconds);
  }

  requestAnimationFrame(loop);
}

renderUI();
requestAnimationFrame(loop);
