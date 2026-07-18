import { loadImage, isReady, pickReadyRandom } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

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
const COMPLETE_IMAGES = ["01", "02", "03"].map((n) => loadImage(`/images/ui/complete_${n}.png`));
const CHARACTER_A_IMG = loadImage("/images/ui/character_topping_a.png"); // 右上の応援キャラ
const CHARACTER_B_IMG = loadImage("/images/ui/character_topping_b.png"); // 左下の応援キャラ

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

// 紙吹雪の色（クリア画面でランダムに使う）
const CONFETTI_COLORS = ["#ff8a3d", "#ffd166", "#8bd17c", "#5eb0ef", "#ff6b9d"];

// 順番に「ソース→マヨネーズ→あおのり→かつおぶし」と進んでいく
const STEPS = [
  { type: TOPPING_TYPES.SAUCE, prompt: "ソースをぬろう！" },
  { type: TOPPING_TYPES.MAYO, prompt: "マヨネーズをかけよう！" },
  { type: TOPPING_TYPES.AONORI, prompt: "あおのりをかけよう！" },
  { type: TOPPING_TYPES.KATSUOBUSHI, prompt: "かつおぶしをかけよう！" },
];

const STEP_PAUSE = 0.9; // 秒。トッピングが乗った後、次のステップ（または完成画面）に進むまでの間
const CHARACTER_POP_GROW_DURATION = 0.2; // 秒。応援キャラがポンと出てくるまでの時間（この後は消えずそのまま表示）
const SPARKLE_LIFETIME = 0.5; // 秒。キラキラ粒子の寿命
const SPARKLE_COUNT = 14; // 1回のトッピングで飛び散る粒子の数
const FLASH_DURATION = 0.25; // 秒。トッピングが乗った瞬間の白フラッシュの長さ
const PERFECT_POP_DURATION = 0.4; // 秒。「パーフェクト！」がポンと出てくるまでの時間
const PERFECT_HOLD_DURATION = 1.0; // 秒。「パーフェクト！」を表示しておく時間（この後クリア画面に切り替わる）
const CONFETTI_SPAWN_INTERVAL = 0.12; // 秒。紙吹雪の発生間隔
const TOPPING_TAP_SCORE = 100; // トッピング1回ごとの得点（特にゲーム性は無いので固定得点）
const PRAISE_DISPLAY_DURATION = 1.0;

const PRAISE_MESSAGES = [
  "じょうず！",
  "いいね！",
  "おいしそう！",
  "すごい！",
  "やったね！",
];
export class ToppingPhase {
  /**
   * @param {object} opts
   * @param {() => void} opts.onRetry - 「かんせい」画面がタップされた時（呼び出し側でタイトル等に戻す）
   * @param {number} [opts.initialScore] - それ以前のフェーズ（ひっくり返すフェーズ）からの持ち越しスコア
   */
  constructor({ onRetry, initialScore = 0 }) {
    this.onRetry = onRetry;
    this.totalScore = initialScore;
    this.scoreBounce = { scale: 1, flash: 0 };
    this.praiseMessage = null;
    this.praiseShownAt = 0;
    this.scoreDisplayAt = 0; // スコア表示の開始時刻
    this.stepIndex = 0; // 今どのトッピングの番か（0〜3）
    this.active = {
      [TOPPING_TYPES.SAUCE]: false,
      [TOPPING_TYPES.MAYO]: false,
      [TOPPING_TYPES.AONORI]: false,
      [TOPPING_TYPES.KATSUOBUSHI]: false,
    };
    this.justAppliedAt = null; // タップして乗せた直後の一瞬（次に進むまでの間）
    this.flashAt = null; // 白フラッシュの開始時刻
    this.allDone = false; // クリア画面（かんせい画像＋紙吹雪）になったか
    this.showingPerfect = false; // 「パーフェクト！」だけを表示している間（この後allDoneに切り替わる）
    this.perfectAt = null; // 「パーフェクト！」演出の開始時刻
    this.selectedCompleteImg = null; // 「かんせい」画面用に選ばれた画像（allDoneになった瞬間に1回だけ選ぶ）
    this.sparkles = []; // { angle, speed, age, color, size }
    this.confetti = []; // { x, y, vx, vy, rotation, rotSpeed, color, size }
    this._lastConfettiSpawn = 0;
  }

