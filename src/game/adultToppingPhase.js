import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";

// ---- 調整用の定数 ----
const TRACE_TIME_LIMIT = 3.0; // 秒。なぞり切るまでの制限時間
const MAX_ACCEPTABLE_DEVIATION_RATIO = 0.12; // 本体幅に対する「これ以上ズレたら0点」の許容ズレ
const RESULT_PAUSE = 1.2; // 秒。結果表示の時間
const SCORE_BOUNCE_DURATION = 0.35;

const COOKED_BODY_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");
const PLATE_IMG = loadImage("/images/ui/plate.png");
const SAUCE_APPLIED_IMG = loadImage("/images/toppings/topping_sauce.png");

const STAGE = {
  EXPLAIN_SAUCE: "explain_sauce",
  SAUCE_TRACE: "sauce_trace",
  SAUCE_RESULT: "sauce_result",
  STUB_END: "stub_end", // マヨネーズ以降は実装中のため、いったんここで止める
};

export class AdultToppingPhase {
  /**
   * @param {object} opts
   * @param {() => void} opts.onFinish - 一連の流れが終わった時（呼び出し側でタイトル等に戻す）
   */
  constructor({ onFinish }) {
    this.onFinish = onFinish;
    this.stage = STAGE.EXPLAIN_SAUCE;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = 0;
    this.lastScore = 0;
    this.scoreBounceAt = null;

    // なぞり用の状態
    this.tracing = false;
    this.traceStartedAt = null;
    this.deviationSum = 0;
    this.deviationCount = 0;
    this.maxProgress = 0; // これまでに到達した最大の進捗（0〜1）
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
  }

  // ソースのお手本ルート（本体の中心を通る横一直線。左端〜右端）
  _getSaucePath(width, height) {
    const bodyCenterX = width / 2;
    const bodyCenterY = height * BODY_CENTER_Y_RATIO;
    const w = width * BODY_WIDTH_RATIO;
    return {
      start: { x: bodyCenterX - w * 0.32, y: bodyCenterY },
      end: { x: bodyCenterX + w * 0.32, y: bodyCenterY },
    };
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.stage === STAGE.SAUCE_TRACE && this.tracing) {
      const elapsed = elapsedSeconds - this.traceStartedAt;
      if (elapsed >= TRACE_TIME_LIMIT) {
        this._finishTrace(elapsedSeconds, false);
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT) {
      if (elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
        // 現時点ではマヨネーズ以降が未実装のため、いったんここで終了させる
        this._enterStage(STAGE.STUB_END, elapsedSeconds);
      }
    }
  }

  // ---- タップ（説明画面・結果画面などのシンプルな進行用） ----
  handleTap(elapsedSeconds) {
    if (this.stage === STAGE.EXPLAIN_SAUCE) {
      playSfx(SOUNDS.start);
      this._enterStage(STAGE.SAUCE_TRACE, elapsedSeconds);
      return;
    }
    if (this.stage === STAGE.STUB_END) {
      this.onFinish();
      return;
    }
  }

  // ---- なぞり操作（ドラッグ） ----
  handlePointerDown(x, y, elapsedSeconds, width, height) {
    if (this.stage !== STAGE.SAUCE_TRACE || this.tracing) return;
    this._lastWidth = width;
    const path = this._getSaucePath(width, height);
    const startDist = Math.hypot(x - path.start.x, y - path.start.y);
    const grabRadius = width * 0.12; // 始点からこの範囲内でつかめば「開始」とみなす
    if (startDist <= grabRadius) {
      this.tracing = true;
      this.traceStartedAt = elapsedSeconds;
      this.deviationSum = 0;
      this.deviationCount = 0;
      this.maxProgress = 0;
    }
  }

  handlePointerMove(x, y, elapsedSeconds, width, height) {
    if (this.stage !== STAGE.SAUCE_TRACE || !this.tracing) return;
    this._lastWidth = width;
    const path = this._getSaucePath(width, height);
    const { progress, deviation } = this._projectOntoPath(x, y, path);

    this.deviationSum += deviation;
    this.deviationCount += 1;
    this.maxProgress = Math.max(this.maxProgress, progress);

    if (progress >= 0.97) {
      this._finishTrace(elapsedSeconds, true);
    }
  }

  handlePointerUp(x, y, elapsedSeconds) {
    if (this.stage !== STAGE.SAUCE_TRACE || !this.tracing) return;
    // 終点まで届かないままリリースした場合も、その時点の進捗で判定する
    this._finishTrace(elapsedSeconds, false);
  }

  _projectOntoPath(x, y, path) {
    const lineX = path.end.x - path.start.x;
    const lineY = path.end.y - path.start.y;
    const lineLenSq = lineX * lineX + lineY * lineY;
    const px = x - path.start.x;
    const py = y - path.start.y;
    const rawT = (px * lineX + py * lineY) / lineLenSq;
    const t = Math.max(0, Math.min(rawT, 1));
    const closestX = path.start.x + lineX * t;
    const closestY = path.start.y + lineY * t;
    const deviation = Math.hypot(x - closestX, y - closestY);
    return { progress: t, deviation };
  }

