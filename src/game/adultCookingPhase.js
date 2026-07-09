import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";

// ---- 調整用の定数（ここを変えるだけでバランス調整できる） ----
const REPEAT_COUNT = 2; // テコメーター→パワーメーターを繰り返す回数（後で4に増やす想定）
const LEVER_SPEED = 0.75; // テコメーターの針の速さ（大きいほど速い＝難しい）
const POWER_TARGET_TAPS = 10; // パワーメーターのノルマ（タップ回数）
const POWER_TIME_LIMIT = 3.0; // 秒。パワーメーターの制限時間
const RESULT_PAUSE = 0.9; // 秒。各メーターのスコアを表示しておく時間
const SCORE_BOUNCE_DURATION = 0.35; // 秒。スコア加算時のバウンド演出の長さ

// 本体画像：ユーザー指定の通り、開始前は1枚目(生)、全工程完了後は4枚目(完成)を使う
const BODY_RAW_IMG = loadImage("/images/okonomiyaki/body_00_raw.png");
const BODY_FINAL_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");

const STAGE = {
  LEVER: "lever",
  LEVER_RESULT: "lever_result",
  POWER: "power",
  POWER_RESULT: "power_result",
  FINISHED: "finished",
};

export class AdultCookingPhase {
  /**
   * @param {object} opts
   * @param {(totalScore: number) => void} opts.onComplete - 全工程終了時（合計スコアを渡す）
   */
  constructor({ onComplete }) {
    this.onComplete = onComplete;
    this.cycleIndex = 0; // 何セット目か（0〜REPEAT_COUNT-1）
    this.stage = STAGE.LEVER;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = 0;
    this.lastLeverScore = 0;
    this.lastPowerScore = 0;
    this.scoreBounceAt = null; // スコアが加算された瞬間の時刻（バウンド演出用）

    // テコメーター用
    this.leverPosition = 0;
    this.leverDirection = 1;

    // パワーメーター用
    this.powerTapCount = 0;
    this.powerStartedAt = null;
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
    if (stage === STAGE.POWER) {
      this.powerTapCount = 0;
      this.powerStartedAt = elapsedSeconds;
    }
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.stage === STAGE.LEVER) {
      this.leverPosition += this.leverDirection * LEVER_SPEED * deltaSeconds;
      if (this.leverPosition >= 1) {
        this.leverPosition = 1;
        this.leverDirection = -1;
      } else if (this.leverPosition <= 0) {
        this.leverPosition = 0;
        this.leverDirection = 1;
      }
    }