  update(deltaSeconds, elapsedSeconds) {
    // キラキラ粒子の経過時間を進める（完成後も余韻として動かし続ける）
    for (const s of this.sparkles) {
      s.age += deltaSeconds;
    }
    this.sparkles = this.sparkles.filter((s) => s.age < SPARKLE_LIFETIME);

    if (this.allDone) {
      this._updateConfetti(deltaSeconds, elapsedSeconds);
      return;
    }

    // 「パーフェクト！」表示中 → 一定時間経ったらクリア画面に切り替える
    if (this.showingPerfect) {
      if (elapsedSeconds - this.perfectAt >= PERFECT_HOLD_DURATION) {
        this.showingPerfect = false;
        this.allDone = true;
        this.selectedCompleteImg = pickReadyRandom(COMPLETE_IMAGES);
      }
      return;
    }

    if (this.justAppliedAt !== null && elapsedSeconds - this.justAppliedAt >= STEP_PAUSE) {
      this.justAppliedAt = null;
      this.stepIndex += 1;
      if (this.stepIndex >= STEPS.length) {
        // まずは「パーフェクト！」だけを表示する（この後クリア画面に切り替わる）
        this.showingPerfect = true;
        this.perfectAt = elapsedSeconds;
        playSfx(SOUNDS.clear);
      }
    }
  }

  _updateConfetti(deltaSeconds, elapsedSeconds) {
    if (elapsedSeconds - this._lastConfettiSpawn > CONFETTI_SPAWN_INTERVAL) {
      this._lastConfettiSpawn = elapsedSeconds;
      for (let i = 0; i < 3; i++) {
        this.confetti.push({
          x: Math.random(), // 0〜1（横位置の割合、描画時にwidthを掛ける）
          y: -0.05,
          vx: (Math.random() - 0.5) * 0.15,
          vy: 0.25 + Math.random() * 0.2,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 6,
          color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          size: 6 + Math.random() * 5,
        });
      }
    }
    for (const c of this.confetti) {
      c.x += c.vx * deltaSeconds;
      c.y += c.vy * deltaSeconds;
      c.rotation += c.rotSpeed * deltaSeconds;
    }
    this.confetti = this.confetti.filter((c) => c.y < 1.1);
  }

  handleTap(elapsedSeconds) {
    if (this.allDone) {
      // 「かんせい」画面をタップ → リトライ（呼び出し側で画面遷移）
      playSfx(SOUNDS.retryTap);
      this.onRetry();
      return;
    }
    if (this.showingPerfect) return; // 「パーフェクト！」表示中はタップ無効
    if (this.justAppliedAt !== null) return;
    if (this.stepIndex >= STEPS.length) return;
    const step = STEPS[this.stepIndex];
    playSfx(SOUNDS.toppingTap);
    this.active[step.type] = true;
    this.justAppliedAt = elapsedSeconds;
    this.flashAt = elapsedSeconds;
    this._spawnSparkles(step.type);

    // 特にゲーム性は無いトッピングフェーズ：タップごとに固定得点を加算
    this.totalScore += TOPPING_TAP_SCORE;

    this.scoreDisplayAt = elapsedSeconds;

    this._spawnPraise(elapsedSeconds);

    this._bounceScore();
  }

  // 点数が入った時に、スコア表示を弾ませる
  _bounceScore() {
    gsap.killTweensOf(this.scoreBounce);
    gsap.timeline()
      .to(this.scoreBounce, { scale: 1.7, flash: 1, duration: 0.12, ease: "back.out(3)" })
      .to(this.scoreBounce, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.25)" }, "<")
      .to(this.scoreBounce, { flash: 0, duration: 0.4, ease: "power1.out" }, "<0.1");
  }

  _spawnPraise(elapsedSeconds) {
    this.praiseMessage =
      PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];

