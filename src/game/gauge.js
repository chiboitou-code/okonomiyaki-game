// ひっくり返しタイミング用のゲージ
// 0〜1の範囲を往復するインジケーターと、ジャストゾーンの判定を持つ

export class TimingGauge {
  /**
   * @param {object} opts
   * @param {number} opts.speed - 1秒あたりに進む割合（大きいほど速い）
   * @param {number} opts.zoneWidth - ジャストゾーンの幅（0〜1）。仕様書では30〜40%を推奨
   */
  constructor({ speed = 0.6, zoneWidth = 0.35 } = {}) {
    this.speed = speed;
    this.zoneStart = (1 - zoneWidth) / 2;
    this.zoneEnd = this.zoneStart + zoneWidth;
    this.position = 0; // 0〜1
    this.direction = 1; // 1: 進む, -1: 戻る（往復運動）
  }

  update(deltaSeconds) {
    this.position += this.direction * this.speed * deltaSeconds;
    if (this.position >= 1) {
      this.position = 1;
      this.direction = -1;
    } else if (this.position <= 0) {
      this.position = 0;
      this.direction = 1;
    }
  }

  // 現在位置でタップされた時の判定：ジャストゾーン内なら成功、外れなら失敗
  judge() {
    const inZone = this.position >= this.zoneStart && this.position <= this.zoneEnd;
    return inZone ? "success" : "fail";
  }
}
