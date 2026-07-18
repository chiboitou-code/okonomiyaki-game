import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

// ---- 調整用の定数 ----
const SAUCE_TIME_LIMIT = 4.0; // 秒。ソース（ジグザグ）の制限時間
const MAYO_TIME_LIMIT = 5.0; // 秒。マヨネーズ（急カーブ連続）の制限時間
const SAUCE_MAX_DEVIATION_RATIO = 0.13; // 本体幅に対する「これ以上ズレたら0点」の許容ズレ
const MAYO_MAX_DEVIATION_RATIO = 0.1; // マヨネーズはより厳しめ
const RESULT_PAUSE = 1.2; // 秒。結果表示の時間

// あおのり（太鼓の達人風リズムゲーム）用の調整値
const AONORI_SESSION_DURATION = 10; // 秒。この時間の間、ノーツが流れ続ける
const AONORI_SPAWN_INTERVAL = 0.7; // 秒。ノーツとノーツの発生間隔
const AONORI_NOTE_SPEED_RATIO = 0.55; // 画面横幅に対する、1秒あたりの移動距離の割合（右→左）
const AONORI_LANE_Y_RATIO = 0.46; // ノーツが流れるレーンのY位置
const AONORI_JUDGMENT_X_RATIO = 0.2; // 判定ラインのX位置（左寄り、太鼓の達人の判定枠のイメージ）
const AONORI_GREAT_TOLERANCE_RATIO = 0.035; // 「グレイト」判定の許容ズレ（狭い＝高得点ゾーン、画面横幅基準）
const AONORI_GOOD_TOLERANCE_RATIO = 0.09; // 「グッド」判定の許容ズレ（広い＝中得点ゾーン、画面横幅基準）
const AONORI_MISS_MARGIN_RATIO = 0.12; // 判定ラインをこれだけ通り過ぎたら自動的にミス扱い
const AONORI_GREAT_SCORE = 100;
const AONORI_GOOD_SCORE = 60;
const AONORI_DOUBLE_NOTE_CHANCE = 0.3; // ダブルタップノーツが出現する確率

const AONORI_COLORS = ["#2e7d32", "#1b5e20", "#43a047", "#558b2f", "#33691e"];
const AONORI_SPRAY_COUNT = 6; // 1回のタップで散らす粒の数

const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");
const SAUCE_APPLIED_IMG = loadImage("/images/toppings/topping_sauce.png");

const STAGE = {
  EXPLAIN_SAUCE: "explain_sauce",
  SAUCE_TRACE: "sauce_trace",
  SAUCE_RESULT: "sauce_result",
  EXPLAIN_MAYO: "explain_mayo",
  MAYO_TRACE: "mayo_trace",
  MAYO_RESULT: "mayo_result",
  EXPLAIN_AONORI: "explain_aonori",
  AONORI_PLAY: "aonori_play",
  AONORI_RESULT: "aonori_result",
  SCORE_SEQUENCE: "score_sequence", // スコア内訳を順番に表示
  STUB_END: "stub_end", // かつおぶしは実装中のため、いったんここで止める
};

