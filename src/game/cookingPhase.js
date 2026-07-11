import { TimingGauge } from "./gauge.js";
import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

const TOTAL_FLIPS = 4;
const SUCCESS_DISPLAY_DURATION = 0.9; // 秒。成功演出（文字・星・キャラ）を表示しておく時間
const CHARACTER_POP_GROW_DURATION = 0.2; // 秒。キャラがポンと出てくるまでの時間（この後は縮小せずそのまま表示）

// ---- 難易度カーブ（回数が進むごとに速く・成功ゾーンが狭くなる） ----
const BASE_SPEED = 0.4;
const SPEED_STEP = 0.06; // 1回ごとに速度がこれだけ上がる
const BASE_ZONE_WIDTH = 0.35;
const ZONE_WIDTH_STEP = 0.05; // 1回ごとに成功ゾーンがこれだけ狭くなる
const MIN_ZONE_WIDTH = 0.16; // これ以上は狭くしない（さすがに不可能にならないように）

function gaugeSettingsForFlip(flipIndex) {
  return {
    speed: BASE_SPEED + flipIndex * SPEED_STEP,
    zoneWidth: Math.max(BASE_ZONE_WIDTH - flipIndex * ZONE_WIDTH_STEP, MIN_ZONE_WIDTH),
  };
}

// ---- 画像パス設定 ----
const SPATULA_IMG = loadImage("/images/ui/spatula.png");
const STEAM_IMG = loadImage("/images/ui/steam_puff.png");
const STAR_IMG = loadImage("/images/ui/star_effect.png");
const CHARACTER_IMG = loadImage("/images/ui/character_cooking.png"); // 応援キャラ（ひっくり返すフェーズの吹き出し用）
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
    this.showingExplain = true; // 開始時の解説画面
    this.flipIndex = 0;
    this.results = [];
    this.gauge = new TimingGauge(gaugeSettingsForFlip(0));
    this.lastJudgeLabel = null;
    this.judgeShownAt = 0;
    this.finished = false;
    this.awaitingRetry = false;
    this.bodyBounce = { scale: 1, offsetY: 0 };

    this.steamParticles = [];
    this._lastSteamSpawn = 0;
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.showingExplain) return;
    if (this.awaitingRetry) return;

    this._updateSteam(deltaSeconds, elapsedSeconds);

    if (this.finished) return;

    if (this.lastJudgeLabel === "success" && elapsedSeconds - this.judgeShownAt < SUCCESS_DISPLAY_DURATION) {
      return;
    }

    if (this.lastJudgeLabel === "success" && elapsedSeconds - this.judgeShownAt >= SUCCESS_DISPLAY_DURATION) {
      this.lastJudgeLabel = null;
      this.flipIndex += 1;
      if (this.flipIndex >= TOTAL_FLIPS) {
        this.finished = true;
        this.onComplete(this.results);
        return;
      }
      this.gauge = new TimingGauge(gaugeSettingsForFlip(this.flipIndex));
    }

    this.gauge.update(deltaSeconds);
  }

  // 成功のたびに、本体を「ポンと膨らんで少し浮き上がって戻る」バウンドをさせる
  _bounceBody() {
    gsap.killTweensOf(this.bodyBounce);
    gsap.timeline()
      .to(this.bodyBounce, { scale: 1.4, offsetY: -0.12, duration: 0.15, ease: "back.out(2)" })
      .to(this.bodyBounce, { scale: 1, offsetY: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
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

  handleTap(elapsedSeconds) {
    if (this.showingExplain) {
      playSfx(SOUNDS.start);
      this.showingExplain = false;
      return;
    }

    if (this.awaitingRetry) {
      playSfx(SOUNDS.retryTap);
      this.onFail();
      return;
    }
    if (this.finished || this.lastJudgeLabel) return;

    const result = this.gauge.judge();

    if (result === "success") {
      playSfx(this.results.length === 0 ? SOUNDS.flipFirst : SOUNDS.flip);

      this.results.push(result);
      this.lastJudgeLabel = "success";
      this.judgeShownAt = elapsedSeconds;

      this._bounceBody();
    } else {
      playSfx(SOUNDS.gameOver);
      this.lastJudgeLabel = "fail";
      this.awaitingRetry = true;
    }
  }

  render(ctx, width, height, elapsedSeconds) {
    const centerX = width / 2;
    const centerY = height * BODY_CENTER_Y_RATIO;
    const bodyDrawWidth = width * BODY_WIDTH_RATIO;

    if (this.showingExplain) {
      this._renderExplain(ctx, width, height, elapsedSeconds);
      return;
    }

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

    let bodyDrawHeight;
    ctx.save();
    ctx.translate(centerX, centerY + this.bodyBounce.offsetY * bodyDrawWidth);
    ctx.scale(this.bodyBounce.scale, this.bodyBounce.scale);
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

    // ---- 湯気（画像があればそちらを、無ければCanvasで柔らかい煙を描く） ----
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
    ctx.font = "bold 21px sans-serif";
    ctx.textAlign = "center";
    const headingText = "タイミングよくひっくり返そう！";
    const headingMetrics = ctx.measureText(headingText);
    const headingPadX = 16;
    const headingBarW = headingMetrics.width + headingPadX * 2;
    const headingBarH = 36;
    const headingY = height * 0.13;
    ctx.fillStyle = "rgba(90,45,12,0.75)";
    ctx.beginPath();
    ctx.roundRect(width / 2 - headingBarW / 2, headingY - headingBarH * 0.72, headingBarW, headingBarH, 20);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(headingText, width / 2, headingY);
    ctx.restore();

    if (this.lastJudgeLabel === "success") {
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

      if (isReady(CHARACTER_IMG)) {
        const growProgress = Math.min((elapsedSeconds - this.judgeShownAt) / CHARACTER_POP_GROW_DURATION, 1);
        const growScale = Math.sin(growProgress * (Math.PI / 2));
        const charCenterX = width * 0.5;
        const charCenterY = height * 0.28;
        const charH = width * 0.4 * growScale;
        const charW = charH * (CHARACTER_IMG.naturalWidth / CHARACTER_IMG.naturalHeight);

        ctx.save();
        ctx.globalAlpha = growScale;
        ctx.drawImage(CHARACTER_IMG, charCenterX - charW / 2, charCenterY - charH / 2, charW, charH);
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

  _renderExplain(ctx, width, height, elapsedSeconds) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("ひっくり返すフェーズ", width / 2, height * 0.32);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px sans-serif";
    const lines = ["ゲージがまんなかにきたら", "画面をタップしよう！", `ぜんぶで${TOTAL_FLIPS}回、だんだん速くなるよ`];
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height * 0.44 + i * 30);
    });

    const blinkAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin((elapsedSeconds * Math.PI * 2) / 1.4));
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = "#e0552b";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("タップしてはじめる", width / 2, height * 0.44 + lines.length * 30 + 30);
    ctx.restore();
  }
}
