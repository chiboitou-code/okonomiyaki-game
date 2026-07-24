import { loadImage, isReady, pickReadyRandom } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import { isShareSupported, shareScreenshot } from "./share.js";
import gsap from "gsap";

// ---- 調整用の定数 ----
const SAUCE_TIME_LIMIT = 5.0; // 秒。ソース（渦巻き）の制限時間
const MAYO_TIME_LIMIT = 5.0; // 秒。マヨネーズ（急カーブ連続）の制限時間
const SAUCE_MAX_DEVIATION_RATIO = 0.13; // 本体幅に対する「これ以上ズレたら0点」の許容ズレ
const MAYO_MAX_DEVIATION_RATIO = 0.1; // マヨネーズはより厳しめ
const SAUCE_SPIRAL_TURNS = 2.0; // ソースの渦巻きの巻き数（指でなぞりやすいよう間隔を広めに）
const RESULT_PAUSE = 1.2; // 秒。結果表示の時間
const COUNTDOWN_Y_RATIO = 0.06; // 全ゲーム共通：残り時間カウントダウンの表示位置（画面上部・タップの邪魔にならない位置）

// ---- 味付けゲーム（あおのり・枝豆・かつおぶしを統合した「カードを選んでタップで散らす」ゲーム） ----
const SEASONING_TIME_LIMIT = 15; // 秒。この間、自由にタップし放題
const SEASONING_CARD_TYPES = ["aonori", "edamame", "katsuobushi"];
const SEASONING_LABELS = {
  aonori: "あおのり",
  edamame: "えだまめ",
  katsuobushi: "かつおぶし",
};
// 1回タップした時の得点（枝豆だけ低得点。連打して稼ぐ快感を重視した高めの配点）
const SEASONING_SCORE_PER_TAP = {
  aonori: 20,
  katsuobushi: 20,
  edamame: 5,
};
// カード表示エリア（画面上部、高さに対する比率）
const SEASONING_CARD_ROW_TOP_RATIO = 0.1;
const SEASONING_CARD_ROW_HEIGHT_RATIO = 0.12;
const SEASONING_POPUP_LIFESPAN = 0.7; // 秒。「+20」等のポップが浮き上がって消えるまでの時間

// あおのりの粒（従来のシンプルな楕円演出をそのまま流用）
const AONORI_COLORS = ["#2e7d32", "#1b5e20", "#43a047", "#558b2f", "#33691e"];
const AONORI_SPRAY_COUNT = 48; // 1タップで散らす粒の数（さらに倍増）
const AONORI_SPRAY_RADIUS_RATIO = 0.09; // 散布範囲（画面幅に対する比率、さらに倍増）

// 枝豆（さや）の見た目パラメータ（画面幅に対する比率で管理。別AI生成コードのデザインを移植）
const EDAMAME_SPRAY_RADIUS_RATIO = 0.08;
const EDAMAME_BASE_LEN_RATIO = 0.15;
const EDAMAME_SPRAY_COUNT = 4; // 1タップで散らす数（さらに倍増）

// かつおぶしの見た目パラメータ（画面幅に対する比率で管理。別AI生成コードのデザインを移植）
const KATSUOBUSHI_SPRAY_RADIUS_RATIO = 0.13;
const KATSUOBUSHI_BASE_LEN_RATIO = 0.08;
const KATSUOBUSHI_BASE_THICK_RATIO = 0.028;
const KATSUOBUSHI_SPRAY_COUNT = 32; // 1タップで散らす数（さらに倍増）
const KATSUOBUSHI_COLORS = [
  { r: 215, g: 170, b: 135 }, // 標準的な薄茶
  { r: 190, g: 140, b: 105 }, // 濃いめの茶色
  { r: 235, g: 200, b: 170 }, // 白っぽい透き通る部分
];

// 紙吹雪（クリア画面用）
const CONFETTI_COLORS = ["#ff8a3d", "#ffd166", "#8bd17c", "#5eb0ef", "#ff6b9d"];
const CONFETTI_SPAWN_INTERVAL = 0.12; // 秒。紙吹雪の発生間隔

// ソース・マヨネーズなぞりゲーム、クリア時の演出（通常モードの味付けフェーズと同じ強めの演出）
const TRACE_FLASH_DURATION = 0.32; // 秒
const TRACE_SPARKLE_LIFETIME = 0.6; // 秒
const TRACE_SPARKLE_COUNT = 26;
const TRACE_STAR_BURST_COUNT = 10;
const TRACE_STAR_BURST_LIFETIME = 0.7; // 秒
const TRACE_SPARKLE_COLOR = "#ffd166";

const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");
const SAUCE_APPLIED_IMG = loadImage("/images/toppings/topping_sauce.png");

// 「かんせい」の全面イラスト：シンプルモードと同じ complete_01.png〜03.png を流用
const COMPLETE_IMAGES = ["01", "02", "03"].map((n) => loadImage(`/images/ui/complete_${n}.png`));

// 味付けゲームのカードアイコン（無ければ図形＋文字でフォールバック）
const CARD_IMAGES = {
  aonori: loadImage("/images/cards/card_aonori.png"),
  edamame: loadImage("/images/cards/card_edamame.png"),
  katsuobushi: loadImage("/images/cards/card_katsuobushi.png"),
};
const CARD_FALLBACK_COLOR = {
  aonori: "#2e7d32",
  edamame: "#8cb930",
  katsuobushi: "#c98a55",
};

// 味付けゲーム後、右下からトコトコ歩いてきて褒めてくれるキャラの演出
const PRAISE_CHARACTER_IMG = loadImage("/images/ui/character_1.png");
const PRAISE_WALK_DURATION = 1.0; // 秒。歩いてくる時間
const PRAISE_PHRASES = [
  "げいじゅつやな！",
  "やるやん！",
  "ええ仕事するやん！",
  "才能あるでコレ！",
  "天才かいな！",
  "ようやった！",
];

const STAGE = {
  EXPLAIN_SAUCE: "explain_sauce",
  SAUCE_TRACE: "sauce_trace",
  SAUCE_RESULT: "sauce_result",
  EXPLAIN_MAYO: "explain_mayo",
  MAYO_TRACE: "mayo_trace",
  MAYO_RESULT: "mayo_result",
  EXPLAIN_SEASONING: "explain_seasoning",
  SEASONING_PLAY: "seasoning_play",
  SEASONING_RESULT: "seasoning_result",
  SEASONING_PRAISE: "seasoning_praise", // 味付けゲーム後、キャラが歩いてきて褒めてくれる演出
  SCORE_SEQUENCE: "score_sequence", // スコア内訳を順番に表示
  CLEAR: "clear", // クリア画面（かんせい画像＋紙吹雪＋総合スコア）
};

