import { TimingGauge } from "./gauge.js";
import { loadImage, isReady } from "./assets.js";
import { BODY_WIDTH_RATIO, BODY_CENTER_Y_RATIO } from "./layout.js";
import { playSfx } from "./audio.js";
import { SOUNDS } from "./sounds.js";
import gsap from "gsap";

const TOTAL_FLIPS = 4;
const SUCCESS_DISPLAY_DURATION = 0.9; // 秒。成功演出（文字・星・キャラ）を表示しておく時間
const CHARACTER_POP_GROW_DURATION = 0.2; // 秒。キャラがポンと出てくるまでの時間（この後は縮小せずそのまま表示）
const TURN_TIME_LIMIT = 10; // 秒。各ターンの制限時間
const SCORE_SEQUENCE_DURATION = 1.5; // スコアシーケンス各項目の表示時間（秒）

// ---- 難易度カーブ（回数が進むごとに速く・成功ゾーンが狭くなる） ----
const BASE_SPEED = 0.5;
const SPEED_STEP = 0.07; // 1回ごとに速度がこれだけ上がる
const BASE_ZONE_WIDTH = 0.35;
const ZONE_WIDTH_STEP = 0.05; // 1回ごとに成功ゾーンがこれだけ狭くなる
const MIN_ZONE_WIDTH = 0.16; // これ以上は狭くしない（さすがに不可能にならないように）

