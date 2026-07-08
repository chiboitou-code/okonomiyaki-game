import { loadImage, isReady, pickReadyRandom } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSound } from "./audio.js";
import { SOUNDS } from "./sounds.js";

export const TOPPING_TYPES = {
  SAUCE: "sauce",
  MAYO: "mayo",
  AONORI: "aonori",
  KATSUOBUSHI: "katsuobushi",
};

// public/images/ にファイルを置くと自動的にこちらが使われる
const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");

// 「かんせい」の全面イラスト：complete_01.png〜03.png を用意すればランダムで表示される。
// 1枚だけでも今まで通り動く（枚数を増減したい場合はこの配列を編集する）
const COMPLETE_IMAGES = ["01", "02", "03"].map((n) => loadImage(`/images/ui/complete_${n}.png`));

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

// キラキラ粒子の色（トッピングごとに変える）
const SPARKLE_COLOR = {
  [TOPPING_TYPES.SAUCE]: "#ffb703",
  [TOPPING_TYPES.MAYO]: "#fffbe6",
  [TOPPING_TYPES.AONORI]: "#8bd17c",
  [TOPPING_TYPES.KATSUOBUSHI]: "#ffcf5c",
};

// 順番に「ソース→マヨネーズ→あおのり→かつおぶし」と進んでいく
const STEPS = [
  { type: TOPPING_TYPES.SAUCE, prompt: "ソースをぬろう！" },
  { type: TOPPING_TYPES.MAYO, prompt: "マヨネーズをかけよう！" },
  { type: TOPPING_TYPES.AONORI, prompt: "あおのりをかけよう！" },
  { type: TOPPING_TYPES.KATSUOBUSHI, prompt: "かつおぶしをかけよう！" },
];

const STEP_PAUSE = 0.5; // 秒。トッピングが乗った後、次のステップ（または完成画面）に進むまでの間
const SPARKLE_LIFETIME = 0.5; // 秒。キラキラ粒子の寿命
const SPARKLE_COUNT = 14; // 1回のトッピングで飛び散る粒子の数

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
    this.selectedCompleteImg = null; // 「かんせい」画面用に選ばれた画像（allDoneになった瞬間に1回だけ選ぶ）
    this.sparkles = []; // { angle, speed, age, color, size }
  }

  update(deltaSeconds, elapsedSeconds) {
    // キラキラ粒子の経過時間を進める（完成後も余韻として動かし続ける）
    for (const s of this.sparkles) {
      s.age += deltaSeconds;
    }
    this.sparkles = this.sparkles.filter((s) => s.age < SPARKLE_LIFETIME);

    if (this.allDone) return;
    if (this.justAppliedAt !== null && elapsedSeconds - this.justAppliedAt >= STEP_PAUSE) {
      this.justAppliedAt = null;
      this.stepIndex += 1;
      if (this.stepIndex >= STEPS.length) {
        this.allDone = true; // ここで「かんせい」画面へ（一拍置いてから表示される）
        this.selectedCompleteImg = pickReadyRandom(COMPLETE_IMAGES);
        playSound(SOUNDS.clear);
      }
    }
  }

  handleTap(elapsedSeconds) {
    if (this.allDone) {
      // 「かんせい」画面をタップ → リトライ（呼び出し側で画面遷移）
      playSound(SOUNDS.retryTap);
      this.onRetry();
      return;
    }
    if (this.justAppliedAt !== null) return;
    if (this.stepIndex >= STEPS.length) return;
    const step = STEPS[this.stepIndex];
    playSound(SOUNDS.toppingTap);
    this.active[step.type] = true;
    this.justAppliedAt = elapsedSeconds;
    this._spawnSparkles(step.type);
  }

  _spawnSparkles(type) {
    const color = SPARKLE_COLOR[type] || "#fff";
    for (let i = 0; i < SPARKLE_COUNT; i++) {
      this.sparkles.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.6, // 本体半径に対する割合/秒
        age: 0,
        color,
        size: 3 + Math.random() * 4,
      });
    }
  }

  render(ctx, width, height, elapsedSeconds) {
    // ---- 完成後：全面に「かんせい」イラスト＋下部に「もういちど」 ----
    if (this.allDone) {
      if (this.selectedCompleteImg && isReady(this.selectedCompleteImg)) {
        const img = this.selectedCompleteImg;
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, width / 2 - w / 2, height / 2 - h / 2, w, h);
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
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;

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

    // ---- キラキラ粒子（トッピングが乗った瞬間、中心から放射状に飛び散る） ----
    const burstRadius = w * 0.5; // 粒子が飛び散る最大距離の目安
    for (const s of this.sparkles) {
      const progress = s.age / SPARKLE_LIFETIME;
      const distance = s.speed * burstRadius * progress;
      const alpha = 1 - progress;
      const px = bodyCenterX + Math.cos(s.angle) * distance;
      const py = bodyCenterY + Math.sin(s.angle) * distance;
      const size = s.size * (1 - progress * 0.4);

      ctx.save();
      ctx.globalAlpha = Math.max(alpha, 0);
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
