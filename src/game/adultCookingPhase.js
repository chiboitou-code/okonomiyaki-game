import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

// ---- 調整用の定数 ----
const REPEAT_COUNT = 2;
const LEVER_SPEED = 0.75;
const LEVER_SPEED_TURN2_MULTIPLIER = 1.6;
const LEVER_TIME_LIMIT = 3.0;
const POWER_TARGET_TAPS = 10;
const POWER_TIME_LIMIT = 3.0;
const LEVER_FREEZE_DURATION = 0.8; // 秒。タップ後、メーターが止まった位置を見せておく時間
const LEVER_TRANSITION_DURATION = 0.6; // 秒。テコ画像（へら）を見せる、ひっくり返す演出
const RESULT_PAUSE = 0.9; // 秒。各メーターのスコアを表示しておく時間

const STEAM_IMG = loadImage("/images/ui/steam_puff.png");
const SPATULA_IMG = loadImage("/images/ui/spatula.png"); // シンプルモードと共通のへら画像
const BODY_RAW_IMG = loadImage("/images/okonomiyaki/body_00_raw.png");
const BODY_FINAL_IMG = loadImage("/images/okonomiyaki/body_04_porkside.png");

const STAGE = {
  EXPLAIN: "explain",
  LEVER: "lever",
  LEVER_FREEZE: "lever_freeze",
  LEVER_RESULT: "lever_result",
  LEVER_TRANSITION: "lever_transition",
  POWER: "power",
  POWER_RESULT: "power_result",
  FINISHED: "finished",
};

export class AdultCookingPhase {
  /**
   * @param {object} opts
   * @param {(totalScore: number) => void} opts.onComplete - 全工程終了時（合計スコアを渡す）
   */
  /**
   * @param {object} opts
   * @param {(totalScore: number) => void} opts.onComplete - 全工程終了時（合計スコアを渡す）
   * @param {boolean} [opts.debugSingleCycle] - デバッグ用：1セットだけで終わらせる
   */
  constructor({ onComplete, debugSingleCycle = false }) {
    this.onComplete = onComplete;
    this.repeatCount = debugSingleCycle ? 1 : REPEAT_COUNT;
    this.cycleIndex = 0;
    this.stage = STAGE.EXPLAIN;
    this.stageEnteredAt = performance.now() / 1000;

    this.totalScore = 0;
    this.lastLeverScore = 0;
    this.lastPowerScore = 0;
    this.scoreBounce = { scale: 1, flash: 0 };
    this.bodyBounce = { scale: 1, rotation: 0 };
    this.powerPulse = { scale: 1 };
    this._powerPulseTween = null;
    this.spatulaSpin = { rotation: 0 };

    this.leverPosition = 0;
    this.leverDirection = 1;
    this.leverStartedAt = null;

    this.powerTapCount = 0;
    this.powerStartedAt = null;

    this.steamParticles = [];
    this._lastSteamSpawn = 0;
  }

  _bounceScore() {
    gsap.killTweensOf(this.scoreBounce);
    gsap.timeline()
      .to(this.scoreBounce, { scale: 1.7, flash: 1, duration: 0.12, ease: "back.out(3)" })
      .to(this.scoreBounce, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.25)" }, "<")
      .to(this.scoreBounce, { flash: 0, duration: 0.4, ease: "power1.out" }, "<0.1");
  }