  _finishTrace(elapsedSeconds, reachedEnd) {
    this.tracing = false;
    const avgDeviation = this.deviationCount > 0 ? this.deviationSum / this.deviationCount : 0;
    const maxAcceptable = (this._lastWidth || 400) * MAX_ACCEPTABLE_DEVIATION_RATIO;
    const deviationRatio = Math.min(avgDeviation / Math.max(maxAcceptable, 1), 1);
    const accuracyFactor = 1 - deviationRatio;

    let score;
    if (reachedEnd) {
      score = Math.round(100 * accuracyFactor);
    } else {
      // 時間切れ／途中離脱：到達した進捗分だけの部分点
      score = Math.round(100 * this.maxProgress * accuracyFactor);
    }

    this.lastScore = score;
    this.totalScore += score;
    this.scoreBounceAt = elapsedSeconds;
    playSfx(reachedEnd ? SOUNDS.clear : SOUNDS.toppingTap);
    this._enterStage(STAGE.SAUCE_RESULT, elapsedSeconds);
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
    const showSauceApplied = this.stage === STAGE.SAUCE_RESULT || this.stage === STAGE.STUB_END;
    const bodyImg = showSauceApplied && isReady(SAUCE_APPLIED_IMG) ? SAUCE_APPLIED_IMG : COOKED_BODY_IMG;
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
        "表示されるラインの通りに",
        "できるだけまっすぐなぞろう！",
        `制限時間 ${TRACE_TIME_LIMIT} 秒`,
      ]);
    }

    if (this.stage === STAGE.SAUCE_TRACE) {
      const path = this._getSaucePath(width, height);
      ctx.save();
      ctx.strokeStyle = "rgba(90,45,12,0.5)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(path.start.x, path.start.y);
      ctx.lineTo(path.end.x, path.end.y);
      ctx.stroke();
      ctx.restore();

      // 始点・終点マーク
      ctx.fillStyle = this.tracing ? "#4caf50" : "#ff8a3d";
      ctx.beginPath();
      ctx.arc(path.start.x, path.start.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e53935";
      ctx.beginPath();
      ctx.arc(path.end.x, path.end.y, 10, 0, Math.PI * 2);
      ctx.fill();

      if (!this.tracing) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 16px sans-serif";
        ctx.fillStyle = "#5a2d0c";
        ctx.fillText("オレンジの点からなぞりはじめよう", width / 2, height * 0.15);
        ctx.restore();
      } else {
        const remaining = Math.max(TRACE_TIME_LIMIT - (elapsedSeconds - this.traceStartedAt), 0);
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = remaining < 1 ? "#e53935" : "#5a2d0c";
        ctx.fillText(remaining.toFixed(1), width / 2, height * 0.15);
        ctx.restore();
      }
    }

    if (this.stage === STAGE.SAUCE_RESULT) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#e0552b";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("ソース", width / 2, height * 0.65);
      ctx.font = "bold 42px sans-serif";
      ctx.fillText(`${this.lastScore} 点`, width / 2, height * 0.74);
      ctx.restore();
    }

    if (this.stage === STAGE.STUB_END) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px sans-serif";
      ctx.fillText("マヨネーズ・あおのり・かつおぶしは", width / 2, height * 0.7);
      ctx.fillText("じゅんび中！つづきをおたのしみに", width / 2, height * 0.75);
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#ffcf5c";
      ctx.fillText("タップしてタイトルへ", width / 2, height * 0.85);
      ctx.restore();
    }

    // ---- 合計スコア（大きく、加算時にバウンド） ----
    let scoreBounceScale = 1;
    if (this.scoreBounceAt !== null) {
      const t = elapsedSeconds - this.scoreBounceAt;
      if (t < SCORE_BOUNCE_DURATION) {
        const progress = t / SCORE_BOUNCE_DURATION;
        scoreBounceScale = 1 + 0.35 * Math.sin(progress * Math.PI);
      } else {
        this.scoreBounceAt = null;
      }
    }

    ctx.save();
    const scoreText = `${this.totalScore} 点`;
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "right";
    const scoreMetrics = ctx.measureText(scoreText);
    const scoreBarW = scoreMetrics.width + 28;
    const scoreBarH = 46;
    const scoreRightX = width - 16;
    const scoreTopY = 14;
    ctx.fillStyle = "rgba(90,45,12,0.8)";
    ctx.beginPath();
    ctx.roundRect(scoreRightX - scoreBarW, scoreTopY, scoreBarW, scoreBarH, 14);
    ctx.fill();

    ctx.translate(scoreRightX - scoreBarW / 2, scoreTopY + scoreBarH / 2 + 10);
    ctx.scale(scoreBounceScale, scoreBounceScale);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText(scoreText, 0, 0);
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
