import { TimingGauge } from "./gauge.js";
import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";

const TOTAL_FLIPS = 4;
const BODY_BOUNCE_DURATION = 0.4; // 秒。バウンド演出の長さ

// ---- 画像パス設定 ----
const SPATULA_IMG = loadImage("/images/ui/spatula.png");
const STEAM_IMG = loadImage("/images/ui/steam_puff.png");
const STAR_IMG = loadImage("/images/ui/star_effect.png");
const NEEDLE_IMG = loadImage("/images/ui/gauge_needle.png");
const FAIL_IMG = loadImage("/images/okonomiyaki/body_fail.png");

const BODY_IMAGES = [
  loadImage("/images/okonomiyaki/body_00_raw.png"),
  loadImage("/images/okonomiyaki/body_01_backside.png"),
  loadImage("/images/okonomiyaki/body_02_porkside.png"),
  loadImage("/images/okonomiyaki/body_03_backside.png"),
  loadImage("/images/okonomiyaki/body_04_porkside.png"),
];

export class CookingPhase {
  constructor({ onComplete, onFail }) {
    this.onComplete = onComplete;
    this.onFail = onFail;
    this.flipIndex = 0;
    this.results = [];
    this.gauge = new TimingGauge({ speed: 0.55, zoneWidth: 0.35 });
    this.lastJudgeLabel = null;
    this.judgeShownAt = 0;
    this.finished = false;
    this.awaitingRetry = false;
    this.bodyBounceAt = null; // バウンド演出の開始時刻（無い間はnull）

    this.steamParticles = [];
    this._lastSteamSpawn = 0;
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.awaitingRetry) return;

    this._updateSteam(deltaSeconds, elapsedSeconds);

    if (this.finished) return;

    if (this.lastJudgeLabel === "success" && elapsedSeconds - this.judgeShownAt < 0.6) {
      return;
    }

    if (this.lastJudgeLabel === "success" && elapsedSeconds - this.judgeShownAt >= 0.6) {
      this.lastJudgeLabel = null;
      this.flipIndex += 1;
      if (this.flipIndex >= TOTAL_FLIPS) {
        this.finished = true;
        this.onComplete(this.results);
        return;
      }
      this.gauge = new TimingGauge({ speed: 0.55 + this.flipIndex * 0.05, zoneWidth: 0.35 });
    }