export class AdultToppingPhase {
  /**
   * @param {object} opts
   * @param {() => void} opts.onFinish - 一連の流れが終わった時（呼び出し側でタイトル等に戻す）
   */
  /**
   * @param {object} opts
   * @param {() => void} opts.onFinish - 一連の流れが終わった時（呼び出し側でタイトル等に戻す）
   * @param {number} [opts.initialScore] - それ以前のフェーズ（ひっくり返すフェーズ等）からの持ち越しスコア
   */
  /**
   * @param {object} opts
   * @param {() => void} opts.onFinish - 一連の流れが終わった時（呼び出し側でタイトル等に戻す）
   * @param {number} [opts.initialScore] - それ以前のフェーズ（ひっくり返すフェーズ等）からの持ち越しスコア
   * @param {"sauce"|"mayo"|"aonori"} [opts.startAt] - デバッグ用：指定したゲームの説明画面から開始する
   * @param {boolean} [opts.debugSingleGame] - デバッグ用：1つのゲームが終わったら、そのままonFinishを呼ぶ
   */
  constructor({ onFinish, initialScore = 0, startAt = null, debugSingleGame = false }) {
    this.onFinish = onFinish;
    this.debugSingleGame = debugSingleGame;
    const startStageMap = {
      sauce: STAGE.EXPLAIN_SAUCE,
      mayo: STAGE.EXPLAIN_MAYO,
      aonori: STAGE.EXPLAIN_AONORI,
    };
    this.stage = startStageMap[startAt] || STAGE.EXPLAIN_SAUCE;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = initialScore;
    this.lastScore = 0;
    this.scoreBounce = { scale: 1, flash: 0 }; // GSAPで動かす値。render側はこれをそのまま読むだけ
    
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

    // あおのり用の状態
    this.aonoriScore = 0;
    this.laneNotes = []; // 流れているノーツ { x, requiredTaps, tapsReceived }
    this.aonoriPlaced = []; // 着地済みの粒（青のりの質感で描画） { x, y, sizeX, sizeY, rotation, color }
    this.aonoriFeedback = []; // 「グレイト！」「グッド！」「ミス…」の一瞬のテキスト表示 { x, y, text, color, age }
    this.aonoriSessionStartedAt = null;
    this.aonoriLastSpawnAt = null;
    this.aonoriSpawningDone = false;
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
  }