  _bounceBody() {
    gsap.killTweensOf(this.bodyBounce);
    gsap.timeline()
      .to(this.bodyBounce, { scale: 1.25, rotation: 8, duration: 0.15, ease: "back.out(2)" })
      .to(this.bodyBounce, { scale: 1, rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
  }

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

  _currentLeverSpeed() {
    return this.cycleIndex >= 1 ? LEVER_SPEED * LEVER_SPEED_TURN2_MULTIPLIER : LEVER_SPEED;
  }

  _enterStage(stage, elapsedSeconds) {
    this.stage = stage;
    this.stageEnteredAt = elapsedSeconds;
    if (stage === STAGE.LEVER) {
      this.leverStartedAt = elapsedSeconds;
    }
    if (stage === STAGE.LEVER_TRANSITION) {
      gsap.fromTo(this.spatulaSpin, { rotation: 0 }, { rotation: 200, duration: LEVER_TRANSITION_DURATION, ease: "power2.out" });
    }
    if (stage === STAGE.POWER) {
      this.powerTapCount = 0;
      this.powerStartedAt = elapsedSeconds;
      this._startPowerPulse();
    } else {
      this._stopPowerPulse();
    }
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

  _finalizeLever(elapsedSeconds, remaining) {
    const distance = Math.abs(this.leverPosition - 0.5) * 2;
    const accuracyFactor = 1 - distance;
    const precisionScore = Math.round(70 * accuracyFactor);
    const timeBonus = Math.round(30 * (remaining / LEVER_TIME_LIMIT));
    this.lastLeverScore = Math.min(precisionScore + timeBonus, 100);
    this.totalScore += this.lastLeverScore;
    this._bounceScore();
    playSfx(SOUNDS.flip);
    // すぐに結果を出さず、まずメーターが止まった位置を見せる
    this._enterStage(STAGE.LEVER_FREEZE, elapsedSeconds);
  }

  update(deltaSeconds, elapsedSeconds) {
    this._updateSteam(deltaSeconds, elapsedSeconds);

    if (this.stage === STAGE.LEVER) {
      const speed = this._currentLeverSpeed();
      this.leverPosition += this.leverDirection * speed * deltaSeconds;
      if (this.leverPosition >= 1) {
        this.leverPosition = 1;
        this.leverDirection = -1;
      } else if (this.leverPosition <= 0) {
        this.leverPosition = 0;
        this.leverDirection = 1;
      }

      const remaining = LEVER_TIME_LIMIT - (elapsedSeconds - this.leverStartedAt);
      if (remaining <= 0) {
        this._finalizeLever(elapsedSeconds, 0);
      }
    }

    if (this.stage === STAGE.LEVER_FREEZE) {
      if (elapsedSeconds - this.stageEnteredAt >= LEVER_FREEZE_DURATION) {
        this._enterStage(STAGE.LEVER_RESULT, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.LEVER_RESULT) {
      if (elapsedSeconds - this.stageEnteredAt >= RESULT_PAUSE) {
        this._enterStage(STAGE.LEVER_TRANSITION, elapsedSeconds);
      }
    }

    if (this.stage === STAGE.LEVER_TRANSITION) {
      if (elapsedSeconds - this.stageEnteredAt >= LEVER_TRANSITION_DURATION) {
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
        if (this.cycleIndex >= this.repeatCount) {
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
      const remaining = Math.max(LEVER_TIME_LIMIT - (elapsedSeconds - this.leverStartedAt), 0);
      this._finalizeLever(elapsedSeconds, remaining);
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
      this._renderExplain(ctx, width, height, elapsedSeconds);
      return;
    }

    // ---- 本体 ----
    const bodyImg = this.cycleIndex >= 1 ? BODY_FINAL_IMG : BODY_RAW_IMG;
    let bodyH = bodyW;
    if (isReady(bodyImg)) {
      bodyH = bodyW * (bodyImg.naturalHeight / bodyImg.naturalWidth);
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((this.bodyBounce.rotation * Math.PI) / 180);
      ctx.scale(this.bodyBounce.scale, this.bodyBounce.scale);
      ctx.drawImage(bodyImg, -bodyW / 2, -bodyH / 2, bodyW, bodyH);
      ctx.restore();
    }

    // ---- 湯気 ----
    const bodyRadiusX = bodyW / 2;
    const bodyRadiusY = bodyH / 2;
    for (const p of this.steamParticles) {
      const sx = centerX + p.offsetX * bodyRadiusX * 2;
      const sy = centerY - bodyRadiusY * 0.6 - p.y;
      const alpha = Math.max(p.alpha, 0);
      if (isReady(STEAM_IMG)) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const size = 40 * p.scale;
        ctx.drawImage(STEAM_IMG, sx - size / 2, sy - size / 2, size, size);
        ctx.restore();
      } else {
        const radius = 24 * p.scale;
        const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${0.55 * alpha})`);
        gradient.addColorStop(0.6, `rgba(255,255,255,${0.25 * alpha})`);
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- 見出し（何セット目か） ----
    ctx.save();
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    const headingText = `${this.cycleIndex + 1} / ${this.repeatCount} セット目`;
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
      this._renderLeverMeter(ctx, width, height, elapsedSeconds, { frozen: false });
    }
    if (this.stage === STAGE.LEVER_FREEZE) {
      this._renderLeverMeter(ctx, width, height, elapsedSeconds, { frozen: true });
    }
    if (this.stage === STAGE.LEVER_RESULT) {
      this._renderScorePopup(ctx, width, height, "テコメーター", this.lastLeverScore);
    }
    if (this.stage === STAGE.LEVER_TRANSITION) {
      this._renderSpatulaTransition(ctx, width, height);
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

  _renderExplain(ctx, width, height, elapsedSeconds) {
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
      `制限時間${LEVER_TIME_LIMIT}秒、中央に近く・早いほど高得点`,
      "そのあとパワーメーター：",
      `制限時間内に${POWER_TARGET_TAPS}回連打しよう！`,
      `これを${this.repeatCount}セットくり返します（2セット目は速くなる）`,
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height * 0.42 + i * 28);
    });

    const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = "#e0552b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("タップしてはじめる", width / 2, height * 0.42 + lines.length * 28 + 30);
    ctx.restore();
  }

  _renderLeverMeter(ctx, width, height, elapsedSeconds, { frozen }) {
    // 上部に大きく「真ん中をねらえ！」
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 30px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText("真ん中をねらえ！", width / 2, height * 0.2);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText("真ん中をねらえ！", width / 2, height * 0.2);
    ctx.restore();

    // 残り時間：見出しのすぐ下に大きく表示（フリーズ中は表示しない）
    if (!frozen) {
      const remaining = Math.max(LEVER_TIME_LIMIT - (elapsedSeconds - this.leverStartedAt), 0);
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 46px sans-serif";
      ctx.fillStyle = remaining < 1 ? "#e53935" : "#fff";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#5a2d0c";
      ctx.strokeText(remaining.toFixed(1), width / 2, height * 0.34);
      ctx.fillText(remaining.toFixed(1), width / 2, height * 0.34);
      ctx.restore();
    }

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

    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gaugeX + gaugeWidth / 2, gaugeY - 4);
    ctx.lineTo(gaugeX + gaugeWidth / 2, gaugeY + gaugeHeight + 4);
    ctx.stroke();
    ctx.restore();

    const needleX = gaugeX + this.leverPosition * gaugeWidth;
    ctx.fillStyle = frozen ? "#4caf50" : "#333";
    ctx.fillRect(needleX - 4, gaugeY - 8, 8, gaugeHeight + 16);

    // 「ここを狙え！」：ゲージの下に配置
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffcf5c";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#5a2d0c";
    const labelY = gaugeY + gaugeHeight + 34;
    ctx.beginPath();
    ctx.moveTo(gaugeX + gaugeWidth / 2, gaugeY + gaugeHeight + 8);
    ctx.lineTo(gaugeX + gaugeWidth / 2 - 6, gaugeY + gaugeHeight + 16);
    ctx.lineTo(gaugeX + gaugeWidth / 2 + 6, gaugeY + gaugeHeight + 16);
    ctx.closePath();
    ctx.fillStyle = "#ffcf5c";
    ctx.fill();
    ctx.strokeText("ここを狙え！", gaugeX + gaugeWidth / 2, labelY);
    ctx.fillText("ここを狙え！", gaugeX + gaugeWidth / 2, labelY);
    ctx.restore();

    if (frozen) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText("ここで止まった！", width / 2, gaugeY - 16);
      ctx.restore();
    }
  }

  _renderSpatulaTransition(ctx, width, height) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    if (isReady(SPATULA_IMG)) {
      const w = width * 0.6;
      const h = w * (SPATULA_IMG.naturalHeight / SPATULA_IMG.naturalWidth);
      ctx.save();
      ctx.translate(width / 2, height * 0.45);
      ctx.rotate((this.spatulaSpin.rotation * Math.PI) / 180);
      ctx.drawImage(SPATULA_IMG, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText("ひっくり返す！", width / 2, height * 0.7);
    ctx.restore();
  }

  _renderPowerMeter(ctx, width, height, elapsedSeconds) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 30px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText("パワーをためてひっくり返せ！", width / 2, height * 0.2);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText("パワーをためてひっくり返せ！", width / 2, height * 0.2);
    ctx.restore();

    // 残り時間：ゲージ（テコメーター）フェーズと同じ位置・見た目に統一
    const remaining = Math.max(POWER_TIME_LIMIT - (elapsedSeconds - this.powerStartedAt), 0);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 46px sans-serif";
    ctx.fillStyle = remaining < 1 ? "#e53935" : "#fff";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText(remaining.toFixed(1), width / 2, height * 0.34);
    ctx.fillText(remaining.toFixed(1), width / 2, height * 0.34);
    ctx.restore();

    ctx.save();
    ctx.translate(width / 2, height * 0.5);
    ctx.scale(this.powerPulse.scale, this.powerPulse.scale);
    ctx.textAlign = "center";
    ctx.font = "bold 44px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#5a2d0c";
    ctx.strokeText("連打して！！", 0, 0);
    ctx.fillStyle = "#ff8a3d";
    ctx.fillText("連打して！！", 0, 0);
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
