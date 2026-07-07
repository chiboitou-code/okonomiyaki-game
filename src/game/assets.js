// 画像の読み込み＆キャッシュを行う小さなヘルパー
// 画像がまだ用意されていない（ファイルが無い）場合はエラーを吸収し、
// isReady() が false を返すので、呼び出し側で「代わりに図形を描く」等のフォールバックができる

const cache = new Map();

export function loadImage(path) {
  if (cache.has(path)) return cache.get(path);

  const img = new Image();
  img.src = path;
  img.dataset ? null : null; // noop（古い環境向けの安全策）
  cache.set(path, img);
  return img;
}

// 画像がちゃんと読み込み終わっているか（＝描画に使って良いか）を判定
export function isReady(img) {
  return !!img && img.complete && img.naturalWidth > 0;
}

// 複数候補（例: patch_kanpeki_01.png, _02.png, _03.png）のうち、
// 現時点で読み込み済みのものだけからランダムに1つ選ぶ
export function pickReadyRandom(images) {
  const ready = images.filter(isReady);
  if (ready.length === 0) return null;
  return ready[Math.floor(Math.random() * ready.length)];
}