  // ---- パス生成 ----
  // ソース：鋭角のジグザグ（迷路風）。画面の横幅をほぼ使い切り、折れ数も増やして難化
  _getSaucePathPoints(width, height) {
    const cy = height * BODY_CENTER_Y_RATIO;
    const amp = height * 0.09; // 縦方向の振れ幅（広め）
    const xStart = width * 0.1;
    const xEnd = width * 0.9;
    const SEGMENTS = 9; // 折れ数を増やして（6→9）より細かいジグザグに
    const points = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      const x = xStart + (xEnd - xStart) * t;
      const y = cy + (i % 2 === 0 ? 0 : i % 4 === 1 ? -amp : amp);
      points.push({ x, y });
    }
    return points;
  }

  // マヨネーズ：急カーブが連続する曲線。上から下方向へ、カーブ数8でさらに高難易度に
  _getMayoPathPoints(width, height) {
    const cx = width / 2;
    const ampX = width * 0.28; // 横方向の振れ幅
    const frequency = 6; // カーブの数（8→6に調整）
    const yStart = height * 0.1;
    const yEnd = height * 0.82;
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
        this._enterStage(STAGE.EXPLAIN_AONORI, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.AONORI_PLAY) {
      this._updateAonori(deltaSeconds, elapsedSeconds);
    }

    if (this.stage === STAGE.AONORI_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      if (this.debugSingleGame) {
        this.onFinish();
      } else {
        // スコア内訳を順番に表示
        this._startScoreSequence(elapsedSeconds);
      }
    }
    
    // スコアシーケンス表示
    if (this.stage === STAGE.SCORE_SEQUENCE) {
      this._updateScoreSequence(elapsedSeconds);
    }
  }

  _spawnAonoriNote(width) {
    const isDouble = Math.random() < AONORI_DOUBLE_NOTE_CHANCE;
    this.laneNotes.push({
      x: width * 1.1,
      requiredTaps: isDouble ? 2 : 1,
      tapsReceived: 0,
    });
  }

  _updateAonori(deltaSeconds, elapsedSeconds) {
    const width = this._lastWidth;
    const height = this._lastHeight || this._lastWidth * 1.6;

    if (this.aonoriSessionStartedAt === null) {
      this.aonoriSessionStartedAt = elapsedSeconds;
      this.aonoriLastSpawnAt = elapsedSeconds - AONORI_SPAWN_INTERVAL; // 開始直後にすぐ1個目が出るように
    }

    // 制限時間が来たら、新規のノーツ発生を止める（今流れている分は最後まで処理する）
    if (!this.aonoriSpawningDone && elapsedSeconds - this.aonoriSessionStartedAt >= AONORI_SESSION_DURATION) {
      this.aonoriSpawningDone = true;
    }

    if (!this.aonoriSpawningDone && elapsedSeconds - this.aonoriLastSpawnAt >= AONORI_SPAWN_INTERVAL) {
      this.aonoriLastSpawnAt = elapsedSeconds;
      this._spawnAonoriNote(width);
    }

    const judgmentX = width * AONORI_JUDGMENT_X_RATIO;
    const missX = judgmentX - width * AONORI_MISS_MARGIN_RATIO;
    for (const note of this.laneNotes) {
      note.x -= width * AONORI_NOTE_SPEED_RATIO * deltaSeconds;
    }
    // 判定ラインを通り過ぎたノーツはミス扱い：お好み焼き以外の場所に青のりが散らばる
    const passedNotes = this.laneNotes.filter((note) => note.x <= missX);
    for (const note of passedNotes) {
      this._missAonoriNote(width, height);
    }
    this.laneNotes = this.laneNotes.filter((note) => note.x > missX);

    // フィードバック文字（「グレイト！」等）の経過時間を進める
    for (const f of this.aonoriFeedback) {
      f.age += deltaSeconds;
    }
    this.aonoriFeedback = this.aonoriFeedback.filter((f) => f.age < 0.6);

    if (this.aonoriSpawningDone && this.laneNotes.length === 0) {
      this.lastScore = this.aonoriScore;
      this.totalScore += this.aonoriScore;
      this._bounceScore();
      this._enterStage(STAGE.AONORI_RESULT, elapsedSeconds);
    }
  }

  // ---- タップ（説明画面・結果画面などのシンプルな進行用） ----
  handleTap(elapsedSeconds, width, height) {
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
    if (this.stage === STAGE.EXPLAIN_AONORI) {
      playSfx(SOUNDS.start);
      this.aonoriScore = 0;
      this.laneNotes = [];
      this.aonoriPlaced = [];
      this.aonoriFeedback = [];
      this.aonoriSessionStartedAt = null;
      this.aonoriLastSpawnAt = null;
      this.aonoriSpawningDone = false;
      this._enterStage(STAGE.AONORI_PLAY, elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.AONORI_PLAY) {
      this._handleAonoriBeat(elapsedSeconds, width || this._lastWidth, height || this._lastHeight);
      return;
    }
    if (this.stage === STAGE.STUB_END) {
      this.onFinish();
      return;
    }
  }

  _handleAonoriBeat(elapsedSeconds, width, height) {
    if (this.laneNotes.length === 0) return;

    const judgmentX = width * AONORI_JUDGMENT_X_RATIO;

    // レーン上のノーツのうち、判定ラインに一番近いものを探す（太鼓の達人と同じく位置は問わず、タイミングだけ見る）
    let closest = this.laneNotes[0];
    let closestDist = Math.abs(closest.x - judgmentX);
    for (const note of this.laneNotes) {
      const d = Math.abs(note.x - judgmentX);
      if (d < closestDist) {
        closestDist = d;
        closest = note;
      }
    }

    closest.tapsReceived += 1;
    if (closest.tapsReceived < closest.requiredTaps) {
      // ダブルタップノーツの1回目：まだ確定しない（もう1回タップが必要）
      playSfx(SOUNDS.toppingTap);
      return;
    }

    const distFromZone = Math.abs(closest.x - judgmentX);
    const greatTolerance = width * AONORI_GREAT_TOLERANCE_RATIO;
    const goodTolerance = width * AONORI_GOOD_TOLERANCE_RATIO;

    let score = null;
    let label = null;
    let color = null;
    if (distFromZone <= greatTolerance) {
      score = AONORI_GREAT_SCORE;
      label = "グレイト！";
      color = "#ffd166";
    } else if (distFromZone <= goodTolerance) {
      score = AONORI_GOOD_SCORE;
      label = "グッド！";
      color = "#8bd17c";
    }

    this.laneNotes = this.laneNotes.filter((n) => n !== closest);

    const laneY = height * AONORI_LANE_Y_RATIO;
    if (score === null) {
      // タイミングが早すぎ/遅すぎ：ミス扱い。お好み焼き以外の場所に青のりが飛び散る
      this._missAonoriNote(width, height);
      this.aonoriFeedback.push({ x: judgmentX, y: laneY, text: "ミス…", color: "#e53935", age: 0 });
      playSfx(SOUNDS.gameOver);
      return;
    }

    this.aonoriScore += score;
    playSfx(label === "グレイト！" ? SOUNDS.clear : SOUNDS.toppingTap);

    // 成功：お好み焼きの上に綺麗に青のりが乗る
    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const bodyRadiusX = (width * BODY_WIDTH_RATIO) / 2;
    const bodyRadiusY = bodyRadiusX * 0.8;
    const landX = bodyCenterX + (Math.random() - 0.5) * bodyRadiusX * 1.2;
    const landY = bodyCenterY + (Math.random() - 0.5) * bodyRadiusY * 1.2;
    this._sprayAonoriFlakes(landX, landY, width);

    this.aonoriFeedback.push({ x: judgmentX, y: laneY, text: label, color, age: 0 });
  }

  // ミス時：お好み焼き以外の場所（お皿の外側あたり）に青のりが飛び散る
  _missAonoriNote(width, height) {
    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const bodyRadiusX = (width * BODY_WIDTH_RATIO) / 2;
    const side = Math.random() < 0.5 ? -1 : 1;
    const missX = bodyCenterX + side * (bodyRadiusX * 1.15 + Math.random() * width * 0.08);
    const missY = bodyCenterY + (Math.random() - 0.5) * bodyRadiusX * 1.3;
    this._sprayAonoriFlakes(missX, missY, width);
  }

  // 指定した場所を中心に、極座標を使ってランダムに青のりの粒を散らす
  _sprayAonoriFlakes(x, y, width) {
    const sprayRadius = width * 0.045; // 目安25px相当（画面幅に応じて調整）
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
      this.aonoriPlaced.push({ x: fx, y: fy, sizeX, sizeY, rotation, color });
    }
  }

  // ---- なぞり操作（ドラッグ） ----
  handlePointerDown(x, y, elapsedSeconds, width, height) {
    if (this.stage === STAGE.AONORI_PLAY) return; // あおのりはhandleTap側（位置非依存のビート判定）で処理する
    if (this.stage !== STAGE.SAUCE_TRACE && this.stage !== STAGE.MAYO_TRACE) return;
    if (this.tracing) return;
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
    this._bounceScore();
    playSfx(reachedEnd ? SOUNDS.clear : SOUNDS.toppingTap);
    this._enterStage(isMayo ? STAGE.MAYO_RESULT : STAGE.SAUCE_RESULT, elapsedSeconds);
  }

  render(ctx, width, height, elapsedSeconds) {
    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;

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
      STAGE.EXPLAIN_AONORI,
      STAGE.AONORI_PLAY,
      STAGE.AONORI_RESULT,
      STAGE.STUB_END,
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
    const mayoPersistStages = [STAGE.MAYO_RESULT, STAGE.EXPLAIN_AONORI, STAGE.AONORI_PLAY, STAGE.AONORI_RESULT, STAGE.STUB_END];
    if (mayoPersistStages.includes(this.stage) && this.tracePathHistory.length > 1) {
      this._renderMayoStroke(ctx, this.tracePathHistory);
    }

    // あおのり：着地済みの粒はどのステージでも描き続ける
    if (this.aonoriPlaced.length > 0) {
      for (const flake of this.aonoriPlaced) {
        this._renderAonoriFlakeAt(ctx, flake);
      }
    }

    if (this.stage === STAGE.EXPLAIN_SAUCE) {
      this._renderExplain(ctx, width, height, "ソースなぞりゲーム", [
        "ジグザグのルートを",
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

    if (this.stage === STAGE.EXPLAIN_AONORI) {
      this._renderExplain(ctx, width, height, "あおのりリズムゲーム", [
        "右から流れてくるあおのりが",
        "判定ラインに重なった瞬間タップ！",
        "ジャストで「グレイト」、少しずれても「グッド」",
        "2つ重なったノーツは2回タップしよう",
        `${AONORI_SESSION_DURATION}秒間、たくさんヒットさせよう`,
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
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = remaining < 1 ? "#ff8a80" : "#fff";
        ctx.fillText(remaining.toFixed(1), width / 2, height * 0.15);
        ctx.restore();
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT) {
      this._renderScorePopup(ctx, width, height, "ソース", this.lastScore);
    }
    if (this.stage === STAGE.MAYO_RESULT) {
      this._renderScorePopup(ctx, width, height, "マヨネーズ", this.lastScore);
    }

    if (this.stage === STAGE.AONORI_PLAY) {
      this._renderAonoriPlay(ctx, width, height, elapsedSeconds);
    }
    if (this.stage === STAGE.AONORI_RESULT) {
      this._renderScorePopup(ctx, width, height, "あおのり", this.lastScore);
    }

    if (this.stage === STAGE.STUB_END) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("かつおぶしは", width / 2, height * 0.7);
      ctx.fillText("じゅんび中！つづきをおたのしみに", width / 2, height * 0.75);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#ffcf5c";
      ctx.fillText("タップしてタイトルへ", width / 2, height * 0.85);
      ctx.restore();
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
    const bgG = Math.round(45 + (207 - 45) * flash);
    const bgB = Math.round(12 + (92 - 12) * flash);
    ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},0.9)`;
    ctx.beginPath();
    ctx.roundRect(scoreRightX - scoreBarW, scoreTopY, scoreBarW, scoreBarH, 14);
    ctx.fill();

    ctx.translate(scoreRightX - scoreBarW / 2, scoreTopY + scoreBarH / 2 + 10);
    ctx.scale(this.scoreBounce.scale, this.scoreBounce.scale);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText(scoreText, 0, 0);
    ctx.restore();
  }

  // マヨネーズらしい、ぷっくりとした質感の線を描く
  // （1本の統合されたパスとしてstrokeし、斜めのグラデーション＋ドロップシャドウで立体感を出す）
  _renderMayoStroke(ctx, points) {
    // 軌跡全体のバウンディングボックスを求め、斜めのグラデーションを作る
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    ctx.save();
    ctx.shadowColor = "rgba(90,45,12,0.4)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;

    const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
    gradient.addColorStop(0, "#fffdf5"); // ハイライト（光が当たる側）
    gradient.addColorStop(0.5, "#fff3d6"); // マヨネーズ本来のクリーム色
    gradient.addColorStop(1, "#e8c98a"); // 陰になる側の濃いベージュ

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // 中央に細いハイライトの線を重ねて、さらにツヤ感を出す
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // あおのりプレイ中：判定ライン・複数の落ちてくるノーツを描画
  _renderAonoriPlay(ctx, width, height, elapsedSeconds) {
    const laneY = height * AONORI_LANE_Y_RATIO;
    const judgmentX = width * AONORI_JUDGMENT_X_RATIO;
    const greatTolerance = width * AONORI_GREAT_TOLERANCE_RATIO;
    const goodTolerance = width * AONORI_GOOD_TOLERANCE_RATIO;

    // レーン本体（横線）
    ctx.save();
    ctx.strokeStyle = "rgba(90,45,12,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, laneY);
    ctx.lineTo(width, laneY);
    ctx.stroke();
    ctx.restore();

    // 判定ゾーン（グッドの範囲を薄い縦帯で、グレイトの位置に点滅する縦線で表示）
    ctx.save();
    ctx.fillStyle = "rgba(139,209,124,0.18)";
    ctx.fillRect(judgmentX - goodTolerance, laneY - height * 0.12, goodTolerance * 2, height * 0.24);
    ctx.restore();

    const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 6);
    ctx.save();
    ctx.strokeStyle = `rgba(255,209,102,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 5;
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(judgmentX, laneY - height * 0.12);
    ctx.lineTo(judgmentX, laneY + height * 0.12);
    ctx.stroke();
    ctx.restore();

    // レーンを流れるノーツ（複数同時に存在しうる、シングル/ダブルタップ）
    for (const note of this.laneNotes) {
      this._renderFallingAonoriNote(ctx, note.x, laneY, elapsedSeconds, note.requiredTaps, note.tapsReceived);

      const distFromZone = Math.abs(note.x - judgmentX);
      if (distFromZone < goodTolerance) {
        const isGreat = distFromZone <= greatTolerance;
        ctx.save();
        ctx.globalAlpha = 1 - distFromZone / goodTolerance;
        ctx.strokeStyle = isGreat ? "#ffd166" : "#4caf50";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(note.x, laneY, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 「グレイト！」「グッド！」「ミス…」の一瞬のフィードバック文字
    for (const f of this.aonoriFeedback) {
      const progress = f.age / 0.6;
      const alpha = 1 - progress;
      const riseY = f.y - progress * 40;
      ctx.save();
      ctx.globalAlpha = Math.max(alpha, 0);
      ctx.textAlign = "center";
      ctx.font = "bold 20px sans-serif";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#5a2d0c";
      ctx.strokeText(f.text, f.x, riseY);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, riseY);
      ctx.restore();
    }
  }

  // レーンを流れるノーツ本体。ダブルタップノーツは2つの円が重なった見た目にする
  _renderFallingAonoriNote(ctx, x, y, elapsedSeconds, requiredTaps, tapsReceived) {
    const size = (this._lastWidth || 400) * 0.03;

    if (requiredTaps >= 2) {
      // ダブルタップ：2つの粒を少しずらして重ねる。1回目のタップ済みなら片方だけ薄くする
      const offset = size * 0.5;
      this._renderOneAonoriNote(ctx, x - offset, y, elapsedSeconds, tapsReceived >= 1 ? 0.35 : 1);
      this._renderOneAonoriNote(ctx, x + offset, y, elapsedSeconds + 1, 1);
    } else {
      this._renderOneAonoriNote(ctx, x, y, elapsedSeconds, 1);
    }
  }

  _renderOneAonoriNote(ctx, x, y, elapsedSeconds, alpha) {
    const size = (this._lastWidth || 400) * 0.028;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(elapsedSeconds * 3);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;
    ctx.fillStyle = "#33691e";
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 青のりの粒（多色ブレンド・いびつな楕円・薄い影）を1粒描く
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

  _renderScorePopup(ctx, width, height, label, score) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#e0552b";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText(label, width / 2, height * 0.65);
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(`${score} 点`, width / 2, height * 0.74);
    ctx.restore();
  }
  
  // スコア内訳を順番に表示するシーケンスを開始
  _startScoreSequence(elapsedSeconds) {
    this.scoreSequenceItems = [
      { label: "パーフェクト", score: 100, subtext: "ひっくり返し" },
      { label: "残り時間", score: 80, subtext: "ボーナス" },
      { label: "合計", score: this.totalScore, subtext: "スコア", highlight: true },
    ];
    this.scoreSequenceIndex = 0;
    this.scoreSequenceStartedAt = elapsedSeconds;
    this._enterStage(STAGE.SCORE_SEQUENCE, elapsedSeconds);
  }
  
  // スコアシーケンスの更新
  _updateScoreSequence(elapsedSeconds) {
    const DISPLAY_DURATION = 1.5; // 各項目の表示時間（秒）
    const elapsed = elapsedSeconds - this.scoreSequenceStartedAt;
    const totalItems = this.scoreSequenceItems.length;
    const totalDuration = totalItems * DISPLAY_DURATION;
    
    if (elapsed >= totalDuration) {
      // 全て表示し終えたら終了
      this.onFinish();
    }
  }
  
  // スコアシーケンスの描画
  _renderScoreSequence(ctx, width, height, elapsedSeconds) {
    const DISPLAY_DURATION = 1.5; // 各項目の表示時間（秒）
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

  _renderExplain(ctx, width, height, title, lines) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, height * 0.15, width, height * 0.45);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 26px sans-serif";
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