// ---- 判定ごとの得点・表示ラベル ----
const SCORE_MAP = { perfect: 100, great: 70, good: 40 };
const LABEL_MAP = { perfect: "パーフェクト！", great: "グレイト！", good: "グッド！" };
const COLOR_MAP = { perfect: "#ffd166", great: "#ff8a3d", good: "#8bd17c" };

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
const TIMEUP_IMG = loadImage("/images/okonomiyaki/body_timeup.png"); // 時間切れ専用画像

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
    this.totalScore = 0;
    this.scoreBounce = { scale: 1, flash: 0 };
    this.gauge = new TimingGauge(gaugeSettingsForFlip(0));
    this.lastJudgeLabel = null;
    this.judgeShownAt = 0;
    this.finished = false;
    this.awaitingRetry = false;
    this.isTimeUp = false; // 時間切れフラグ
    this.lastBaseScore = 0; // 最後に獲得した判定点
    this.lastTimeBonus = 0; // 最後に獲得した時間ボーナス
    this.bodyBounce = { scale: 1, offsetY: 0 };
    this.turnStartedAt = null; // 現在のターンの開始時刻（nullで未開始）

    this.steamParticles = [];
    this._lastSteamSpawn = 0;
    this.showingScoreSequence = false;
    this.scoreSequenceStartedAt = null;
    this.perfectCount = 0;
    this.totalTimeBonus = 0;
  }

  update(deltaSeconds, elapsedSeconds) {
    if (this.showingExplain) return;
    if (this.awaitingRetry) return;

    this._updateSteam(deltaSeconds, elapsedSeconds);

    if (this.showingScoreSequence) {
      this._updateScoreSequence(elapsedSeconds);
      return;
    }
    if (this.finished) return;

    const isSuccess = this.lastJudgeLabel && this.lastJudgeLabel !== "fail";

    if (isSuccess && elapsedSeconds - this.judgeShownAt < SUCCESS_DISPLAY_DURATION) {
      return;
    }

    if (isSuccess && elapsedSeconds - this.judgeShownAt >= SUCCESS_DISPLAY_DURATION) {
      this.lastJudgeLabel = null;
      this.flipIndex += 1;
      if (this.flipIndex >= TOTAL_FLIPS) {
        this.finished = true;
        this._startScoreSequence(elapsedSeconds);
        return;
      }
      this.gauge = new TimingGauge(gaugeSettingsForFlip(this.flipIndex));
      this.turnStartedAt = elapsedSeconds;
    }

    // 時間切れチェック（turnStartedAtが未設定の場合はスキップ）
    if (this.turnStartedAt === null) return;
    const remaining = Math.max(TURN_TIME_LIMIT - (elapsedSeconds - this.turnStartedAt), 0);
    if (remaining <= 0 && !this.lastJudgeLabel) {
      this.lastJudgeLabel = "fail";
      this.isTimeUp = true;
      this.awaitingRetry = true;
      playSfx(SOUNDS.gameOver);
      return;
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

  // 点数が入った時に、スコア表示を弾ませる
  _bounceScore() {
    gsap.killTweensOf(this.scoreBounce);
    gsap.timeline()
      .to(this.scoreBounce, { scale: 1.7, flash: 1, duration: 0.12, ease: "back.out(3)" })
      .to(this.scoreBounce, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.25)" }, "<")
      .to(this.scoreBounce, { flash: 0, duration: 0.4, ease: "power1.out" }, "<0.1");
  }

  // 右上の累計スコアを描画
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

  // 獲得スコアのポップアップを描画
  _renderScorePopup(ctx, width, height, label) {
    ctx.save();
    ctx.textAlign = "center";

    // ラベルを上部に大きく表示
    const color = COLOR_MAP[this.lastJudgeLabel];
    ctx.fillStyle = color;
    ctx.font = "bold 48px sans-serif";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#000";
    ctx.strokeText(label, width / 2, height * 0.22);
    ctx.fillText(label, width / 2, height * 0.22);

    // 判定点を表示
    ctx.font = "bold 28px sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#000";
    ctx.strokeText(`${this.lastBaseScore} 点`, width / 2, height * 0.38);
    ctx.fillStyle = "#fff";
    ctx.fillText(`${this.lastBaseScore} 点`, width / 2, height * 0.38);

    // 時間ボーナスを表示
    ctx.font = "bold 24px sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#000";
    ctx.strokeText(`残り時間ボーナス ${this.lastTimeBonus} 点`, width / 2, height * 0.48);
    ctx.fillStyle = "#ffb385";
    ctx.fillText(`残り時間ボーナス ${this.lastTimeBonus} 点`, width / 2, height * 0.48);

    // 合計得点を下部に大きく表示
    const totalPoints = this.lastBaseScore + this.lastTimeBonus;
    ctx.font = "bold 42px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#000";
    ctx.strokeText(`${totalPoints} 点`, width / 2, height * 0.74);
    ctx.fillStyle = "#ffcf5c";
    ctx.fillText(`${totalPoints} 点`, width / 2, height * 0.74);
    ctx.restore();
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
      this.turnStartedAt = elapsedSeconds; // 解説画面を閉じた時にターン開始時刻を設定
      return;
    }

    if (this.awaitingRetry) {
      playSfx(SOUNDS.retryTap);
      this.isTimeUp = false; // リトライ時にフラグをリセット
      this.onFail();
      return;
    }
    if (this.finished || this.lastJudgeLabel) return;

    const result = this.gauge.judge();

    if (result !== "fail") {
      playSfx(this.results.length === 0 ? SOUNDS.flipFirst : SOUNDS.flip);

      const remaining = Math.max(TURN_TIME_LIMIT - (elapsedSeconds - this.turnStartedAt), 0);
      const timeBonus = Math.round(30 * (remaining / TURN_TIME_LIMIT));
      const points = SCORE_MAP[result] + timeBonus;
      this.lastBaseScore = SCORE_MAP[result];
      this.lastTimeBonus = timeBonus;
      this.totalScore += points;
      if (result === "perfect") {
        this.perfectCount += 1;
      }
      this.totalTimeBonus += timeBonus;
      this._bounceScore();

      this.results.push(result);
      this.lastJudgeLabel = result;
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

    // ---- スコアシーケンス表示 ----
    if (this.showingScoreSequence) {
      this._renderScoreSequence(ctx, width, height, elapsedSeconds);
      return;
    }

    // ---- 失敗後：失敗画像＋点滅するリトライ案内のみ表示 ----
    if (this.awaitingRetry) {
      // 時間切れの場合は専用画像を表示
      const displayImg = this.isTimeUp ? TIMEUP_IMG : FAIL_IMG;
      if (isReady(displayImg)) {
        const scale = Math.max(width / displayImg.naturalWidth, height / displayImg.naturalHeight);
        const w = displayImg.naturalWidth * scale;
        const h = displayImg.naturalHeight * scale;
        ctx.drawImage(displayImg, centerX - w / 2, height / 2 - h / 2, w, h);
      } else {
        ctx.fillStyle = "#3a2a20";
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, bodyDrawWidth / 2, bodyDrawWidth * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.isTimeUp ? "時間切れ…" : "ざんねん…", centerX, centerY);
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

    // ---- 残り時間表示 ----
    if (!this.lastJudgeLabel || this.lastJudgeLabel === "fail") {
      const remaining = Math.max(TURN_TIME_LIMIT - (elapsedSeconds - this.turnStartedAt), 0);
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 46px sans-serif";
      ctx.fillStyle = remaining < 1 ? "#ff5252" : "#fff";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#000";
      ctx.strokeText(remaining.toFixed(1), width / 2, height * 0.2);
      ctx.fillText(remaining.toFixed(1), width / 2, height * 0.2);
      ctx.restore();
    }

    // ---- 見出し（成功時は非表示） ----
    if (!this.lastJudgeLabel || this.lastJudgeLabel === "fail") {
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
    }

    if (this.lastJudgeLabel && this.lastJudgeLabel !== "fail") {
      const label = LABEL_MAP[this.lastJudgeLabel];
      const color = COLOR_MAP[this.lastJudgeLabel];

      const t = Math.min((elapsedSeconds - this.judgeShownAt) / 0.6, 1);
      const scale = 0.6 + t * 0.6;
      const alpha = 1 - t * 0.5;
      if (isReady(STAR_IMG)) {
        const size = width * 0.25 * scale;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(STAR_IMG, width / 2 - size / 2, height * 0.38, size, size);
        ctx.restore();
      }

      if (isReady(CHARACTER_IMG)) {
        const growProgress = Math.min((elapsedSeconds - this.judgeShownAt) / CHARACTER_POP_GROW_DURATION, 1);
        const growScale = Math.sin(growProgress * (Math.PI / 2));
        const charCenterX = width * 0.5;
        const charCenterY = height * 0.32;
        const charH = width * 0.35 * growScale;
        const charW = charH * (CHARACTER_IMG.naturalWidth / CHARACTER_IMG.naturalHeight);

        ctx.save();
        ctx.globalAlpha = growScale;
        ctx.drawImage(CHARACTER_IMG, charCenterX - charW / 2, charCenterY - charH / 2, charW, charH);
        ctx.restore();
      }

      this._renderTotalScoreBadge(ctx, width, height);
      this._renderScorePopup(ctx, width, height, label);
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

    // 判定区切り線（perfect/great と great/good の境界）
    const zoneCenterX = zoneX + zoneW / 2;
    const zoneHalfWidth = zoneW / 2;
    ctx.save();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    // perfect/great の境界（中心から33%）
    ctx.beginPath();
    ctx.moveTo(zoneCenterX - zoneHalfWidth * 0.33, gaugeY);
    ctx.lineTo(zoneCenterX - zoneHalfWidth * 0.33, gaugeY + gaugeHeight);
    ctx.stroke();
    // great/good の境界（中心から66%）
    ctx.beginPath();
    ctx.moveTo(zoneCenterX + zoneHalfWidth * 0.33, gaugeY);
    ctx.lineTo(zoneCenterX + zoneHalfWidth * 0.33, gaugeY + gaugeHeight);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(zoneCenterX, gaugeY - 8);
    ctx.lineTo(zoneCenterX - 8, gaugeY - 20);
    ctx.lineTo(zoneCenterX + 8, gaugeY - 20);
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

    this._renderTotalScoreBadge(ctx, width, height);
  }

  _renderExplain(ctx, width, height, elapsedSeconds) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffcf5c";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("じょうずにかえそう！", width / 2, height * 0.32);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 17px sans-serif";
    const lines = ["ゲージがまんなかにきたら", "画面をタップしよう！", "まんなかに近いほど得点がたかいよ", `ぜんぶで${TOTAL_FLIPS}回、だんだん速くなるよ`];
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
  
  _startScoreSequence(elapsedSeconds) {
    this.showingScoreSequence = true;
    this.scoreSequenceStartedAt = elapsedSeconds;
  }
  
  _updateScoreSequence(elapsedSeconds) {
    const elapsed = elapsedSeconds - this.scoreSequenceStartedAt;
    const totalDuration = 3 * SCORE_SEQUENCE_DURATION;
    if (elapsed >= totalDuration) {
      this.showingScoreSequence = false;
      this.onComplete(this.results, this.totalScore);
    }
  }
  
  _renderScoreSequence(ctx, width, height, elapsedSeconds) {
    const elapsed = elapsedSeconds - this.scoreSequenceStartedAt;
    const currentIndex = Math.floor(elapsed / SCORE_SEQUENCE_DURATION);
    const itemProgress = (elapsed % SCORE_SEQUENCE_DURATION) / SCORE_SEQUENCE_DURATION;
    
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    
    if (currentIndex < 3) {
      let alpha = 1;
      if (itemProgress < 0.15) {
        alpha = itemProgress / 0.15;
      } else if (itemProgress > 0.85) {
        alpha = (1 - itemProgress) / 0.15;
      }
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = "center";
      
      if (currentIndex === 0) {
        ctx.fillStyle = "#ffcf5c";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText("パーフェクト", width / 2, height * 0.35);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("ひっくり返し", width / 2, height * 0.42);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 56px sans-serif";
        ctx.fillText(`${this.perfectCount} 回`, width / 2, height * 0.55);
      } else if (currentIndex === 1) {
        ctx.fillStyle = "#ffcf5c";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText("残り時間", width / 2, height * 0.35);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText("ボーナス", width / 2, height * 0.42);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 56px sans-serif";
        ctx.fillText(`${this.totalTimeBonus} 点`, width / 2, height * 0.55);
      } else if (currentIndex === 2) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "bold 72px sans-serif";
        ctx.shadowColor = "#ff8a3d";
        ctx.shadowBlur = 20;
        ctx.fillText(`${this.totalScore} 点`, width / 2, height * 0.55);
      }
      
      ctx.restore();
    }
  }
}
