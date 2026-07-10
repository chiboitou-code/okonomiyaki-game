import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

// ---- 調整用の定数（ここを変えるだけでバランス調整できる） ----
const REPEAT_COUNT = 2; // テコメーター→パワーメーターを繰り返す回数（後で4に増やす想定）
const LEVER_SPEED = 0.75; // テコメーターの針の速さ（大きいほど速い＝難しい）
const POWER_TARGET_TAPS = 10; // パワーメーターのノルマ（タップ回数）
const POWER_TIME_LIMIT = 3.0; // 秒。パワーメーターの制限時間
const RESULT_PAUSE = 0.9; // 秒。各メーターのスコアを表示しておく時間

// 本体画像：開始前は1枚目(生)。1セット終わるたびに、ひっくり返って4枚目(完成)に変わる
const BODY_RAW_IMG = loadImage("/images/okonomiyaki/body_00_raw.png");
const BODY_FINAL_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");

const STAGE = {
  EXPLAIN: "explain",
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
    this.stage = STAGE.EXPLAIN;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = 0;
    this.lastLeverScore = 0;
    this.lastPowerScore = 0;
    this.scoreBounce = { scale: 1, flash: 0 };
    this.bodyBounce = { scale: 1, rotation: 0 };
    this.powerPulse = { scale: 1 }; // パワーメーター中の連打演出（ズームイン/アウト）を継続させる用
    this._powerPulseTween = null;

    // テコメーター用
    this.leverPosition = 0;
    this.leverDirection = 1;

    // パワーメーター用
    this.powerTapCount = 0;
    this.powerStartedAt = null;
  }

  // 点数が入った時に、GSAPで弾力のあるバウンド＋色フラッシュをさせる
  _bounceScore() {
    gsap.killTweensOf(this.scoreBounce);
    gsap.timeline()
      .to(this.scoreBounce, { scale: 1.7, flash: 1, duration: 0.12, ease: "back.out(3)" })
      .to(this.scoreBounce, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.25)" }, "<")
      .to(this.scoreBounce, { flash: 0, duration: 0.4, ease: "power1.out" }, "<0.1");
  }

  // 1セット（テコ＋パワー）終わるたびに、本体がひっくり返ったようにバウンド＋少し回転させる
  _bounceBody() {
    gsap.killTweensOf(this.bodyBounce);
    gsap.timeline()
      .to(this.bodyBounce, { scale: 1.25, rotation: 8, duration: 0.15, ease: "back.out(2)" })
      .to(this.bodyBounce, { scale: 1, rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
  }

  // パワーメーター中、連打を直感的に誘うズームイン/アウトを繰り返す
  _startPowerPulse() {
    this._powerPulseTween = gsap.to(this.powerPulse, {
      scale: 1.15,
      duration: 0.35,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  _stopPowerPulse() {
    if (this._powerPulseTween) {
      this._powerPulseTween.kill();
      this._powerPulseTween = null;
    }
    this.powerPulse.scale = 1;
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
    if (stage === STAGE.POWER) {
      this.powerTapCount = 0;
      this.powerStartedAt = elapsedSeconds;
      this._startPowerPulse();
    } else {
      this._stopPowerPulse();
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
        this.lastPowerScore = Math.round((this.powerTapCount / POWER_TARGET_TAPS) * 70);
        this.totalScore += this.lastPowerScore;
        this._bounceScore();
        this._bounceBody();
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
    if (this.stage === STAGE.EXPLAIN) {
      playSfx(SOUNDS.start);
      this._enterStage(STAGE.LEVER, elapsedSeconds);
      return;
    }

    if (this.stage === STAGE.LEVER) {
      const distance = Math.abs(this.leverPosition - 0.5) * 2;
      this.lastLeverScore = Math.round(100 * (1 - distance));
      this.totalScore += this.lastLeverScore;
      this._bounceScore();
      playSfx(SOUNDS.flip);
      this._enterStage(STAGE.LEVER_RESULT, elapsedSeconds);
      return;
    }

    if (this.stage === STAGE.POWER) {
      this.powerTapCount += 1;
      playSfx(SOUNDS.toppingTap);
      if (this.powerTapCount >= POWER_TARGET_TAPS) {
        const remaining = Math.max(POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt), 0);
        this.lastPowerScore = Math.min(70 + Math.round((remaining / POWER_TIME_LIMIT) * 30), 100);
        this.totalScore += this.lastPowerScore;
        this._bounceScore();
        this._bounceBody();
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

    if (this.stage === STAGE.EXPLAIN) {
      this._renderExplain(ctx, width, height);
      return;
    }

    // ---- 本体（1セット終わるたびにひっくり返って完成画像に変わる） ----
    const bodyImg = this.cycleIndex >= 1 ? BODY_FINAL_IMG : BODY_RAW_IMG;
    if (isReady(bodyImg)) {
      const bodyH = bodyW * (bodyImg.naturalHeight / bodyImg.naturalWidth);
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((this.bodyBounce.rotation * Math.PI) / 180);
      ctx.scale(this.bodyBounce.scale, this.bodyBounce.scale);
      ctx.drawImage(bodyImg, -bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.restore();
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

    if (this.stage === STAGE.LEVER) {
      this._renderLeverMeter(ctx, width, height);
    }
    if (this.stage === STAGE.LEVER_RESULT) {
      this._renderScorePopup(ctx, width, height, "テコメーター", this.lastLeverScore);
    }
    if (this.stage === STAGE.POWER) {
      this._renderPowerMeter(ctx, width, height, elapsedSeconds);
    }
    if (this.stage === STAGE.POWER_RESULT) {
      this._renderScorePopup(ctx, width, height, "パワーメーター", this.lastPowerScore);
    }

    // ---- 合計スコア ----
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

    if (this.stage === STAGE.FINISHED) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 30px sans-serif";
      ctx.fillStyle = "#e0552b";
      ctx.fillText(`さいしゅうスコア：${this.totalScore}点`, width / 2, height * 0.75);
      ctx.restore();
    }
  }

  _renderExplain(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("スコアモード", width / 2, height * 0.32);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px sans-serif";
    const lines = [
      "テコメーター：ジャストのタイミングでタップ！",
      "中央に近いほど高得点",
      "そのあとパワーメーター：",
      `制限時間内に${POWER_TARGET_TAPS}回連打しよう！`,
      `これを${REPEAT_COUNT}セットくり返します`,
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height * 0.44 + i * 30);
    });

    const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsedSecondsNow() * Math.PI * 2 / 1.4));
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = "#e0552b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("タップしてはじめる", width / 2, height * 0.44 + lines.length * 30 + 30);
    ctx.restore();
  }

  _renderLeverMeter(ctx, width, height) {
    // 見出し：背景に帯を敷いて見やすく
    ctx.save();
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    const headingText = "テコメーター：ジャストでタップ！";
    const metrics = ctx.measureText(headingText);
    const barW = metrics.width + 28;
    ctx.fillStyle = "rgba(90,45,12,0.75)";
    ctx.beginPath();
    ctx.roundRect(width / 2 - barW / 2, height * 0.68, barW, 38, 18);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(headingText, width / 2, height * 0.68 + 26);
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

    // 「ここを狙え！」の案内（中央マークの上に矢印付きで表示）
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffcf5c";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText("ここを狙え！", gaugeX + gaugeWidth / 2, gaugeY - 14);
    ctx.fillText("ここを狙え！", gaugeX + gaugeWidth / 2, gaugeY - 14);
    ctx.beginPath();
    ctx.moveTo(gaugeX + gaugeWidth / 2, gaugeY - 10);
    ctx.lineTo(gaugeX + gaugeWidth / 2 - 6, gaugeY - 18);
    ctx.lineTo(gaugeX + gaugeWidth / 2 + 6, gaugeY - 18);
    ctx.closePath();
    ctx.fillStyle = "#ffcf5c";
    ctx.fill();
    ctx.restore();

    const needleX = gaugeX + this.leverPosition * gaugeWidth;
    ctx.fillStyle = "#333";
    ctx.fillRect(needleX - 3, gaugeY - 6, 6, gaugeHeight + 12);
  }

  _renderPowerMeter(ctx, width, height, elapsedSeconds) {
    // 「連打して！！」：大きく、ズームイン/アウトを繰り返して直感的に誘う
    ctx.save();
    ctx.translate(width / 2, height * 0.6);
    ctx.scale(this.powerPulse.scale, this.powerPulse.scale);
    ctx.textAlign = "center";
    ctx.font = "bold 44px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText("連打して！！", 0, 0);
    ctx.fillStyle = "#ff8a3d";
    ctx.fillText("連打して！！", 0, 0);
    ctx.restore();

    const remaining = Math.max(POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt), 0);

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = remaining < 1 ? "#e53935" : "#5a2d0c";
    ctx.fillText(remaining.toFixed(2), width / 2, height * 0.72);
    ctx.restore();

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

function elapsedSecondsNow() {
  return performance.now() / 1000;
}