    this.praiseShownAt = elapsedSeconds;
  }

  _renderScoreBadge(ctx, width, height, elapsedSeconds) {
    // トッピングをタップした直後だけ表示
    if (this.justAppliedAt === null) {
      return;
    }

    const age = elapsedSeconds - this.justAppliedAt;
    if (age > PRAISE_DISPLAY_DURATION) {
      return;
    }

    ctx.save();
    const scoreText = `${TOPPING_TAP_SCORE} 点`;
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreBarW = scoreMetrics.width + 24;
    const scoreBarH = 40;
    const centerX = width / 2;
    const barY = height * 0.76; // お好み焼きの下あたり
    const flash = this.scoreBounce.flash;
    const bgR = Math.round(90 + (255 - 90) * flash);
    const bgG = Math.round(45 + (207 - 45) * flash);
    const bgB = Math.round(12 + (92 - 12) * flash);
    ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},0.9)`;
    ctx.beginPath();
    ctx.roundRect(centerX - scoreBarW / 2, barY - scoreBarH / 2, scoreBarW, scoreBarH, 12);
    ctx.fill();

    ctx.translate(centerX, barY + 9);
    ctx.scale(this.scoreBounce.scale, this.scoreBounce.scale);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText(scoreText, 0, 0);
    ctx.restore();
  }

  _renderTotalScoreBadge(ctx, width, height) {
    ctx.save();

    const scoreText = `${this.totalScore}点`;

    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "right";

    const scoreMetrics = ctx.measureText(scoreText);

    const scoreBarW = scoreMetrics.width + 28;
    const scoreBarH = 40;

    const scoreRightX = width - 12;
    const scoreTopY = 16;

    const flash = this.scoreBounce.flash;

    const bgR = Math.round(90 + (255 - 90) * flash);
    const bgG = Math.round(45 + (207 - 45) * flash);
    const bgB = Math.round(12 + (92 - 12) * flash);

    ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},0.9)`;

    ctx.beginPath();
    ctx.roundRect(
      scoreRightX - scoreBarW,
      scoreTopY,
      scoreBarW,
      scoreBarH,
      12
    );
    ctx.fill();

    ctx.translate(
      scoreRightX - scoreBarW / 2,
      scoreTopY + scoreBarH / 2 + 6
    );

    ctx.scale(this.scoreBounce.scale, this.scoreBounce.scale);

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText(scoreText, 0, 0);

    ctx.restore();
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
    // ---- 完成後：全面に「かんせい」イラスト＋紙吹雪＋「パーフェクト！」＋下部に「もういちど」 ----
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
      }

      // 紙吹雪（上から降り続ける）
      for (const c of this.confetti) {
        ctx.save();
        ctx.translate(c.x * width, c.y * height);
        ctx.rotate(c.rotation);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 3, c.size, c.size * 0.6);
        ctx.restore();
      }

      // 下部の帯＋スコア＋「もういちど」の文字
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, height * 0.78, width, height * 0.22);
      
      // 大きなスコア表示
      const scoreText = `${this.totalScore}点！！`;
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#5a2d0c";
      ctx.strokeText(scoreText, width / 2, height * 0.84);
      ctx.fillStyle = "#ffcf5c";
      ctx.fillText(scoreText, width / 2, height * 0.84);
      
      // 「もういちど」
      ctx.fillStyle = "#fff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("もういちど", width / 2, height * 0.93);
      ctx.restore();

      this._renderScoreBadge(ctx, width, height);
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

    this._renderScoreBadge(ctx, width, height);
    this._renderTotalScoreBadge(ctx, width, height);

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

    // ---- 白フラッシュ（トッピングが乗った瞬間、本体あたりがパッと光る） ----
    if (this.flashAt !== null) {
      const flashT = elapsedSeconds - this.flashAt;
      if (flashT < FLASH_DURATION) {
        const flashAlpha = 1 - flashT / FLASH_DURATION;
        const flashRadius = w * 0.6;
        const gradient = ctx.createRadialGradient(bodyCenterX, bodyCenterY, 0, bodyCenterX, bodyCenterY, flashRadius);
        gradient.addColorStop(0, `rgba(255,255,255,${0.85 * flashAlpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bodyCenterX, bodyCenterY, flashRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        this.flashAt = null;
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

    // ---- 応援キャラ2体：トッピングを乗せた瞬間だけ、右上・左下にポンと同時ポップアップ ----
    if (this.justAppliedAt !== null) {
      const growProgress = Math.min((elapsedSeconds - this.justAppliedAt) / CHARACTER_POP_GROW_DURATION, 1);
      const growScale = Math.sin(growProgress * (Math.PI / 2)); // 0→1（出てきたら止まる、消えない）

      const positions = [
        { img: CHARACTER_A_IMG, x: width * 0.82, y: height * 0.22 }, // 右上
        { img: CHARACTER_B_IMG, x: width * 0.18, y: height * 0.8 }, // 左下
      ];

      for (const { img, x, y } of positions) {
        if (!isReady(img)) continue;
        const charH = width * 0.34 * growScale;
        const charW = charH * (img.naturalWidth / img.naturalHeight);
        ctx.save();
        ctx.globalAlpha = growScale;
        ctx.drawImage(img, x - charW / 2, y - charH / 2, charW, charH);
        ctx.restore();
      }
    }

    if (this.praiseMessage) {
      const age = elapsedSeconds - this.praiseShownAt;

      if (age < PRAISE_DISPLAY_DURATION) {

        ctx.save();

        ctx.globalAlpha = 1 - age / PRAISE_DISPLAY_DURATION;

        ctx.textAlign = "center";

        ctx.font = "bold 48px sans-serif";

        ctx.lineWidth = 6;
        ctx.strokeStyle = "#5a2d0c";

        ctx.strokeText(
          this.praiseMessage,
          width / 2,
          height * 0.25
        );

        ctx.fillStyle = "#ffd166";

        ctx.fillText(
          this.praiseMessage,
          width / 2,
          height * 0.25
        );

        ctx.restore();

      } else {

        this.praiseMessage = null;

      }
    }

    // 今のステップの案内（トッピング済みの一瞬の間は表示しない）
    if (this.stepIndex < STEPS.length && this.justAppliedAt === null) {
      const step = STEPS[this.stepIndex];

      // 見出し：背景に帯を敷いて、どんな背景でも読みやすくする
      ctx.save();
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      const promptMetrics = ctx.measureText(step.prompt);
      const barW = promptMetrics.width + 32;
      const barH = 40;
      const barY = height * 0.15;
      ctx.fillStyle = "rgba(90,45,12,0.75)";
      ctx.beginPath();
      ctx.roundRect(width / 2 - barW / 2, barY - barH * 0.72, barW, barH, 20);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(step.prompt, width / 2, barY);
      ctx.restore();

      // 「タップして」：縁取り＋点滅で見やすく
      const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      ctx.textAlign = "center";
      ctx.font = "bold 18px sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.strokeText("タップして", width / 2, height * 0.21);
      ctx.fillStyle = "#e0552b";
      ctx.fillText("タップして", width / 2, height * 0.21);
      ctx.restore();
    }

    // ---- 「パーフェクト！」：クリア画面の前に、これだけを表示する ----
    if (this.showingPerfect) {
      const growProgress = Math.min((elapsedSeconds - this.perfectAt) / PERFECT_POP_DURATION, 1);
      const growScale = Math.sin(growProgress * (Math.PI / 2)); // 0→1

      const perfectY = height * 0.38;

      // 周囲の星（位置固定、明滅だけさせる）
      const starOffsets = [
        { dx: -0.28, dy: -0.06, phase: 0 },
        { dx: 0.3, dy: -0.08, phase: 1.1 },
        { dx: -0.22, dy: 0.08, phase: 2.2 },
        { dx: 0.24, dy: 0.09, phase: 3.3 },
        { dx: 0, dy: -0.12, phase: 4.1 },
      ];
      for (const s of starOffsets) {
        const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsedSeconds * 4 + s.phase));
        ctx.save();
        ctx.globalAlpha = growScale * twinkle;
        ctx.fillStyle = "#fff176";
        ctx.font = `${Math.floor(width * 0.06)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("★", width / 2 + s.dx * width, perfectY + s.dy * height);
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = growScale;
      ctx.translate(width / 2, perfectY);
      ctx.scale(growScale, growScale);
      ctx.textAlign = "center";
      ctx.font = "bold 40px sans-serif";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#5a2d0c";
      ctx.strokeText("パーフェクト！", 0, 0);
      ctx.fillStyle = "#ffcf5c";
      ctx.fillText("パーフェクト！", 0, 0);
      ctx.restore();
    }
  }
}