export class AdultToppingPhase {
  /**
   * @param {object} opts
   * @param {() => void} opts.onFinish - 一連の流れが終わった時（呼び出し側でタイトル等に戻す）
   * @param {number} [opts.initialScore] - それ以前のフェーズ（ひっくり返すフェーズ等）からの持ち越しスコア
   * @param {"sauce"|"mayo"|"seasoning"} [opts.startAt] - デバッグ用：指定したゲームの説明画面から開始する
   * @param {boolean} [opts.debugSingleGame] - デバッグ用：1つのゲームが終わったら、そのままonFinishを呼ぶ
   */
  constructor({ onFinish, initialScore = 0, startAt = null, debugSingleGame = false }) {
    this.onFinish = onFinish;
    this.debugSingleGame = debugSingleGame;
    const startStageMap = {
      sauce: STAGE.EXPLAIN_SAUCE,
      mayo: STAGE.EXPLAIN_MAYO,
      seasoning: STAGE.EXPLAIN_SEASONING,
    };
    this.stage = startStageMap[startAt] || STAGE.EXPLAIN_SAUCE;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = initialScore;
    this.lastScore = 0;
    this.sauceScore = 0; // スコアシーケンス表示用に個別保持
    this.mayoScore = 0; // スコアシーケンス表示用に個別保持
    this.scoreBounce = { scale: 1, flash: 0 }; // GSAPで動かす値。render側はこれをそのまま読むだけ

    // ソース・マヨネーズなぞりゲームのクリア演出用の状態
    this.traceFlashAt = null;
    this.traceSparkles = []; // { angle, speed, age, size }
    this.traceStarBursts = []; // { angle, speed, age, rotation, rotSpeed, size }
    this.traceBodyBounce = { scale: 1 };

    // スコアシーケンス表示用
    this.scoreSequenceItems = []; // 表示するスコア項目の配列
    this.scoreSequenceIndex = 0; // 現在表示中のインデックス
    this.scoreSequenceStartedAt = null; // シーケンス開始時刻

    // なぞり用の状態
    this.tracing = false;
    this.traceStartedAt = null;
    this.deviationSum = 0;
    this.deviationCount = 0;
    this.maxProgress = 0; // これまでに到達した最大の進捗（0〜1）
    this.currentPathPoints = null;
    this._lastWidth = 400;
    this.tracePathHistory = []; // なぞった軌跡（光る帯の描画用）
    this._lastHeight = 640; // 初期高さ（_lastWidthと同じく、初回描画時のフォールバック用）

    // 味付けゲーム用の状態
    this.selectedCard = null; // "aonori" | "edamame" | "katsuobushi" | null
    this.seasoningScore = 0;
    this.seasoningTapCounts = { aonori: 0, edamame: 0, katsuobushi: 0 };
    this.seasoningPlacedList = []; // 着地済みの粒を置いた順番のまま保持（{type, ...}）。既に乗っている分の重なり順は変えない
    this.seasoningScorePopups = []; // タップ毎に一瞬表示する「+20」等のポップ { x, y, text, color, age }
    this.seasoningSessionStartedAt = null;

    // クリア画面用
    this.selectedCompleteImg = null;
    this.confetti = [];
    this._lastConfettiSpawn = 0;

    // 味付けゲーム後、キャラが歩いてきて褒めてくれる演出の状態
    this.praiseMessage = "";
    this.praiseArrived = false;
    this.praiseCharPos = { x: 0 };
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
  }