    this.gauge.update(deltaSeconds);
  }

  _updateSteam(deltaSeconds, elapsedSeconds) {
    if (elapsedSeconds - this._lastSteamSpawn > 0.5) {
      this._lastSteamSpawn = elapsedSeconds;
      this.steamParticles.push({
        offsetX: (Math.random() - 0.5) * 0.5,
        y: 0,
        alpha: 0.8,
        scale: 0.6 + Math.random() * 0.4,
      });
    }
    for (const p of this.steamParticles) {
      p.y += deltaSeconds * 40;
      p.alpha -= deltaSeconds * 0.5;
    }
    this.steamParticles = this.steamParticles.filter((p) => p.alpha > 0);
  }

  handleTap(elapsedSeconds) {
    if (this.awaitingRetry) {
      this.onFail();
      return;
    }
    if (this.finished || this.lastJudgeLabel) return;

    const result = this.gauge.judge();

    if (result === "success") {
      this.results.push(result);
      this.lastJudgeLabel = "success";
      this.judgeShownAt = elapsedSeconds;

      // 1回目の成功から、バウンド演出を入れる
      this.bodyBounceAt = elapsedSeconds;
    } else {
      this.lastJudgeLabel = "fail";
      this.awaitingRetry = true;
    }
  }

  render(ctx, width, height, elapsedSeconds) {
    const centerX = width / 2;
    const centerY = height * BODY_CENTER_Y_RATIO;
    const bodyDrawWidth = width * BODY_WIDTH_RATIO;

    // ---- 失敗後：失敗画像＋点滅するリトライ案内のみ表示 ----
    if (this.awaitingRetry) {
      if (isReady(FAIL_IMG)) {
        const scale = Math.max(width / FAIL_IMG.naturalWidth, height / FAIL_IMG.naturalHeight);
        const w = FAIL_IMG.naturalWidth * scale;
        const h = FAIL_IMG.naturalHeight * scale;
        ctx.drawImage(FAIL_IMG, centerX - w / 2, height / 2 - h / 2, w, h);
      } else {
        ctx.fillStyle = "#3a2a20";
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, bodyDrawWidth / 2, bodyDrawWidth * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("ざんねん…", centerX, centerY);
      }

      const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(elapsedSeconds * (Math.PI * 2) / 1.4));
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, height * 0.85, width, height * 0.15);
      ctx.globalAlpha = blinkAlpha;
      ctx.fillStyle = "#ffcf5c";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("もういっかいする", centerX, height * 0.93);
      ctx.restore();
      return;
    }

    // ---- 生地本体（トッピングフェーズと同じ位置・サイズになるよう layout.js の値を使用） ----
    const bodyImg = BODY_IMAGES[this.results.length];

    // バウンド演出の計算（対象期間中、大きく膨らみつつ少し浮き上がって戻る）
    let bounceScale = 1;
    let bounceOffsetY = 0;
    if (this.bodyBounceAt !== null) {
      const t = elapsedSeconds - this.bodyBounceAt;
      if (t < BODY_BOUNCE_DURATION) {
        const progress = t / BODY_BOUNCE_DURATION;
        const wave = Math.sin(progress * Math.PI);
        bounceScale = 1 + 0.4 * wave; // 膨らみを強め（0.18→0.4）
        bounceOffsetY = -bodyDrawWidth * 0.12 * wave; // 少し上に跳ねる
      } else {
        this.bodyBounceAt = null;
      }
    }

    let bodyDrawHeight;
    ctx.save();
    ctx.translate(centerX, centerY + bounceOffsetY);
    ctx.scale(bounceScale, bounceScale);
    if (isReady(bodyImg)) {
      bodyDrawHeight = bodyDrawWidth * (bodyImg.naturalHeight / bodyImg.naturalWidth);
      ctx.drawImage(bodyImg, -bodyDrawWidth / 2, -bodyDrawHeight / 2, bodyDrawWidth, bodyDrawHeight);
    } else {
      bodyDrawHeight = bodyDrawWidth * 0.85;
      ctx.fillStyle = "#f3e2c7";
      ctx.beginPath();
      ctx.ellipse(0, 0, bodyDrawWidth / 2, bodyDrawHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const bodyRadiusX = bodyDrawWidth / 2;
    const bodyRadiusY = bodyDrawHeight / 2;

    // ---- 湯気（画像が無い間は何も描かない） ----
    if (isReady(STEAM_IMG)) {
      for (const p of this.steamParticles) {
        const sx = centerX + p.offsetX * bodyRadiusX * 2;
        const sy = centerY - bodyRadiusY * 0.6 - p.y;
        ctx.save();
        ctx.globalAlpha = Math.max(p.alpha, 0);
        const size = 40 * p.scale;
        ctx.drawImage(STEAM_IMG, sx - size / 2, sy - size / 2, size, size);
        ctx.restore();
      }
    }

    // ---- へら（右手前と左手前、2本配置） ----
    const spatulaTilt = this.lastJudgeLabel ? -0.5 : -0.15;
    if (isReady(SPATULA_IMG)) {
      const w = width * 0.55;
      const h = w * (SPATULA_IMG.naturalHeight / SPATULA_IMG.naturalWidth);

      ctx.save();
      ctx.translate(centerX + bodyRadiusX * 1.0, centerY + bodyRadiusY * 1.0);
      ctx.rotate(spatulaTilt);
      ctx.drawImage(SPATULA_IMG, -w * 0.15, -h * 0.85, w, h);
      ctx.restore();

      ctx.save();
      ctx.translate(centerX - bodyRadiusX * 1.0, centerY + bodyRadiusY * 1.0);
      ctx.rotate(-spatulaTilt);
      ctx.scale(-1, 1);
      ctx.drawImage(SPATULA_IMG, -w * 0.15, -h * 0.85, w, h);
      ctx.restore();
    }

    // ---- 見出し ----
    ctx.save();
    ctx.font = "bold 21px sans-serif"; // 元の26pxから20%縮小
    ctx.textAlign = "center";
    const headingText = "タイミングよくひっくり返そう！";
    const headingMetrics = ctx.measureText(headingText);
    const headingPadX = 16;
    const headingBarW = headingMetrics.width + headingPadX * 2;
    const headingBarH = 36;
    const headingY = height * 0.13; // 少し下に移動
    ctx.fillStyle = "rgba(90,45,12,0.75)";
    ctx.beginPath();
    ctx.roundRect(width / 2 - headingBarW / 2, headingY - headingBarH * 0.72, headingBarW, headingBarH, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(headingText, width / 2, headingY);
    ctx.restore();

    if (this.lastJudgeLabel === "success") {
      ctx.fillStyle = "#e0552b";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("せいこう！", width / 2, height * 0.3);

      const t = Math.min((elapsedSeconds - this.judgeShownAt) / 0.6, 1);
      const scale = 0.6 + t * 0.6;
      const alpha = 1 - t * 0.5;
      if (isReady(STAR_IMG)) {
        const size = width * 0.25 * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(STAR_IMG, width / 2 - size / 2, height * 0.32, size, size);
        ctx.restore();
      }
      return;
    }

    // ---- タイミングゲージ ----
    const gaugeY = height * 0.85;
    const gaugeWidth = width * 0.7;
    const gaugeX = (width - gaugeWidth) / 2;
    const gaugeHeight = 20;

    ctx.fillStyle = "#ddd";
    ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    const gradient = ctx.createLinearGradient(gaugeX, 0, gaugeX + gaugeWidth, 0);
    gradient.addColorStop(0, "#4caf50");
    gradient.addColorStop(0.5, "#ffd166");
    gradient.addColorStop(1, "#e53935");
    ctx.fillStyle = gradient;
    ctx.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight);

    const zoneX = gaugeX + this.gauge.zoneStart * gaugeWidth;
    const zoneW = (this.gauge.zoneEnd - this.gauge.zoneStart) * gaugeWidth;
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.strokeRect(zoneX, gaugeY - 2, zoneW, gaugeHeight + 4);
    ctx.restore();

    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(zoneX + zoneW / 2, gaugeY - 8);
    ctx.lineTo(zoneX + zoneW / 2 - 8, gaugeY - 20);
    ctx.lineTo(zoneX + zoneW / 2 + 8, gaugeY - 20);
    ctx.closePath();
    ctx.fill();

    const needleX = gaugeX + this.gauge.position * gaugeWidth;
    if (isReady(NEEDLE_IMG)) {
      const nw = 30;
      const nh = nw * (NEEDLE_IMG.naturalHeight / NEEDLE_IMG.naturalWidth);
      ctx.drawImage(NEEDLE_IMG, needleX - nw / 2, gaugeY + gaugeHeight / 2 - nh / 2, nw, nh);
    } else {
      ctx.fillStyle = "#e0552b";
      ctx.fillRect(needleX - 3, gaugeY - 6, 6, gaugeHeight + 12);
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 18px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#fff";
    ctx.strokeText("画面をタップ！", width / 2, gaugeY + gaugeHeight + 30);
    ctx.fillStyle = "#e0552b";
    ctx.fillText("画面をタップ！", width / 2, gaugeY + gaugeHeight + 30);
    ctx.restore();
  }
}
