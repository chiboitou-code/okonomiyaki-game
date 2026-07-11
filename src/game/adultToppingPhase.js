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

const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");
const SAUCE_APPLIED_IMG = loadImage("/images/toppings/topping_sauce.png");
const MAYO_APPLIED_IMG = loadImage("/images/toppings/topping_mayo.png");

const STAGE = {
  EXPLAIN_SAUCE: "explain_sauce",
  SAUCE_TRACE: "sauce_trace",
  SAUCE_RESULT: "sauce_result",
  EXPLAIN_MAYO: "explain_mayo",
  MAYO_TRACE: "mayo_trace",
  MAYO_RESULT: "mayo_result",
  STUB_END: "stub_end", // あおのり・かつおぶしは実装中のため、いったんここで止める
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
  constructor({ onFinish, initialScore = 0 }) {
    this.onFinish = onFinish;
    this.stage = STAGE.EXPLAIN_SAUCE;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = initialScore;
    this.lastScore = 0;
    this.scoreBounce = { scale: 1, flash: 0 }; // GSAPで動かす値。render側はこれをそのまま読むだけ

    // なぞり用の状態
    this.tracing = false;
    this.traceStartedAt = null;
    this.deviationSum = 0;
    this.deviationCount = 0;
    this.maxProgress = 0; // これまでに到達した最大の進捗（0〜1）
    this.currentPathPoints = null;
    this._lastWidth = 400;
    this.tracePathHistory = []; // なぞった軌跡（光る帯の描画用）
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
    const frequency = 8; // カーブの数（4.5→8にさらに増加）
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

  update(deltaSeconds, elapsedSeconds) {
    if ((this.stage === STAGE.SAUCE_TRACE || this.stage === STAGE.MAYO_TRACE) && this.tracing) {
      const limit = this.stage === STAGE.SAUCE_TRACE ? SAUCE_TIME_LIMIT : MAYO_TIME_LIMIT;
      const elapsed = elapsedSeconds - this.traceStartedAt;
      if (elapsed >= limit) {
        this._finishTrace(elapsedSeconds, false);
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      this._enterStage(STAGE.EXPLAIN_MAYO, elapsedSeconds);
    }

    if (this.stage === STAGE.MAYO_RESULT && elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
      // 現時点ではあおのり・かつおぶしが未実装のため、いったんここで終了させる
      this._enterStage(STAGE.STUB_END, elapsedSeconds);
    }
  }

  // ---- タップ（説明画面・結果画面などのシンプルな進行用） ----
  handleTap(elapsedSeconds) {
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
    if (this.stage === STAGE.STUB_END) {
      this.onFinish();
      return;
    }
  }

  // ---- なぞり操作（ドラッグ） ----
  handlePointerDown(x, y, elapsedSeconds, width, height) {
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
    if (this.stage === STAGE.MAYO_TRACE || this.stage === STAGE.MAYO_RESULT || this.stage === STAGE.STUB_END) {
      if (isReady(MAYO_APPLIED_IMG)) bodyImg = MAYO_APPLIED_IMG;
    } else if (this.stage === STAGE.SAUCE_RESULT || this.stage === STAGE.EXPLAIN_MAYO) {
      if (isReady(SAUCE_APPLIED_IMG)) bodyImg = SAUCE_APPLIED_IMG;
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

    if (this.stage === STAGE.SAUCE_TRACE || this.stage === STAGE.MAYO_TRACE) {
      const points = this.stage === STAGE.SAUCE_TRACE ? this._getSaucePathPoints(width, height) : this._getMayoPathPoints(width, height);
      const limit = this.stage === STAGE.SAUCE_TRACE ? SAUCE_TIME_LIMIT : MAYO_TIME_LIMIT;

      // 画面全体を暗転させて、ルート・軌跡だけがくっきり見えるようにする
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.68)";
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

      // なぞった軌跡（光る帯）
      if (this.tracePathHistory.length > 1) {
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

    if (this.stage === STAGE.STUB_END) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("あおのり・かつおぶしは", width / 2, height * 0.7);
      ctx.fillText("じゅんび中！つづきをおたのしみに", width / 2, height * 0.75);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#ffcf5c";
      ctx.fillText("タップしてタイトルへ", width / 2, height * 0.85);
      ctx.restore();
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
    const scoreTopY = 14;
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