  // ---- パス生成 ----
  // ソース：蚊取り線香のような渦巻き。中心からスタートし、外側へ向かってぐるぐるなぞる
  _getSaucePathPoints(width, height) {
    const cx = width / 2;
    const cy = height * BODY_CENTER_Y_RATIO;
    const maxRadius = width * BODY_WIDTH_RATIO * 0.42; // 本体からはみ出さない程度の大きさ
    const turns = SAUCE_SPIRAL_TURNS;
    const SAMPLE_COUNT = 120;
    const points = [];
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      const angle = t * Math.PI * 2 * turns;
      const radius = maxRadius * t;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      points.push({ x, y });
    }
    return points;
  }

  // マヨネーズ：急カーブが連続する曲線。上から下方向へ、カーブ数8でさらに高難易度に
  _getMayoPathPoints(width, height) {
    const cx = width / 2;
    const ampX = width * 0.28; // 横方向の振れ幅
    const frequency = 4; // カーブの数（指でなぞりやすいよう間隔を広めに）
    const yStart = height * 0.33;
    const yEnd = height * 0.75;
    const points = [];
    const SAMPLE_COUNT = 90; // 縦に長くなった分、サンプル数を増やして滑らかに
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const t = i / SAMPLE_COUNT;
      const y = yStart + (yEnd - yStart) * t;
      const x = cx + ampX * Math.sin(t * frequency * Math.PI * 2);
      points.push({ x, y });
    }
    return points;
  }

  // 複数の線分（折れ線/曲線サンプル点）に対して、点(x,y)から最も近い位置と、
  // パス全体に対する進捗割合（0〜1）を求める
  _projectOntoPolyline(x, y, points) {
    let totalLength = 0;
    const segLengths = [];
    for (let i = 0; i < points.length - 1; i++) {
      const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
      segLengths.push(len);
      totalLength += len;
    }

    let bestDeviation = Infinity;
    let bestProgressLength = 0;
    let cumulative = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const segLen = segLengths[i];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lenSq = abx * abx + aby * aby;
      const t = lenSq > 0 ? Math.max(0, Math.min(((x - a.x) * abx + (y - a.y) * aby) / lenSq, 1)) : 0;
      const closestX = a.x + abx * t;
      const closestY = a.y + aby * t;
      const deviation = Math.hypot(x - closestX, y - closestY);
      if (deviation < bestDeviation) {
        bestDeviation = deviation;
        bestProgressLength = cumulative + segLen * t;
      }
      cumulative += segLen;
    }

    const progress = totalLength > 0 ? bestProgressLength / totalLength : 0;
    return { progress, deviation: bestDeviation };
  }

  update(deltaSeconds, elapsedSeconds, width, height) {
    if (width) this._lastWidth = width;
    if (height) this._lastHeight = height;

    for (const s of this.traceSparkles) {
      s.age += deltaSeconds;
    }
    this.traceSparkles = this.traceSparkles.filter((s) => s.age < TRACE_SPARKLE_LIFETIME);
    for (const s of this.traceStarBursts) {
      s.age += deltaSeconds;
    }
    this.traceStarBursts = this.traceStarBursts.filter((s) => s.age < TRACE_STAR_BURST_LIFETIME);

    if ((this.stage === STAGE.SAUCE_TRACE || this.stage === STAGE.MAYO_TRACE) && this.tracing) {
      const limit = this.stage === STAGE.SAUCE_TRACE ? SAUCE_TIME_LIMIT : MAYO_TIME_LIMIT;
      const elapsed = elapsedSeconds - this.traceStartedAt;
      if (elapsed >= limit) {
        this._finishTrace(elapsedSeconds, false);
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      this.tracePathHistory = []; // ソースの軌跡が残らないようクリア
      if (this.debugSingleGame) {
        this.onFinish();
      } else {
        this._enterStage(STAGE.EXPLAIN_MAYO, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.MAYO_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      if (this.debugSingleGame) {
        this.onFinish();
      } else {
        this._enterStage(STAGE.EXPLAIN_SEASONING, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.SEASONING_PLAY) {
      this._updateSeasoning(deltaSeconds, elapsedSeconds);
    }

    if (this.stage === STAGE.SEASONING_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      if (this.debugSingleGame) {
        this.onFinish();
      } else {
        // キャラが歩いてきて褒めてくれる演出を挟んでから、スコア内訳へ
        this._enterSeasoningPraise(elapsedSeconds);
      }
    }

    // スコアシーケンス表示
    if (this.stage === STAGE.SCORE_SEQUENCE) {
      this._updateScoreSequence(elapsedSeconds);
    }

    // クリア画面（紙吹雪を降らせ続ける）
    if (this.stage === STAGE.CLEAR) {
      this._updateConfetti(deltaSeconds, elapsedSeconds);
    }
  }

  // ---- 味付けゲーム：制限時間の管理 ----
  _updateSeasoning(deltaSeconds, elapsedSeconds) {
    if (this.seasoningSessionStartedAt === null) {
      this.seasoningSessionStartedAt = elapsedSeconds;
    }

    for (const popup of this.seasoningScorePopups) {
      popup.age += deltaSeconds;
    }
    this.seasoningScorePopups = this.seasoningScorePopups.filter((p) => p.age < SEASONING_POPUP_LIFESPAN);

    const elapsed = elapsedSeconds - this.seasoningSessionStartedAt;
    if (elapsed >= SEASONING_TIME_LIMIT) {
      this.lastScore = this.seasoningScore;
      this.totalScore += this.seasoningScore;
      this._bounceScore();
      playSfx(SOUNDS.clear);
      this._enterStage(STAGE.SEASONING_RESULT, elapsedSeconds);
    }
  }

  // ---- タップ（説明画面・結果画面などのシンプルな進行用） ----
  handleTap(elapsedSeconds, width, height, x, y) {
    if (this.stage === STAGE.EXPLAIN_SAUCE) {
      playSfx(SOUNDS.start);
      this._enterStage(STAGE.SAUCE_TRACE, elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.EXPLAIN_MAYO) {
      playSfx(SOUNDS.start);
      this._enterStage(STAGE.MAYO_TRACE, elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.EXPLAIN_SEASONING) {
      playSfx(SOUNDS.start);
      this.selectedCard = null;
      this.seasoningScore = 0;
      this.seasoningTapCounts = { aonori: 0, edamame: 0, katsuobushi: 0 };
      this.seasoningPlacedList = [];
      this.seasoningScorePopups = [];
      this.seasoningSessionStartedAt = null;
      this._enterStage(STAGE.SEASONING_PLAY, elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.SEASONING_PRAISE) {
      playSfx(SOUNDS.start);
      gsap.killTweensOf(this.praiseCharPos);
      this._startScoreSequence(elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.CLEAR) {
      // 右上の「シェア」ボタン（ラベル部分も含めて少し広めに判定）
      if (isShareSupported() && x !== undefined && width !== undefined) {
        const shareX = width - 40;
        const shareY = 40;
        if (x >= shareX - 34 && x <= shareX + 34 && y >= shareY - 30 && y <= shareY + 50) {
          // シェアボタン自体がスクショに写り込まないよう、ボタン無しの状態を一度描き直してから撮影する
          if (this._canvasEl) {
            const shareCtx = this._canvasEl.getContext("2d");
            this._renderClearScreenContent(shareCtx, width, height);
          }
          shareScreenshot(this._canvasEl, "okonomiyaki.png");
          return;
        }
      }
      // 「かんせい」画面をタップ → 呼び出し側でタイトルへ
      playSfx(SOUNDS.retryTap);
      this.onFinish();
      return;
    }
  }

  // ---- なぞり操作（ドラッグ）／味付けゲームのカード選択・タップ散布 ----
  handlePointerDown(x, y, elapsedSeconds, width, height) {
    if (this.stage === STAGE.SEASONING_PLAY) {
      this._lastWidth = width;
      this._lastHeight = height;
      this._handleSeasoningPointer(x, y, width, height);
      return;
    }
    if (this.stage !== STAGE.SAUCE_TRACE && this.stage !== STAGE.MAYO_TRACE) return;
    if (this.tracing) return;
    // 説明画面をタップして開始した「その同じタップ」で、なぞり開始点を誤って掴んでしまわないようにする
    // （main.js側でhandleTap→handlePointerDownが同一イベントで連続して呼ばれるため）
    if (elapsedSeconds === this.stageEnteredAt) return;
    this._lastWidth = width;

    const points = this.stage === STAGE.SAUCE_TRACE ? this._getSaucePathPoints(width, height) : this._getMayoPathPoints(width, height);
    const startPoint = points[0];
    const startDist = Math.hypot(x - startPoint.x, y - startPoint.y);
    const grabRadius = width * 0.12;
    if (startDist <= grabRadius) {
      this.currentPathPoints = points;
      this.tracing = true;
      this.traceStartedAt = elapsedSeconds;
      this.deviationSum = 0;
      this.deviationCount = 0;
      this.maxProgress = 0;
      this.tracePathHistory = [{ x, y }];
    }
  }

  // 味付けゲーム：画面上部のカード行をタップしたら選択、それ以外の場所をタップしたら散布
  _handleSeasoningPointer(x, y, width, height) {
    const cardRowTop = height * SEASONING_CARD_ROW_TOP_RATIO;
    const cardRowBottom = cardRowTop + height * SEASONING_CARD_ROW_HEIGHT_RATIO;

    if (y >= cardRowTop && y <= cardRowBottom) {
      const colWidth = width / SEASONING_CARD_TYPES.length;
      const index = Math.min(Math.max(Math.floor(x / colWidth), 0), SEASONING_CARD_TYPES.length - 1);
      this.selectedCard = SEASONING_CARD_TYPES[index];
      playSfx(SOUNDS.toppingTap);
      return;
    }

    if (!this.selectedCard) return; // カード未選択のうちはタップしても何も乗らない

    const card = this.selectedCard;
    this.seasoningTapCounts[card] += 1;
    const gained = SEASONING_SCORE_PER_TAP[card];
    this.seasoningScore += gained;
    this._bounceScore();
    playSfx(SOUNDS.toppingTap);

    this.seasoningScorePopups.push({
      x,
      y,
      text: `+${gained}`,
      color: CARD_FALLBACK_COLOR[card],
      age: 0,
    });

    if (card === "aonori") {
      this._sprayAonoriFlakes(x, y, width);
    } else if (card === "edamame") {
      this._sprayEdamame(x, y, width);
    } else if (card === "katsuobushi") {
      this._sprayKatsuobushi(x, y, width);
    }
  }

  // 指定した場所を中心に、極座標を使ってランダムにあおのりの粒を散らす
  _sprayAonoriFlakes(x, y, width) {
    const sprayRadius = width * AONORI_SPRAY_RADIUS_RATIO; // 散布範囲（さらに倍増）
    const baseSize = width * 0.007;
    for (let i = 0; i < AONORI_SPRAY_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * sprayRadius;
      const fx = x + Math.cos(angle) * r;
      const fy = y + Math.sin(angle) * r;
      const sizeX = baseSize * (0.7 + Math.random() * 0.9);
      const sizeY = baseSize * (0.3 + Math.random() * 0.5); // 偏平にして「フレーク感」を出す
      const rotation = Math.random() * Math.PI * 2;
      const color = AONORI_COLORS[Math.floor(Math.random() * AONORI_COLORS.length)];
      this.seasoningPlacedList.push({ type: "aonori", x: fx, y: fy, sizeX, sizeY, rotation, color });
    }
  }

  // 指定した場所を中心に、枝豆（さや）を散らす（別AI生成コードのベジェ曲線デザインを移植）
  _sprayEdamame(x, y, width) {
    const sprayRadius = width * EDAMAME_SPRAY_RADIUS_RATIO;
    const baseLen = width * EDAMAME_BASE_LEN_RATIO;
    for (let i = 0; i < EDAMAME_SPRAY_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * sprayRadius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      const len = (Math.random() * 0.15 + 0.9) * baseLen;
      const rotation = Math.random() * Math.PI * 2;
      const isThreeBeans = Math.random() < 0.55;
      this.seasoningPlacedList.push({ type: "edamame", x: px, y: py, len, rotation, isThreeBeans });
    }
  }

  // 指定した場所を中心に、かつおぶしを散らす（別AI生成コードのランダム形状生成ロジックを移植）
  _sprayKatsuobushi(x, y, width) {
    const sprayRadius = width * KATSUOBUSHI_SPRAY_RADIUS_RATIO;
    const baseLen = width * KATSUOBUSHI_BASE_LEN_RATIO;
    const baseThick = width * KATSUOBUSHI_BASE_THICK_RATIO;
    const curveYAmp = width * 0.03;
    const curveXAmp = width * 0.02;

    for (let i = 0; i < KATSUOBUSHI_SPRAY_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * sprayRadius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;

      // サイズの劇的なランダム化（特大リボンから極小クズまで）
      const isDust = Math.random() < 0.3;
      const sizeModifier = isDust ? Math.random() * 0.3 + 0.1 : Math.random() * 1.3 + 0.4;
      const len = baseLen * sizeModifier;
      const thick = baseThick * sizeModifier;
      const rotation = Math.random() * Math.PI * 2;

      // くるくる巻いたカール感を出すためのうねり設定
      const isCurled = Math.random() < 0.5 && !isDust;
      const curveY1 = isCurled ? -(Math.random() * curveYAmp + curveYAmp) : (Math.random() - 0.5) * curveYAmp;
      const curveY2 = isCurled ? -(Math.random() * curveYAmp + curveYAmp) : (Math.random() - 0.5) * curveYAmp;
      const curveX1 = (Math.random() - 0.5) * curveXAmp;
      const curveX2 = (Math.random() - 0.5) * curveXAmp;

      // 1片の中での不均等な半透明度（線形グラデーション）
      const rgb = KATSUOBUSHI_COLORS[Math.floor(Math.random() * KATSUOBUSHI_COLORS.length)];
      const alpha1 = Math.random() * 0.2 + 0.55;
      const alpha2 = Math.random() * 0.15 + 0.85;
      const alpha3 = Math.random() * 0.25 + 0.5;

      // 影の設定（生成時に確定させ、毎フレーム同じ見た目で再描画できるようにする）
      const shadowBlur = width * (isDust ? 0.004 : 0.014);
      const shadowOffsetX = width * (isCurled ? 0.012 : 0.008) * (isDust ? 0.3 : 1);
      const shadowOffsetY = width * (isCurled ? 0.016 : 0.01) * (isDust ? 0.3 : 1);

      this.seasoningPlacedList.push({
        type: "katsuobushi",
        x: px,
        y: py,
        len,
        thick,
        rotation,
        isDust,
        curveX1,
        curveX2,
        curveY1,
        curveY2,
        rgb,
        alpha1,
        alpha2,
        alpha3,
        shadowBlur,
        shadowOffsetX,
        shadowOffsetY,
      });
    }
  }

  handlePointerMove(x, y, elapsedSeconds, width, height) {
    if (this.stage !== STAGE.SAUCE_TRACE && this.stage !== STAGE.MAYO_TRACE) return;
    if (!this.tracing) return;
    this._lastWidth = width;

    this.tracePathHistory.push({ x, y });

    const { progress, deviation } = this._projectOntoPolyline(x, y, this.currentPathPoints);
    this.deviationSum += deviation;
    this.deviationCount += 1;
    this.maxProgress = Math.max(this.maxProgress, progress);

    if (progress >= 0.97) {
      this._finishTrace(elapsedSeconds, true);
    }
  }

  handlePointerUp(x, y, elapsedSeconds) {
    if (this.stage !== STAGE.SAUCE_TRACE && this.stage !== STAGE.MAYO_TRACE) return;
    if (!this.tracing) return;
    this._finishTrace(elapsedSeconds, false);
  }

  // 点数が入った時に、GSAPで弾力のあるバウンド＋色フラッシュをさせる
  _bounceScore() {
    gsap.killTweensOf(this.scoreBounce);
    gsap.timeline()
      .to(this.scoreBounce, { scale: 1.7, flash: 1, duration: 0.12, ease: "back.out(3)" })
      .to(this.scoreBounce, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.25)" }, "<")
      .to(this.scoreBounce, { flash: 0, duration: 0.4, ease: "power1.out" }, "<0.1");
  }

  _finishTrace(elapsedSeconds, reachedEnd) {
    this.tracing = false;
    const isMayo = this.stage === STAGE.MAYO_TRACE;
    const avgDeviation = this.deviationCount > 0 ? this.deviationSum / this.deviationCount : 0;
    const maxDeviationRatio = isMayo ? MAYO_MAX_DEVIATION_RATIO : SAUCE_MAX_DEVIATION_RATIO;
    const maxAcceptable = this._lastWidth * maxDeviationRatio;
    const deviationRatio = Math.min(avgDeviation / Math.max(maxAcceptable, 1), 1);
    const accuracyFactor = 1 - deviationRatio;

    let score;
    if (reachedEnd) {
      score = Math.round(100 * accuracyFactor);
    } else {
      score = Math.round(100 * this.maxProgress * accuracyFactor);
    }

    this.lastScore = score;
    this.totalScore += score;
    if (isMayo) {
      this.mayoScore = score;
    } else {
      this.sauceScore = score;
    }
    this._bounceScore();
    playSfx(reachedEnd ? SOUNDS.clear : SOUNDS.toppingTap);
    if (reachedEnd) {
      this._triggerTraceCelebration();
    }
    this._enterStage(isMayo ? STAGE.MAYO_RESULT : STAGE.SAUCE_RESULT, elapsedSeconds);
  }

  // ソース・マヨネーズなぞりゲームをクリアした瞬間の演出（フラッシュ・キラキラ・星のはじけ・本体バウンド）
  _triggerTraceCelebration() {
    this.traceFlashAt = performance.now() / 1000;

    for (let i = 0; i < TRACE_SPARKLE_COUNT; i++) {
      this.traceSparkles.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.6,
        age: 0,
        size: 3 + Math.random() * 4,
      });
    }

    for (let i = 0; i < TRACE_STAR_BURST_COUNT; i++) {
      this.traceStarBursts.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.7,
        age: 0,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 8,
        size: 10 + Math.random() * 10,
      });
    }

    gsap.killTweensOf(this.traceBodyBounce);
    gsap
      .timeline()
      .to(this.traceBodyBounce, { scale: 1.12, duration: 0.1, ease: "back.out(2)" })
      .to(this.traceBodyBounce, { scale: 1, duration: 0.45, ease: "elastic.out(1.1, 0.3)" });
  }

  // 星形のパスを(0,0)中心に描く（fill/strokeは呼び出し側で行う）
  _drawStarPath(ctx, size) {
    const spikes = 5;
    const outerR = size;
    const innerR = size * 0.45;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  }

  render(ctx, width, height, elapsedSeconds) {
    this._canvasEl = ctx.canvas;

    // ---- クリア画面：全面「かんせい」イラスト＋紙吹雪＋総合スコア ----
    if (this.stage === STAGE.CLEAR) {
      this._renderClearScreen(ctx, width, height);
      return;
    }

    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;

    // 本体まわり一式を、ソース・マヨネーズなぞりクリアの瞬間ポンと弾ませる
    ctx.save();
    ctx.translate(bodyCenterX, bodyCenterY);
    ctx.scale(this.traceBodyBounce.scale, this.traceBodyBounce.scale);
    ctx.translate(-bodyCenterX, -bodyCenterY);

    // お皿・本体（共通）
    if (isReady(PLATE_IMG)) {
      const pw = w;
      const ph = pw * (PLATE_IMG.naturalHeight / PLATE_IMG.naturalWidth);
      ctx.drawImage(PLATE_IMG, bodyCenterX - pw / 2, bodyCenterY - ph / 2 + ph * 0.08, pw, ph);
    }

    let bodyH = w;
    let bodyImg = COOKED_BODY_IMG;
    // ソースは完成画像に差し替え、マヨネーズはなぞった軌跡をそのまま乗せるため画像は差し替えない
    const sauceAppliedStages = [
      STAGE.SAUCE_RESULT,
      STAGE.EXPLAIN_MAYO,
      STAGE.MAYO_TRACE,
      STAGE.MAYO_RESULT,
      STAGE.EXPLAIN_SEASONING,
      STAGE.SEASONING_PLAY,
      STAGE.SEASONING_RESULT,
      STAGE.SEASONING_PRAISE,
      STAGE.SCORE_SEQUENCE,
    ];
    if (sauceAppliedStages.includes(this.stage) && isReady(SAUCE_APPLIED_IMG)) {
      bodyImg = SAUCE_APPLIED_IMG;
    }
    if (isReady(bodyImg)) {
      bodyH = w * (bodyImg.naturalHeight / bodyImg.naturalWidth);
      ctx.drawImage(bodyImg, bodyCenterX - w / 2, bodyCenterY - bodyH / 2, w, bodyH);
    } else {
      bodyH = width * 0.52;
      ctx.fillStyle = "#e8a33d";
      ctx.beginPath();
      ctx.ellipse(bodyCenterX, bodyCenterY, w / 2, bodyH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // マヨネーズの軌跡：なぞり終わった後も、そのまま「乗った状態」として描き続ける
    const mayoPersistStages = [
      STAGE.MAYO_RESULT,
      STAGE.EXPLAIN_SEASONING,
      STAGE.SEASONING_PLAY,
      STAGE.SEASONING_RESULT,
      STAGE.SEASONING_PRAISE,
      STAGE.SCORE_SEQUENCE,
    ];
    if (mayoPersistStages.includes(this.stage) && this.tracePathHistory.length > 1) {
      this._renderMayoStroke(ctx, this.tracePathHistory);
    }

    // 味付けゲームで着地済みの粒（あおのり・枝豆・かつおぶし）はどのステージでも描き続ける
    // 置いた順番のまま描画することで、すでに乗っている分の重なり順は変わらず、
    // カードを選び直した後の新しいタップ分だけが自然と一番上に乗る
    for (const particle of this.seasoningPlacedList) {
      if (particle.type === "aonori") {
        this._renderAonoriFlakeAt(ctx, particle);
      } else if (particle.type === "edamame") {
        this._renderEdamameAt(ctx, particle);
      } else if (particle.type === "katsuobushi") {
        this._renderKatsuobushiAt(ctx, particle);
      }
    }
    ctx.restore();

    // ---- ソース・マヨネーズなぞりクリア演出：白フラッシュ＋衝撃波リング ----
    if (this.traceFlashAt !== null) {
      const flashT = elapsedSeconds - this.traceFlashAt;
      if (flashT < TRACE_FLASH_DURATION) {
        const flashAlpha = 1 - flashT / TRACE_FLASH_DURATION;
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

        const ringProgress = flashT / TRACE_FLASH_DURATION;
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
        this.traceFlashAt = null;
      }
    }

    // ---- キラキラ粒子 ----
    const traceBurstRadius = w * 0.5;
    for (const s of this.traceSparkles) {
      const progress = s.age / TRACE_SPARKLE_LIFETIME;
      const distance = s.speed * traceBurstRadius * progress;
      const alpha = 1 - progress;
      const px = bodyCenterX + Math.cos(s.angle) * distance;
      const py = bodyCenterY + Math.sin(s.angle) * distance;
      const size = s.size * (1 - progress * 0.4);

      ctx.save();
      ctx.globalAlpha = Math.max(alpha, 0);
      ctx.fillStyle = TRACE_SPARKLE_COLOR;
      ctx.shadowColor = TRACE_SPARKLE_COLOR;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- 星がキラキラはじけ飛ぶ演出 ----
    const traceStarBurstRadius = w * 0.75;
    for (const s of this.traceStarBursts) {
      const progress = s.age / TRACE_STAR_BURST_LIFETIME;
      const eased = 1 - (1 - progress) * (1 - progress);
      const distance = s.speed * traceStarBurstRadius * eased;
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

    if (this.stage === STAGE.EXPLAIN_SAUCE) {
      this._renderExplain(ctx, width, height, "ソースなぞりゲーム", [
        "うずまきを中心から外へ",
        "正確になぞろう！",
        `制限時間 ${SAUCE_TIME_LIMIT} 秒`,
      ]);
    }

    if (this.stage === STAGE.EXPLAIN_MAYO) {
      this._renderExplain(ctx, width, height, "マヨネーズなぞりゲーム", [
        "急カーブが連続する",
        "むずかしいルートだよ！",
        `制限時間 ${MAYO_TIME_LIMIT} 秒`,
      ]);
    }

    if (this.stage === STAGE.EXPLAIN_SEASONING) {
      this._renderSeasoningCards(ctx, width, height);
      this._renderExplain(ctx, width, height, "味付けゲーム", [
        "上のカードをえらんでから",
        "お好み焼きをタップして散らそう！",
        "カードはいつでも選び直せるよ",
        `制限時間 ${SEASONING_TIME_LIMIT} 秒、たくさんタップしよう`,
      ]);
    }

    if (this.stage === STAGE.SAUCE_TRACE || this.stage === STAGE.MAYO_TRACE) {
      const points = this.stage === STAGE.SAUCE_TRACE ? this._getSaucePathPoints(width, height) : this._getMayoPathPoints(width, height);
      const limit = this.stage === STAGE.SAUCE_TRACE ? SAUCE_TIME_LIMIT : MAYO_TIME_LIMIT;

      // 画面を軽く暗くして、ルート・軌跡を見やすくしつつ、仕上がりも見えるようにする
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // お手本ルート（明るい白線＋グロー）
      ctx.save();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([12, 10]);
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // なぞった軌跡：ソースは光る帯、マヨネーズは立体感のあるクリーム状の質感
      if (this.tracePathHistory.length > 1) {
        if (this.stage === STAGE.MAYO_TRACE) {
          this._renderMayoStroke(ctx, this.tracePathHistory);
        } else {
          ctx.save();
          ctx.strokeStyle = "#ffd166";
          ctx.lineWidth = 8;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowColor = "#ffd166";
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(this.tracePathHistory[0].x, this.tracePathHistory[0].y);
          for (let i = 1; i < this.tracePathHistory.length; i++) {
            ctx.lineTo(this.tracePathHistory[i].x, this.tracePathHistory[i].y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // 始点・終点マーク（大きめ・光らせる）
      const startPulse = 1 + 0.15 * Math.sin(elapsedSeconds * 5);
      ctx.save();
      ctx.shadowColor = this.tracing ? "#4caf50" : "#ff8a3d";
      ctx.shadowBlur = 18;
      ctx.fillStyle = this.tracing ? "#4caf50" : "#ff8a3d";
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 16 * (this.tracing ? 1 : startPulse), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = "#e53935";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#e53935";
      ctx.beginPath();
      ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!this.tracing) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText("オレンジの点からなぞりはじめよう", width / 2, height * 0.15);
        ctx.restore();
      } else {
        const remaining = Math.max(limit - (elapsedSeconds - this.traceStartedAt), 0);
        this._renderCountdown(ctx, width, height, remaining, 1);
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT) {
      this._renderScorePopup(ctx, width, height, "ソース", this.lastScore);
    }
    if (this.stage === STAGE.MAYO_RESULT) {
      this._renderScorePopup(ctx, width, height, "マヨネーズ", this.lastScore);
    }

    if (this.stage === STAGE.SEASONING_PLAY) {
      this._renderSeasoningCards(ctx, width, height);

      const elapsed = this.seasoningSessionStartedAt !== null ? elapsedSeconds - this.seasoningSessionStartedAt : 0;
      const remaining = Math.max(SEASONING_TIME_LIMIT - elapsed, 0);
      this._renderCountdown(ctx, width, height, remaining, 2);

      if (!this.selectedCard) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#fff";
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(elapsedSeconds * 4);
        ctx.fillText("まずカードをえらぼう！", width / 2, height * 0.25);
        ctx.restore();
      }

      this._renderSeasoningScorePopups(ctx);
    }

    if (this.stage === STAGE.SEASONING_RESULT) {
      this._renderSeasoningCards(ctx, width, height);
      this._renderScorePopup(ctx, width, height, "味付けゲーム", this.lastScore);
    }

    if (this.stage === STAGE.SEASONING_PRAISE) {
      this._renderSeasoningPraise(ctx, width, height, elapsedSeconds);
    }

    // スコアシーケンス表示
    if (this.stage === STAGE.SCORE_SEQUENCE) {
      this._renderScoreSequence(ctx, width, height, elapsedSeconds);
    }

    // ---- 合計スコア（大きく、加算時にGSAPで弾力のあるバウンド） ----
    ctx.save();
    const scoreText = `${this.totalScore} 点`;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "right";
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreBarW = scoreMetrics.width + 28;
    const scoreBarH = 46;
    const scoreRightX = width - 16;
    const scoreTopY = 12;
    const flash = this.scoreBounce.flash;
    const bgR = Math.round(90 + (255 - 90) * flash);
    const bgG = Math.round(45 + (200 - 45) * flash);
    const bgB = Math.round(12 + (80 - 12) * flash);
    ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, 0.85)`;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(scoreRightX - scoreBarW, scoreTopY, scoreBarW, scoreBarH, 12) : ctx.rect(scoreRightX - scoreBarW, scoreTopY, scoreBarW, scoreBarH);
    ctx.fill();

    ctx.save();
    ctx.translate(scoreRightX - scoreBarW / 2, scoreTopY + scoreBarH / 2);
    ctx.scale(this.scoreBounce.scale, this.scoreBounce.scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(scoreText, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  // ---- 味付けゲームのカードUI（画面上部、3枚並び） ----
  _renderSeasoningCards(ctx, width, height) {
    const cardTop = height * SEASONING_CARD_ROW_TOP_RATIO;
    const cardRowH = height * SEASONING_CARD_ROW_HEIGHT_RATIO;
    const colWidth = width / SEASONING_CARD_TYPES.length;

    SEASONING_CARD_TYPES.forEach((type, index) => {
      const cx = colWidth * index + colWidth / 2;
      const cardW = colWidth * 0.8;
      const cardH = cardRowH * 0.92;
      const cardX = cx - cardW / 2;
      const cardY = cardTop + (cardRowH - cardH) / 2;
      const isSelected = this.selectedCard === type;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      this._roundRectPath(ctx, cardX, cardY, cardW, cardH, 10);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = "#a3866f";
        ctx.lineWidth = 2;
      }
      this._roundRectPath(ctx, cardX, cardY, cardW, cardH, 10);
      ctx.stroke();
      ctx.restore();

      const img = CARD_IMAGES[type];
      ctx.save();
      if (isReady(img)) {
        const pad = cardW * 0.12;
        this._roundRectPath(ctx, cardX, cardY, cardW, cardH, 10);
        ctx.clip();
        ctx.drawImage(img, cardX + pad, cardY + pad, cardW - pad * 2, cardH - pad * 2);
      } else {
        ctx.fillStyle = CARD_FALLBACK_COLOR[type];
        ctx.beginPath();
        ctx.ellipse(cx, cardY + cardH * 0.42, cardW * 0.26, cardH * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#5a2d0c";
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.round(cardH * 0.17)}px sans-serif`;
        ctx.fillText(SEASONING_LABELS[type], cx, cardY + cardH * 0.85);
      }
      ctx.restore();
    });
  }

  _roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // なぞった軌跡を「立体感のあるクリーム状」に描く（マヨネーズ用）
  _renderMayoStroke(ctx, path) {
    if (path.length < 2) return;
    ctx.save();
    ctx.strokeStyle = "rgba(90,45,12,0.15)";
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y + 3);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y + 3);
    }
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, 0, 12);
    gradient.addColorStop(0, "#fffef2");
    gradient.addColorStop(1, "#fdf6d8");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y - 2);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y - 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // あおのりの粒（多色ブレンド・いびつな楕円・薄い影）を1粒描く
  // 仕様: 単なる緑の丸ドットにせず、フレークらしい歪み・回転・色のばらつきを持たせる
  _renderAonoriFlakeAt(ctx, flake) {
    ctx.save();
    ctx.translate(flake.x, flake.y);
    ctx.rotate(flake.rotation);
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 1;
    ctx.shadowOffsetY = 0.5;
    ctx.fillStyle = flake.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, flake.sizeX, flake.sizeY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 枝豆（さや）を1つ描く（別AI生成コードのベジェ曲線デザインをそのまま移植）
  _renderEdamameAt(ctx, pod) {
    const { x, y, len, rotation, isThreeBeans } = pod;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.shadowColor = "rgba(10, 20, 5, 0.35)";
    ctx.shadowBlur = len * 0.08;
    ctx.shadowOffsetX = len * 0.027;
    ctx.shadowOffsetY = len * 0.053;

    ctx.beginPath();
    if (isThreeBeans) {
      ctx.moveTo(-len * 0.48, len * 0.14);
      ctx.bezierCurveTo(-len * 0.36, -len * 0.06, -len * 0.24, -len * 0.01, -len * 0.18, len * 0.01);
      ctx.bezierCurveTo(-len * 0.1, -len * 0.08, len * 0.1, -len * 0.12, len * 0.16, -len * 0.05);
      ctx.bezierCurveTo(len * 0.24, -len * 0.18, len * 0.34, -len * 0.24, len * 0.44, -len * 0.24);
      ctx.bezierCurveTo(len * 0.49, -len * 0.24, len * 0.47, -len * 0.13, len * 0.41, -len * 0.07);
      ctx.bezierCurveTo(len * 0.34, len * 0.04, len * 0.25, len * 0.08, len * 0.18, len * 0.11);
      ctx.bezierCurveTo(len * 0.1, len * 0.17, -len * 0.1, len * 0.2, -len * 0.18, len * 0.17);
      ctx.bezierCurveTo(-len * 0.28, len * 0.27, -len * 0.44, len * 0.23, -len * 0.48, len * 0.17);
      ctx.bezierCurveTo(-len * 0.51, len * 0.15, -len * 0.51, len * 0.14, -len * 0.48, len * 0.14);
    } else {
      ctx.moveTo(-len * 0.46, len * 0.14);
      ctx.bezierCurveTo(-len * 0.32, -len * 0.06, -len * 0.12, -len * 0.01, -len * 0.05, len * 0.01);
      ctx.bezierCurveTo(len * 0.05, -len * 0.08, len * 0.24, -len * 0.18, len * 0.38, -len * 0.2);
      ctx.bezierCurveTo(len * 0.43, -len * 0.2, len * 0.41, -len * 0.11, len * 0.37, -len * 0.05);
      ctx.bezierCurveTo(len * 0.31, len * 0.06, len * 0.21, len * 0.1, len * 0.1, len * 0.12);
      ctx.bezierCurveTo(-len * 0.05, len * 0.18, -len * 0.25, len * 0.25, -len * 0.42, len * 0.2);
      ctx.bezierCurveTo(-len * 0.48, len * 0.17, -len * 0.48, len * 0.14, -len * 0.46, len * 0.14);
    }
    ctx.closePath();

    const bodyGrad = ctx.createLinearGradient(-len * 0.4, -len * 0.2, len * 0.4, len * 0.2);
    bodyGrad.addColorStop(0, "#bad74c");
    bodyGrad.addColorStop(0.5, "#8cb930");
    bodyGrad.addColorStop(1, "#5d8c1c");
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // 影の設定をクリアしてクリッピング（ハイライトが影の外に漏れないように）
    ctx.shadowColor = "transparent";
    ctx.clip();

    if (isThreeBeans) {
      this._renderEdamameHighlight(ctx, 0, -len * 0.02, len * 0.17, 0.35);
      this._renderEdamameHighlight(ctx, len * 0.27, -len * 0.1, len * 0.14, 0.45);
    } else {
      this._renderEdamameHighlight(ctx, len * 0.21, -len * 0.08, len * 0.17, 0.5);
      this._renderEdamameHighlight(ctx, -len * 0.23, len * 0.05, len * 0.19, 0.25);
    }

    ctx.restore();
  }

  _renderEdamameHighlight(ctx, cx, cy, r, opacity) {
    const grad = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, 0, cx, cy, r * 1.3);
    grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
    grad.addColorStop(0.4, `rgba(255, 255, 255, ${opacity * 0.3})`);
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // かつおぶしを1枚描く（別AI生成コードのランダム形状生成ロジックをそのまま移植）
  _renderKatsuobushiAt(ctx, flake) {
    const { x, y, len, thick, rotation, curveX1, curveX2, curveY1, curveY2, rgb, alpha1, alpha2, alpha3, isDust, shadowBlur, shadowOffsetX, shadowOffsetY } = flake;

    ctx.save();
    ctx.shadowColor = "rgba(40, 20, 5, 0.22)";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffsetX;
    ctx.shadowOffsetY = shadowOffsetY;

    ctx.translate(x, y);
    ctx.rotate(rotation);

    const gradient = ctx.createLinearGradient(-len / 2, -thick / 2, len / 2, thick / 2);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha1})`);
    gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha2})`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha3})`);
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.bezierCurveTo(-len / 4 + curveX1, -thick + curveY1, len / 4 + curveX2, -thick + curveY2, len / 2, 0);
    ctx.lineTo(len / 2 - (isDust ? 0 : len * 0.075), thick / 4);
    ctx.bezierCurveTo(len / 4 + curveX2, thick + curveY2, -len / 4 + curveX1, thick + curveY1, -len / 2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 全ゲーム共通の残り時間カウントダウン表示（位置・見た目を統一）
  _renderCountdown(ctx, width, height, remaining, warnThreshold = 1) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = remaining < warnThreshold ? "#ff8a80" : "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.fillText(remaining.toFixed(1), width / 2, height * COUNTDOWN_Y_RATIO);
    ctx.restore();
  }

  // タップ毎の「+20」等のポップ（浮き上がりながらフェードアウト）
  _renderSeasoningScorePopups(ctx) {
    for (const popup of this.seasoningScorePopups) {
      const t = popup.age / SEASONING_POPUP_LIFESPAN; // 0〜1
      const riseY = t * 44;
      const alpha = 1 - t;
      const scale = t < 0.2 ? 0.7 + (t / 0.2) * 0.5 : 1.2 - ((t - 0.2) / 0.8) * 0.2;

      ctx.save();
      ctx.globalAlpha = Math.max(alpha, 0);
      ctx.translate(popup.x, popup.y - riseY);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.font = "bold 26px sans-serif";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#000";
      ctx.strokeText(popup.text, 0, 0);
      ctx.fillStyle = popup.color;
      ctx.fillText(popup.text, 0, 0);
      ctx.restore();
    }
  }

  _renderScorePopup(ctx, width, height, label, score) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 22px sans-serif";
    const labelW = ctx.measureText(label).width;
    ctx.font = "bold 42px sans-serif";
    const scoreW = ctx.measureText(`${score} 点`).width;
    const badgeW = Math.max(labelW, scoreW) + 48;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(width / 2 - badgeW / 2, height * 0.6, badgeW, height * 0.18, 16);
    ctx.fill();

    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(label, width / 2, height * 0.65);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(`${score} 点`, width / 2, height * 0.74);
    ctx.restore();
  }

  // 味付けゲーム終了後、右下からキャラがトコトコ歩いてきて褒めてくれる演出を開始する
  _enterSeasoningPraise(elapsedSeconds) {
    this.praiseMessage = PRAISE_PHRASES[Math.floor(Math.random() * PRAISE_PHRASES.length)];
    this.praiseArrived = false;

    const startX = this._lastWidth + 80; // 画面外（右）からスタート
    const targetX = this._lastWidth * 0.72; // 歩いて止まる位置

    gsap.killTweensOf(this.praiseCharPos);
    this.praiseCharPos.x = startX;
    gsap.to(this.praiseCharPos, {
      x: targetX,
      duration: PRAISE_WALK_DURATION,
      ease: "power1.out",
      onComplete: () => {
        this.praiseArrived = true;
      },
    });

    this._enterStage(STAGE.SEASONING_PRAISE, elapsedSeconds);
  }

  // 右下からトコトコ歩いてきたキャラ＋関西弁の吹き出しを描画
  _renderSeasoningPraise(ctx, width, height, elapsedSeconds) {
    const groundY = height * 0.86;
    const charH = width * 0.34;
    const img = PRAISE_CHARACTER_IMG;
    const charW = isReady(img) ? charH * (img.naturalWidth / img.naturalHeight) : charH * 0.62;
    const charX = this.praiseCharPos.x;

    // トコトコ歩く上下動（到着したら止まる）
    const bob = this.praiseArrived ? 0 : Math.abs(Math.sin(elapsedSeconds * 11)) * 6;

    ctx.save();
    if (isReady(img)) {
      ctx.drawImage(img, charX - charW / 2, groundY - charH - bob, charW, charH);
    } else {
      // フォールバック：シンプルな丸キャラ
      ctx.fillStyle = "#ffb385";
      ctx.beginPath();
      ctx.ellipse(charX, groundY - charH * 0.42 - bob, charW * 0.45, charH * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.round(charH * 0.32)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("😊", charX, groundY - charH * 0.42 - bob);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    if (!this.praiseArrived) return;

    // 吹き出し
    ctx.save();
    ctx.textAlign = "center";
    const fontSize = this._fitFontSize(ctx, this.praiseMessage, width * 0.6, 22);
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textW = ctx.measureText(this.praiseMessage).width;
    const bubbleW = textW + 48;
    const bubbleH = 56;
    const bubbleBottomY = groundY - charH - 30;
    const bubbleX = Math.min(charX, width - bubbleW / 2 - 12);

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.roundRect(bubbleX - bubbleW / 2, bubbleBottomY - bubbleH, bubbleW, bubbleH, 16);
    ctx.fill();
    // 吹き出しのしっぽ
    ctx.beginPath();
    ctx.moveTo(bubbleX - 12, bubbleBottomY);
    ctx.lineTo(bubbleX + 12, bubbleBottomY);
    ctx.lineTo(bubbleX, bubbleBottomY + 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#5a2d0c";
    ctx.fillText(this.praiseMessage, bubbleX, bubbleBottomY - bubbleH / 2 + fontSize / 3);
    ctx.restore();

    // 「タップしてすすむ」の点滅ヒント
    const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
    ctx.save();
    ctx.globalAlpha = blinkAlpha;
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeText("タップしてすすむ", width / 2, height * 0.95);
    ctx.fillText("タップしてすすむ", width / 2, height * 0.95);
    ctx.restore();
  }

  // スコア内訳を順番に表示するシーケンスを開始
  // ソース・マヨネーズ・味付けゲーム（あおのり/かつおぶし/枝豆それぞれ「点数×回数」）・合計、の順で表示
  _startScoreSequence(elapsedSeconds) {
    const aonoriCount = this.seasoningTapCounts.aonori;
    const katsuobushiCount = this.seasoningTapCounts.katsuobushi;
    const edamameCount = this.seasoningTapCounts.edamame;

    this.scoreSequenceItems = [
      { label: "ソース", score: this.sauceScore, subtext: "得点" },
      { label: "マヨネーズ", score: this.mayoScore, subtext: "得点" },
      {
        label: "あおのり",
        score: SEASONING_SCORE_PER_TAP.aonori * aonoriCount,
        subtext: `${SEASONING_SCORE_PER_TAP.aonori}点 × ${aonoriCount}回`,
      },
      {
        label: "かつおぶし",
        score: SEASONING_SCORE_PER_TAP.katsuobushi * katsuobushiCount,
        subtext: `${SEASONING_SCORE_PER_TAP.katsuobushi}点 × ${katsuobushiCount}回`,
      },
      {
        label: "えだまめ",
        score: SEASONING_SCORE_PER_TAP.edamame * edamameCount,
        subtext: `${SEASONING_SCORE_PER_TAP.edamame}点 × ${edamameCount}回`,
      },
      { label: "合計", score: this.totalScore, subtext: "スコア", highlight: true },
    ];
    this.scoreSequenceIndex = 0;
    this.scoreSequenceStartedAt = elapsedSeconds;
    this._enterStage(STAGE.SCORE_SEQUENCE, elapsedSeconds);
  }

  // スコアシーケンスの更新
  _updateScoreSequence(elapsedSeconds) {
    const DISPLAY_DURATION = 2.2; // 各項目の表示時間（秒、ゆっくりめに）
    const elapsed = elapsedSeconds - this.scoreSequenceStartedAt;
    const totalItems = this.scoreSequenceItems.length;
    const totalDuration = totalItems * DISPLAY_DURATION;

    if (elapsed >= totalDuration) {
      // 全て表示し終えたらクリア画面へ
      this._enterClear(elapsedSeconds);
    }
  }

  // クリア画面へ遷移（かんせい画像を1つ選び、紙吹雪を初期化）
  _enterClear(elapsedSeconds) {
    this.selectedCompleteImg = pickReadyRandom(COMPLETE_IMAGES);
    this.confetti = [];
    this._lastConfettiSpawn = elapsedSeconds;
    playSfx(SOUNDS.clear);
    this._enterStage(STAGE.CLEAR, elapsedSeconds);
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

  // クリア画面（かんせい画像＋紙吹雪＋総合スコア＋「タップしてタイトルへ」）
  _renderClearScreen(ctx, width, height) {
    this._renderClearScreenContent(ctx, width, height);
    this._renderShareButton(ctx, width);
  }

  // クリア画面の中身（シェアボタンを除く）。シェア撮影時にボタン無しで撮り直すために分離してある。
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

    for (const c of this.confetti) {
      ctx.save();
      ctx.translate(c.x * width, c.y * height);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 3, c.size, c.size * 0.6);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, height * 0.78, width, height * 0.22);

    const scoreText = `${this.totalScore}点！！`;
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText(scoreText, width / 2, height * 0.84);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText(scoreText, width / 2, height * 0.84);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("タップしてタイトルへ", width / 2, height * 0.93);
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

  // スコアシーケンスの描画
  _renderScoreSequence(ctx, width, height, elapsedSeconds) {
    const DISPLAY_DURATION = 2.2; // 各項目の表示時間（秒、ゆっくりめに）
    const elapsed = elapsedSeconds - this.scoreSequenceStartedAt;
    const currentIndex = Math.floor(elapsed / DISPLAY_DURATION);
    const itemProgress = (elapsed % DISPLAY_DURATION) / DISPLAY_DURATION; // 0〜1

    // 画面全体を暗くする
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (currentIndex < this.scoreSequenceItems.length) {
      const item = this.scoreSequenceItems[currentIndex];

      // フェードイン・フェードアウト効果
      let alpha = 1;
      if (itemProgress < 0.15) {
        alpha = itemProgress / 0.15; // フェードイン
      } else if (itemProgress > 0.85) {
        alpha = (1 - itemProgress) / 0.15; // フェードアウト
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";

      // 項目名
      ctx.fillStyle = "#ffcf5c";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(item.label, width / 2, height * 0.35);

      // サブテキスト
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(item.subtext, width / 2, height * 0.42);

      // スコア（ハイライト項目は大きく）
      if (item.highlight) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "bold 72px sans-serif";
        ctx.shadowColor = "#ff8a3d";
        ctx.shadowBlur = 20;
      } else {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 56px sans-serif";
      }
      ctx.fillText(`${item.score} 点`, width / 2, height * 0.55);

      ctx.restore();
    }
  }

  // 見出し文字が画面幅に収まるよう、必要ならフォントサイズを縮める（スマホ幅対策）
  _fitFontSize(ctx, text, maxWidth, baseSize, minSize = 16) {
    let size = baseSize;
    ctx.font = `bold ${size}px sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > minSize) {
      size -= 1;
      ctx.font = `bold ${size}px sans-serif`;
    }
    return size;
  }

  _renderExplain(ctx, width, height, title, lines) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, height * 0.15, width, height * 0.45);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    const titleSize = this._fitFontSize(ctx, title, width * 0.9, 26);
    ctx.font = `bold ${titleSize}px sans-serif`;
    ctx.fillText(title, width / 2, height * 0.24);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px sans-serif";
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height * 0.32 + i * 28);
    });

    const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 / 1.4));
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = "#e0552b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("タップしてはじめる", width / 2, height * 0.32 + lines.length * 28 + 30);
    ctx.restore();
  }
}
