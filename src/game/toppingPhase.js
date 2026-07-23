import { loadImage, isReady, pickReadyRandom } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import { isShareSupported, shareScreenshot } from "./share.js";
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
const STEAM_IMG = loadImage("/images/ui/steam_puff.png");

// 「かんせい」の全面イラスト：complete_01.png〜03.png を用意すればランダムで表示される。
const COMPLETE_IMAGES = ["01", "02", "03"].map((n) => loadImage(`/images/ui/complete_${n}.png`));
const CHARACTER_A_IMG = loadImage("/images/ui/character_topping_a.png"); // 右上の応援キャラ（現在は非表示。演出変更予定）
const CHARACTER_B_IMG = loadImage("/images/ui/character_topping_b.png"); // 左下の応援キャラ（現在は非表示。演出変更予定）

// ドラッグ＆ドロップ方式のトッピングカード画像
const CARD_IMAGES = {
  [TOPPING_TYPES.SAUCE]: loadImage("/images/cards/card_sauce.png"),
  [TOPPING_TYPES.MAYO]: loadImage("/images/cards/card_mayo.png"),
  [TOPPING_TYPES.AONORI]: loadImage("/images/cards/card_aonori.png"),
  [TOPPING_TYPES.KATSUOBUSHI]: loadImage("/images/cards/card_katsuobushi.png"),
};

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
const SPARKLE_LIFETIME = 0.6; // 秒。キラキラ粒子の寿命（少し長く）
const SPARKLE_COUNT = 26; // 1回のトッピングで飛び散る粒子の数（強化）
const FLASH_DURATION = 0.32; // 秒。トッピングが乗った瞬間の白フラッシュの長さ（強化）
const STAR_BURST_COUNT = 10; // 星がはじけ飛ぶ演出の数
const STAR_BURST_LIFETIME = 0.7; // 秒。星がはじけ飛ぶ演出の寿命
const PERFECT_POP_DURATION = 0.4; // 秒。「パーフェクト！」がポンと出てくるまでの時間
const PERFECT_HOLD_DURATION = 1.0; // 秒。「パーフェクト！」を表示しておく時間（この後クリア画面に切り替わる）
const CONFETTI_SPAWN_INTERVAL = 0.12; // 秒。紙吹雪の発生間隔
const TOPPING_TAP_SCORE = 100; // トッピング1回ごとの得点（特にゲーム性は無いので固定得点）
const PRAISE_DISPLAY_DURATION = 1.0;
const SECRET_MODE_SCORE_THRESHOLD = 800; // このスコア以上でクリア画面に「シークレットモード」への入口が出る
const SECRET_MODE_SCORE_UNLOCK_ENABLED = false; // 一旦非表示。のちほど再実装する可能性あり（今はタイトルの隠しコマンドのみで解放）
const CHARACTERS_ENABLED = false; // 応援キャラ2体：ドラッグ&ドロップ方式への変更に伴い一旦非表示（演出変更予定）
const PRAISE_ENABLED = false; // 「じょうず！」等のメッセージ：同上の理由で一旦非表示
const CARD_SIZE_RATIO = 0.26; // 画面の短い方の辺に対するカードの基準幅の比率（高さは1.3倍のスロットに収める）
const CARD_Y_RATIO = 0.84; // カードの中心Y位置（画面の高さに対する比率）
const CARD_SLOT_HEIGHT_MULTIPLIER = 1.3; // カードスロットの縦横比（幅に対する高さの倍率。縦長画像もそのまま収まるように）
const DROP_ZONE_RADIUS_RATIO = 0.55; // 本体幅に対する「乗せられる」判定半径の比率

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
   * @param {() => void} [opts.onSecretMode] - 800点以上でクリア画面に出る「シークレットモード」をタップした時
   */
  constructor({ onRetry, initialScore = 0, onSecretMode = null }) {
    this.onRetry = onRetry;
    this.onSecretMode = onSecretMode;
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
    this.starBursts = []; // { angle, speed, age, rotation, rotSpeed, size } 星がはじけ飛ぶ演出
    this.bodyBounce = { scale: 1 }; // トッピングが乗った瞬間、本体がポンと弾む演出（GSAP）
    this.confetti = []; // { x, y, vx, vy, rotation, rotSpeed, color, size }
    this._lastConfettiSpawn = 0;
    this.steamParticles = []; // 湯気（ひっくり返しゲームと同じ演出）
    this._lastSteamSpawn = 0;

    // ドラッグ＆ドロップ方式のトッピングカード用の状態
    this.dragging = false;
    this.dragType = null;
    this.dragX = 0;
    this.dragY = 0;

    // ドラッグ中に左右から出てくる応援キャラ2体（震える→ドロップではじけて画面外へ）
    this.dragCharState = { visible: false, appear: 0, burst: 0 };
  }

  update(deltaSeconds, elapsedSeconds) {
    // キラキラ粒子の経過時間を進める（完成後も余韻として動かし続ける）
    for (const s of this.sparkles) {
      s.age += deltaSeconds;
    }
    this.sparkles = this.sparkles.filter((s) => s.age < SPARKLE_LIFETIME);

    // 星がはじけ飛ぶ演出の経過時間を進める
    for (const s of this.starBursts) {
      s.age += deltaSeconds;
    }
    this.starBursts = this.starBursts.filter((s) => s.age < STAR_BURST_LIFETIME);

    if (this.allDone) {
      this._updateConfetti(deltaSeconds, elapsedSeconds);
      return;
    }

    this._updateSteam(deltaSeconds, elapsedSeconds);

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

  _updateSteam(deltaSeconds, elapsedSeconds) {
    if (elapsedSeconds - this._lastSteamSpawn > 0.25) {
      this._lastSteamSpawn = elapsedSeconds;
      const spawnCount = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < spawnCount; i++) {
        this.steamParticles.push({
          offsetX: (Math.random() - 0.5) * 0.7,
          y: 0,
          alpha: 0.9,
          scale: 0.8 + Math.random() * 0.6,
        });
      }
    }
    for (const p of this.steamParticles) {
      p.y += deltaSeconds * 55;
      p.alpha -= deltaSeconds * 0.4;
    }
    this.steamParticles = this.steamParticles.filter((p) => p.alpha > 0);
  }

  handleTap(elapsedSeconds, x, y, width, height) {
    if (this.allDone) {
      // 右上の「シェア」ボタン（ラベル部分も含めて少し広めに判定）
      if (isShareSupported() && x !== undefined && width !== undefined) {
        const shareX = width - 40;
        const shareY = 40;
        if (x >= shareX - 34 && x <= shareX + 34 && y >= shareY - 30 && y <= shareY + 50) {
          // シェアボタン自体がスクショに写り込まないよう、ボタン無しの状態を一度描き直してから撮影する
          if (this._canvasEl) {
            const shareCtx = this._canvasEl.getContext("2d");
            this._renderClearScreenContent(shareCtx, width, height, elapsedSeconds);
          }
          shareScreenshot(this._canvasEl, "okonomiyaki.png");
          return;
        }
      }

      const secretAvailable = SECRET_MODE_SCORE_UNLOCK_ENABLED && this.onSecretMode && this.totalScore >= SECRET_MODE_SCORE_THRESHOLD;
      if (secretAvailable && height !== undefined && y >= height * 0.95) {
        // 「シークレットモード」をタップ
        playSfx(SOUNDS.flip);
        this.onSecretMode();
        return;
      }
      // それ以外の場所（「かんせい」画面本体）をタップ → リトライ
      playSfx(SOUNDS.start);
      this.onRetry();
      return;
    }
    // トッピングはドラッグ＆ドロップ方式（handlePointerDown/Move/Up）に変更したため、
    // ゲームプレイ中の単純なタップでは何も起きない。
  }

  // カード（今のステップのもの）の位置・サイズを返す
  _getCardRect(width, height) {
    const size = Math.min(width, height) * CARD_SIZE_RATIO;
    const cx = width / 2;
    const cy = height * CARD_Y_RATIO;
    const slotHeight = size * CARD_SLOT_HEIGHT_MULTIPLIER;
    return { cx, cy, size, slotHeight };
  }

  handlePointerDown(x, y, elapsedSeconds, width, height) {
    if (this.allDone || this.showingPerfect) return;
    if (this.justAppliedAt !== null) return;
    if (this.stepIndex >= STEPS.length) return;
    if (this.dragging) return;

    const { cx, cy, size, slotHeight } = this._getCardRect(width, height);
    const halfW = size / 2;
    const halfH = slotHeight / 2;
    if (x >= cx - halfW && x <= cx + halfW && y >= cy - halfH && y <= cy + halfH) {
      this.dragging = true;
      this.dragType = STEPS[this.stepIndex].type;
      this.dragX = x;
      this.dragY = y;
      playSfx(SOUNDS.toppingTap);

      // 左右からキャラが登場（ぷるぷる震える）演出を開始
      this.dragCharState.visible = true;
      gsap.killTweensOf(this.dragCharState);
      this.dragCharState.appear = 0;
      this.dragCharState.burst = 0;
      gsap.to(this.dragCharState, { appear: 1, duration: 0.25, ease: "back.out(2)" });
    }
  }

  handlePointerMove(x, y, elapsedSeconds, width, height) {
    if (!this.dragging) return;
    this.dragX = x;
    this.dragY = y;
  }

  handlePointerUp(x, y, elapsedSeconds, width, height) {
    if (!this.dragging) return;
    const type = this.dragType;
    this.dragging = false;

    // キャラがはじけるように画面外へ
    gsap.killTweensOf(this.dragCharState);
    gsap.to(this.dragCharState, {
      burst: 1,
      duration: 0.5,
      ease: "power2.in",
      onComplete: () => {
        this.dragCharState.visible = false;
      },
    });
    this.dragType = null;

    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;
    const dropRadius = w * DROP_ZONE_RADIUS_RATIO;
    const dist = Math.hypot(x - bodyCenterX, y - bodyCenterY);

    if (dist <= dropRadius) {
      this._applyTopping(type, elapsedSeconds);
    }
    // 枠の外で離した場合は何も起きず、カードは元の場所に戻るだけ（ペナルティ無し）
  }

  // カードが正しく本体に乗った時の処理（見た目・スコア・効果音）
  _applyTopping(type, elapsedSeconds) {
    playSfx(SOUNDS.toppingTap);
    this.active[type] = true;
    this.justAppliedAt = elapsedSeconds;
    this.flashAt = elapsedSeconds;
    this._spawnSparkles(type);
    this._spawnStarBurst();
    this._bounceBody();

    // 特にゲーム性は無いトッピングフェーズ：乗せるごとに固定得点を加算
    this.totalScore += TOPPING_TAP_SCORE;

    this.scoreDisplayAt = elapsedSeconds;

    if (PRAISE_ENABLED) {
      this._spawnPraise(elapsedSeconds);
    }

    this._bounceScore();
  }

  // 本体がポンと弾む演出（トッピングが乗った瞬間）
  _bounceBody() {
    gsap.killTweensOf(this.bodyBounce);
    gsap
      .timeline()
      .to(this.bodyBounce, { scale: 1.12, duration: 0.1, ease: "back.out(2)" })
      .to(this.bodyBounce, { scale: 1, duration: 0.45, ease: "elastic.out(1.1, 0.3)" });
  }

  // 星がキラキラはじけ飛ぶ演出
  _spawnStarBurst() {
    for (let i = 0; i < STAR_BURST_COUNT; i++) {
      this.starBursts.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.7, // 本体半径に対する割合/秒
        age: 0,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 8,
        size: 10 + Math.random() * 10,
      });
    }
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

  // クリア画面右上の「シェア」ボタン（Web Share API非対応のブラウザでは表示しない）
  _renderShareButton(ctx, width) {
    if (!isShareSupported()) return;
    const cx = width - 40;
    const cy = 40;
    const boxSize = 52;

    ctx.save();
    // 角丸四角の背景
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - boxSize / 2, cy - boxSize / 2, boxSize, boxSize, 14);
    ctx.fill();
    ctx.stroke();

    // 上向き矢印＋トレイ（共有アイコン）
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const arrowTopY = cy - 12;
    const arrowBottomY = cy + 4;
    const arrowHalfW = 7;

    ctx.beginPath();
    ctx.moveTo(cx - arrowHalfW, arrowTopY + 8);
    ctx.lineTo(cx, arrowTopY);
    ctx.lineTo(cx + arrowHalfW, arrowTopY + 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, arrowTopY);
    ctx.lineTo(cx, arrowBottomY);
    ctx.stroke();

    const trayY = cy + 13;
    const trayHalfW = 11;
    ctx.beginPath();
    ctx.moveTo(cx - trayHalfW, trayY - 7);
    ctx.lineTo(cx - trayHalfW, trayY);
    ctx.lineTo(cx + trayHalfW, trayY);
    ctx.lineTo(cx + trayHalfW, trayY - 7);
    ctx.stroke();
    ctx.restore();

    // ボタン下のラベル
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 12px sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.strokeText("画像を共有", cx, cy + boxSize / 2 + 16);
    ctx.fillStyle = "#fff";
    ctx.fillText("画像を共有", cx, cy + boxSize / 2 + 16);
    ctx.restore();
  }

  // 5点の星形パスを(0,0)中心に描く（fill/strokeは呼び出し側で行う）
  _drawStarPath(ctx, size) {
    const spikes = 5;
    const outerR = size;
    const innerR = size * 0.45;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
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

  // カード本体（今のステップのカードが置いてある「トレイ」の表示。ドラッグ中は薄い枠だけ）
  _renderCard(ctx, width, height, type, elapsedSeconds) {
    const { cx, cy, size, slotHeight } = this._getCardRect(width, height);
    if (this.dragging) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.roundRect(cx - size / 2, cy - slotHeight / 2, size, slotHeight, 16);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 本体に向かって伸びる、ぴょこぴょこ動く大きな矢印
    this._renderGrabArrow(ctx, cx, cy - slotHeight / 2, width, height, elapsedSeconds);

    // 「つかむ」ラベル（カードの右側）
    ctx.save();
    ctx.textAlign = "left";
    ctx.font = "bold 16px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeText("👆 つかむ", cx + size / 2 + 10, cy);
    ctx.fillStyle = "#fff";
    ctx.fillText("👆 つかむ", cx + size / 2 + 10, cy);
    ctx.restore();

    this._drawCardImage(ctx, type, cx, cy, size, slotHeight, 1);
  }

  // カードから本体（成功判定エリア）に向かって伸びる矢印
  _renderGrabArrow(ctx, cx, cardTopY, width, height, elapsedSeconds) {
    const bob = Math.sin(elapsedSeconds * 3) * 6;
    const tipY = height * BODY_CENTER_Y_RATIO + height * 0.12 + bob;
    const tailY = cardTopY - 6 + bob;
    if (tailY <= tipY + 24) return; // 画面が小さく矢印を描くスペースが無い時は省略
    const arrowHeadW = 22;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(cx, tailY);
    ctx.lineTo(cx, tipY + 26);
    ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - arrowHeadW / 2, tipY + 26);
    ctx.lineTo(cx + arrowHeadW / 2, tipY + 26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ドラッグ中、指・マウスに追従するカード
  _renderDraggingCard(ctx, width, height) {
    const { size, slotHeight } = this._getCardRect(width, height);
    this._drawCardImage(ctx, this.dragType, this.dragX, this.dragY, size * 1.05, slotHeight * 1.05, 0.92);
  }

  // カード画像の共通描画：画像の縦横比を保ったまま（潰さず）スロット内に収めて描く。
  // 画像が無い時だけ、白い角丸カード＋色付き丸でフォールバックする。
  _drawCardImage(ctx, type, cx, cy, boxW, boxH, alpha) {
    const img = CARD_IMAGES[type];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    if (isReady(img)) {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const boxRatio = boxW / boxH;
      let drawW;
      let drawH;
      if (imgRatio > boxRatio) {
        drawW = boxW;
        drawH = boxW / imgRatio;
      } else {
        drawH = boxH;
        drawW = boxH * imgRatio;
      }
      ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    } else {
      const half = Math.min(boxW, boxH * 0.7) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.roundRect(cx - half, cy - half, half * 2, half * 2, 16);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.fillStyle = FALLBACK_COLOR[type];
      ctx.beginPath();
      ctx.ellipse(cx, cy, half * 0.6, half * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx - half, cy - half, half * 2, half * 2, 16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ドラッグ中、左下・右下から出てくる応援キャラ2体（震える→ドロップではじけて画面外へ）
  _renderDragCharacters(ctx, width, height, elapsedSeconds) {
    const { appear, burst } = this.dragCharState;
    if (appear <= 0) return;

    const characters = [
      { img: CHARACTER_A_IMG, baseX: width * 0.14, dir: -1, seed: 0 },
      { img: CHARACTER_B_IMG, baseX: width * 0.86, dir: 1, seed: 10 },
    ];
    const baseY = height * 0.86;

    for (const { img, baseX, dir, seed } of characters) {
      if (!isReady(img)) continue;

      // ぷるぷる震える（はじけ始めたら震えは止める）
      const tremble = burst > 0 ? 0 : Math.sin(elapsedSeconds * 45 + seed) * 2.5;
      const trembleY = burst > 0 ? 0 : Math.cos(elapsedSeconds * 38 + seed) * 2;

      const burstX = dir * burst * width * 0.4;
      const burstY = -burst * height * 0.35;
      const burstRotation = dir * burst * Math.PI * 1.5;
      const burstAlpha = 1 - burst;

      const charH = width * 0.286 * appear; // 通常の1.3倍サイズ
      const charW = charH * (img.naturalWidth / img.naturalHeight);

      ctx.save();
      ctx.globalAlpha = Math.max(appear * burstAlpha, 0);
      ctx.translate(baseX + tremble + burstX, baseY + trembleY + burstY);
      ctx.rotate(burstRotation);
      ctx.drawImage(img, -charW / 2, -charH / 2, charW, charH);
      ctx.restore();
    }
  }

  // 「かんせい」画面の中身（シェアボタンを除く）。シェア撮影時にボタン無しで撮り直すために分離してある。
  _renderClearScreenContent(ctx, width, height) {
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

    // 「もういちど」（800点以上ならシークレットモードへの入口も下に表示）
    const secretAvailable = SECRET_MODE_SCORE_UNLOCK_ENABLED && this.onSecretMode && this.totalScore >= SECRET_MODE_SCORE_THRESHOLD;
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("もういちど", width / 2, height * (secretAvailable ? 0.89 : 0.93));

    if (secretAvailable) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("シークレットモード", width / 2, height * 0.965);
    }
    ctx.restore();
  }

  render(ctx, width, height, elapsedSeconds) {
    this._canvasEl = ctx.canvas;


    // ---- 完成後：全面に「かんせい」イラスト＋紙吹雪＋「パーフェクト！」＋下部に「もういちど」 ----
    if (this.allDone) {
      this._renderClearScreenContent(ctx, width, height, elapsedSeconds);
      this._renderShareButton(ctx, width);
      this._renderScoreBadge(ctx, width, height);
      return;
    }

    // ---- トッピング中 ----
    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;

    // 本体まわり一式（お皿・本体・トッピング）を、トッピングが乗った瞬間ポンと弾ませる
    ctx.save();
    ctx.translate(bodyCenterX, bodyCenterY);
    ctx.scale(this.bodyBounce.scale, this.bodyBounce.scale);
    ctx.translate(-bodyCenterX, -bodyCenterY);

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
    ctx.restore();

    // ---- 湯気（ひっくり返しゲームと同じ演出） ----
    const bodyRadiusX = w / 2;
    const bodyRadiusY = bodyH / 2;
    for (const p of this.steamParticles) {
      const sx = bodyCenterX + p.offsetX * bodyRadiusX * 2;
      const sy = bodyCenterY - bodyRadiusY * 0.6 - p.y;
      const steamAlpha = Math.max(p.alpha, 0);

      if (isReady(STEAM_IMG)) {
        ctx.save();
        ctx.globalAlpha = steamAlpha;
        const size = 40 * p.scale;
        ctx.drawImage(STEAM_IMG, sx - size / 2, sy - size / 2, size, size);
        ctx.restore();
      } else {
        const radius = 24 * p.scale;
        const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${0.55 * steamAlpha})`);
        gradient.addColorStop(0.6, `rgba(255,255,255,${0.25 * steamAlpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- 白フラッシュ（トッピングが乗った瞬間、本体あたりがパッと光る）＋衝撃波リング ----
    if (this.flashAt !== null) {
      const flashT = elapsedSeconds - this.flashAt;
      if (flashT < FLASH_DURATION) {
        const flashAlpha = 1 - flashT / FLASH_DURATION;
        const flashRadius = w * 0.75;
        const gradient = ctx.createRadialGradient(bodyCenterX, bodyCenterY, 0, bodyCenterX, bodyCenterY, flashRadius);
        gradient.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
        gradient.addColorStop(0.6, `rgba(255,240,180,${0.6 * flashAlpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bodyCenterX, bodyCenterY, flashRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 衝撃波リング：外側に広がりながら消える輪
        const ringProgress = flashT / FLASH_DURATION;
        const ringRadius = w * (0.35 + ringProgress * 0.5);
        ctx.save();
        ctx.globalAlpha = (1 - ringProgress) * 0.8;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 6 * (1 - ringProgress * 0.6);
        ctx.beginPath();
        ctx.arc(bodyCenterX, bodyCenterY, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
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

    // ---- 星がキラキラはじけ飛ぶ演出（トッピングが乗った瞬間、外側へ回転しながら飛ぶ） ----
    const starBurstRadius = w * 0.75;
    for (const s of this.starBursts) {
      const progress = s.age / STAR_BURST_LIFETIME;
      const eased = 1 - (1 - progress) * (1 - progress); // ease-out
      const distance = s.speed * starBurstRadius * eased;
      const alpha = 1 - progress;
      const px = bodyCenterX + Math.cos(s.angle) * distance;
      const py = bodyCenterY + Math.sin(s.angle) * distance;
      const rotation = s.rotation + s.rotSpeed * s.age;
      const scale = 1 - progress * 0.5;

      ctx.save();
      ctx.globalAlpha = Math.max(alpha, 0);
      ctx.translate(px, py);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffd166";
      ctx.shadowColor = "#ffd166";
      ctx.shadowBlur = 8;
      this._drawStarPath(ctx, s.size);
      ctx.fill();
      ctx.restore();
    }

    // ---- 応援キャラ2体：トッピングを乗せた瞬間だけ、右上・左下にポンと同時ポップアップ ----
    if (CHARACTERS_ENABLED && this.justAppliedAt !== null) {
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

    // 今のステップの案内＋カード（トッピング済みの一瞬の間は表示しない）
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

      // 「カードをドラッグしてのせよう」：縁取り＋点滅で見やすく
      const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      ctx.textAlign = "center";
      ctx.font = "bold 18px sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#fff";
      ctx.strokeText("ドラッグしてのせよう", width / 2, height * 0.21);
      ctx.fillStyle = "#e0552b";
      ctx.fillText("ドラッグしてのせよう", width / 2, height * 0.21);
      ctx.restore();

      // ドラッグ中：本体まわりに「ここに乗せてね」の点線リングを表示
      if (this.dragging) {
        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "rgba(255,209,102,0.85)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(bodyCenterX, bodyCenterY, w * DROP_ZONE_RADIUS_RATIO, bodyH * DROP_ZONE_RADIUS_RATIO, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // カード本体（ドラッグ中は元の位置に薄い枠だけ残す）
      this._renderCard(ctx, width, height, step.type, elapsedSeconds);
    }

    // ドラッグ中のカード（指・マウスに追従）
    if (this.dragging) {
      this._renderDraggingCard(ctx, width, height);
    }

    // ドラッグ中、左下・右下から出てくる応援キャラ（震える→ドロップではじける）
    if (this.dragCharState.visible) {
      this._renderDragCharacters(ctx, width, height, elapsedSeconds);
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
