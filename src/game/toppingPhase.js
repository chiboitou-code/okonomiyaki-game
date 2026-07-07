import { loadImage, isReady } from "./assets.js";

export const TOPPING_TYPES = {
  SAUCE: "sauce",
  MAYO: "mayo",
  AONORI: "aonori",
  KATSUOBUSHI: "katsuobushi",
};

// public/images/ にファイルを置くと自動的にこちらが使われる
const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");
const COMPLETE_IMG = loadImage("/images/ui/complete.png"); // 「かんせい」の全面イラスト（body_fail.pngと同じ使い方）

const TOPPING_OVERLAY_IMAGES = {
  [TOPPING_TYPES.SAUCE]: loadImage("/images/toppings/topping_sauce.png"),
  [TOPPING_TYPES.MAYO]: loadImage("/images/toppings/topping_mayo.png"),
  [TOPPING_TYPES.AONORI]: loadImage("/images/toppings/topping_aonori.png"),
  [TOPPING_TYPES.KATSUOBUSHI]: loadImage("/images/toppings/topping_katsuobushi.png"),
};

const FALLBACK_COLOR = {
  [TOPPING_TYPES.SAUCE]: "rgba(90,45,12,0.5)",
  [TOPPING_TYPES.MAYO]: "rgba(253,246,216,0.6)",
  [TOPPING_TYPES.AONORI]: "rgba(63,125,63,0.5)",
  [TOPPING_TYPES.KATSUOBUSHI]: "rgba(217,154,91,0.5)",
};

// 順番に「ソース→マヨネーズ→あおのり→かつおぶし」と進んでいく
const STEPS = [
  { type: TOPPING_TYPES.SAUCE, prompt: "ソースをぬろう！" },
  { type: TOPPING_TYPES.MAYO, prompt: "マヨネーズをかけよう！" },
  { type: TOPPING_TYPES.AONORI, prompt: "あおのりをかけよう！" },
  { type: TOPPING_TYPES.KATSUOBUSHI, prompt: "かつおぶしをかけよう！" },
];

const STEP_PAUSE = 0.5; // 秒。トッピングが乗った後、次のステップ（または完成画面）に進むまでの間

export class ToppingPhase {
  /**
   * @param {object} opts
   * @param {() => void} opts.onRetry - 「かんせい」画面がタップされた時（呼び出し側でタイトル等に戻す）
   */
  constructor({ onRetry }) {
    this.onRetry = onRetry;
    this.stepIndex = 0; // 今どのトッピングの番か（0〜3）
    this.active = {
      [TOPPING_TYPES.SAUCE]: false,
      [TOPPING_TYPES.MAYO]: false,
      [TOPPING_TYPES.AONORI]: false,
      [TOPPING_TYPES.KATSUOBUSHI]: false,
    };
    this.justAppliedAt = null; // タップして乗せた直後の一瞬（次に進むまでの間）
    this.allDone = false; // 4つとも乗せ終わって「かんせい」画面になったか
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.allDone) return;
    if (this.justAppliedAt !== null && elapsedSeconds - this.justAppliedAt >= STEP_PAUSE) {
      this.justAppliedAt = null;
      this.stepIndex += 1;
      if (this.stepIndex >= STEPS.length) {
        this.allDone = true; // ここで「かんせい」画面へ（一拍置いてから表示される）
      }
    }
  }

  handleTap(elapsedSeconds) {
    if (this.allDone) {
      // 「かんせい」画面をタップ → リトライ（呼び出し側で画面遷移）
      this.onRetry();
      return;
    }
    if (this.justAppliedAt !== null) return;
    if (this.stepIndex >= STEPS.length) return;
    const step = STEPS[this.stepIndex];
    this.active[step.type] = true;
    this.justAppliedAt = elapsedSeconds;
  }

  render(ctx, width, height, elapsedSeconds) {
    // ---- 完成後：全面に「かんせい」イラスト＋下部に「もういちど」 ----
    if (this.allDone) {
      if (isReady(COMPLETE_IMG)) {
        const scale = Math.max(width / COMPLETE_IMG.naturalWidth, height / COMPLETE_IMG.naturalHeight);
        const w = COMPLETE_IMG.naturalWidth * scale;
        const h = COMPLETE_IMG.naturalHeight * scale;
        ctx.drawImage(COMPLETE_IMG, width / 2 - w / 2, height / 2 - h / 2, w, h);
      } else {
        ctx.fillStyle = "#ffdca3";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#5a2d0c";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("かんせい！", width / 2, height / 2);
      }

      // 下部の帯＋「もういちど」の文字
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, height * 0.85, width, height * 0.15);
      ctx.fillStyle = "#ffcf5c";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("もういちど", width / 2, height * 0.93);
      ctx.restore();
      return;
    }

    // ---- トッピング中 ----
    const bodyCenterX = width / 2;
    const bodyCenterY = height * 0.45;
    const w = width * 0.78;

    // お皿
    if (isReady(PLATE_IMG)) {
      const pw = w;
      const ph = pw * (PLATE_IMG.naturalHeight / PLATE_IMG.naturalWidth);
      ctx.drawImage(PLATE_IMG, bodyCenterX - pw / 2, bodyCenterY - ph / 2 + ph * 0.08, pw, ph);
    }

    // 焼き上がったお好み焼き本体
    let bodyH = w;
    if (isReady(COOKED_BODY_IMG)) {
      bodyH = w * (COOKED_BODY_IMG.naturalHeight / COOKED_BODY_IMG.naturalWidth);
      ctx.drawImage(COOKED_BODY_IMG, bodyCenterX - w / 2, bodyCenterY - bodyH / 2, w, bodyH);
    } else {
      bodyH = width * 0.52;
      ctx.fillStyle = "#e8a33d";
      ctx.beginPath();
      ctx.ellipse(bodyCenterX, bodyCenterY, w / 2, bodyH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // これまでに乗せたトッピングを重ねて描画
    for (const type of Object.values(TOPPING_TYPES)) {
      if (!this.active[type]) continue;
      const overlayImg = TOPPING_OVERLAY_IMAGES[type];
      if (isReady(overlayImg)) {
        ctx.drawImage(overlayImg, bodyCenterX - w / 2, bodyCenterY - bodyH / 2, w, bodyH);
      } else {
        ctx.fillStyle = FALLBACK_COLOR[type];
        ctx.beginPath();
        ctx.ellipse(bodyCenterX, bodyCenterY, w * 0.4, bodyH * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 今のステップの案内（トッピング済みの一瞬の間は表示しない）
    if (this.stepIndex < STEPS.length && this.justAppliedAt === null) {
      const step = STEPS[this.stepIndex];

      ctx.textAlign = "center";
      ctx.fillStyle = "#5a2d0c";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(step.prompt, width / 2, height * 0.15);

      const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      ctx.fillStyle = "#e0552b";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("タップして", width / 2, height * 0.21);
      ctx.restore();
    }
  }
}