    if (this.stage === STAGE.LEVER_RESULT) {
      if (elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
        this._enterStage(STAGE.POWER, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.POWER) {
      const remaining = POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt);
      if (remaining <= 0 && this.powerTapCount < POWER_TARGET_TAPS) {
        // 時間切れ：ノルマ未達の分だけ、部分点として確定させる
        this.lastPowerScore = Math.round((this.powerTapCount / POWER_TARGET_TAPS) * 70);
        this.totalScore += this.lastPowerScore;
        this.scoreBounceAt = elapsedSeconds;
        this._enterStage(STAGE.POWER_RESULT, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.POWER_RESULT) {
      if (elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
        this.cycleIndex += 1;
        if (this.cycleIndex >= REPEAT_COUNT) {
          this._enterStage(STAGE.FINISHED, elapsedSeconds);
          this.onComplete(this.totalScore);
        } else {
          this.leverPosition = 0;
          this.leverDirection = 1;
          this._enterStage(STAGE.LEVER, elapsedSeconds);
        }
      }
    }
  }

  handleTap(elapsedSeconds) {
    if (this.stage === STAGE.LEVER) {
      // 中央(0.5)に近いほど高得点。0.5から最大0.5離れているのを0〜100点に変換する
      const distance = Math.abs(this.leverPosition - 0.5) * 2; // 0(中央)〜1(端)
      this.lastLeverScore = Math.round(100 * (1 - distance));
      this.totalScore += this.lastLeverScore;
      this.scoreBounceAt = elapsedSeconds;
      playSfx(SOUNDS.flip);
      this._enterStage(STAGE.LEVER_RESULT, elapsedSeconds);
      return;
    }

    if (this.stage === STAGE.POWER) {
      this.powerTapCount += 1;
      playSfx(SOUNDS.toppingTap);
      if (this.powerTapCount >= POWER_TARGET_TAPS) {
        const remaining = Math.max(POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt), 0);
        // ノルマ達成：基礎点70 + 残り時間ボーナス（最大+30）
        this.lastPowerScore = Math.min(70 + Math.round((remaining / POWER_TIME_LIMIT) * 30), 100);
        this.totalScore += this.lastPowerScore;
        this.scoreBounceAt = elapsedSeconds;
        playSfx(SOUNDS.clear);
        this._enterStage(STAGE.POWER_RESULT, elapsedSeconds);
      }
      return;
    }
  }

  render(ctx, width, height, elapsedSeconds) {
    const centerX = width / 2;
    const centerY = height * BODY_CENTER_Y_RATIO;
    const bodyW = width * BODY_WIDTH_RATIO;

    // ---- 本体（開始前は生地、全工程完了後は完成画像） ----
    const bodyImg = this.stage === STAGE.FINISHED ? BODY_FINAL_IMG : BODY_RAW_IMG;
    if (isReady(bodyImg)) {
      const bodyH = bodyW * (bodyImg.naturalHeight / bodyImg.naturalWidth);
      ctx.drawImage(bodyImg, centerX - bodyW / 2, centerY - bodyH / 2, bodyW, bodyH);
    }

    // ---- 見出し（何セット目か） ----
    ctx.save();
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    const headingText = `${this.cycleIndex + 1} / ${REPEAT_COUNT} セット目`;
    const metrics = ctx.measureText(headingText);
    const barW = metrics.width + 32;
    ctx.fillStyle = "rgba(90,45,12,0.75)";
    ctx.beginPath();
    ctx.roundRect(centerX - barW / 2, height * 0.1 - 28, barW, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(headingText, centerX, height * 0.1);
    ctx.restore();

    // ---- テコメーター ----
    if (this.stage === STAGE.LEVER) {
      this._renderLeverMeter(ctx, width, height);
    }
    if (this.stage === STAGE.LEVER_RESULT) {
      this._renderScorePopup(ctx, width, height, "テコメーター", this.lastLeverScore);
    }

    // ---- パワーメーター ----
    if (this.stage === STAGE.POWER) {
      this._renderPowerMeter(ctx, width, height, elapsedSeconds);
    }
    if (this.stage === STAGE.POWER_RESULT) {
      this._renderScorePopup(ctx, width, height, "パワーメーター", this.lastPowerScore);
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

    if (this.stage === STAGE.FINISHED) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 30px sans-serif";
      ctx.fillStyle = "#e0552b";
      ctx.fillText(`さいしゅうスコア：${this.totalScore}点`, width / 2, height * 0.75);
      ctx.restore();
    }
  }

  _renderLeverMeter(ctx, width, height) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#5a2d0c";
    ctx.fillText("テコメーター：ジャストでタップ！", width / 2, height * 0.72);
    ctx.restore();

    const gaugeY = height * 0.78;
    const gaugeWidth = width * 0.7;
    const gaugeX = (width - gaugeWidth) / 2;
    const gaugeHeight = 20;

    const gradient = ctx.createLinearGradient(gaugeX, 0, gaugeX + gaugeWidth, 0);
    gradient.addColorStop(0, "#e53935");
    gradient.addColorStop(0.5, "#ffd166");
    gradient.addColorStop(1, "#e53935");
    ctx.fillStyle = gradient;
    ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    // 中央の的マーク
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gaugeX + gaugeWidth / 2, gaugeY - 4);
    ctx.lineTo(gaugeX + gaugeWidth / 2, gaugeY + gaugeHeight + 4);
    ctx.stroke();
    ctx.restore();

    const needleX = gaugeX + this.leverPosition * gaugeWidth;
    ctx.fillStyle = "#333";
    ctx.fillRect(needleX - 3, gaugeY - 6, 6, gaugeHeight + 12);
  }

  _renderPowerMeter(ctx, width, height, elapsedSeconds) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#5a2d0c";
    ctx.fillText("パワーメーター：れんだ！", width / 2, height * 0.65);
    ctx.restore();

    const remaining = Math.max(POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt), 0);

    // 残り時間（大きく表示）
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = remaining < 1 ? "#e53935" : "#5a2d0c";
    ctx.fillText(remaining.toFixed(2), width / 2, height * 0.72);
    ctx.restore();

    // タップ回数の進捗バー
    const barY = height * 0.78;
    const barWidth = width * 0.7;
    const barX = (width - barWidth) / 2;
    const barHeight = 24;

    ctx.fillStyle = "#eee";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    const fillRatio = Math.min(this.powerTapCount / POWER_TARGET_TAPS, 1);
    ctx.fillStyle = "#ff8a3d";
    ctx.fillRect(barX, barY, barWidth * fillRatio, barHeight);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#333";
    ctx.fillText(`${this.powerTapCount} / ${POWER_TARGET_TAPS} 回`, width / 2, barY + barHeight + 22);
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
}
