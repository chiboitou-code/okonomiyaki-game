// 画像の読み込み＆キャッシュを行う小さなヘルパー
// 画像がまだ用意されていない（ファイルが無い）場合はエラーを吸収し、
// isReady() が false を返すので、呼び出し側で「代わりに図形を描く」等のフォールバックができる

const cache = new Map();

// "/images/xxx.png" のような書き方のまま、公開先が https://user.github.io/repo-name/ の
// ようにサブフォルダになっていても正しい場所を見るように変換する。
// 例: base が "/okonomiyaki-game/" の場合、"/images/a.png" → "/okonomiyaki-game/images/a.png"
export function resolvePath(path) {
  const base = import.meta.env.BASE_URL || "/";
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return base.endsWith("/") ? base + cleanPath : base + "/" + cleanPath;
}

export function loadImage(path) {
  const resolvedPath = resolvePath(path);
  if (cache.has(resolvedPath)) return cache.get(resolvedPath);

  const img = new Image();
  img.src = resolvedPath;
  cache.set(resolvedPath, img);
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

// これまでに loadImage() で読み込みを開始した「全ての画像」が、
// 読み込み終わる（成功・失敗どちらでもOK）まで待つ。
// 万が一ネットワークが遅すぎる場合に備えて timeoutMs で強制的に打ち切る。
export function waitForAllImages({ timeoutMs = 10000, onProgress } = {}) {
  const allImages = Array.from(cache.values());
  const total = allImages.length;

  return new Promise((resolve) => {
    if (total === 0) {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve();
    };

    const checkProgress = () => {
      const loaded = allImages.filter((img) => img.complete).length;
      onProgress?.(loaded, total);
      if (loaded >= total) finish();
    };

    const intervalId = setInterval(checkProgress, 100);
    const timeoutId = setTimeout(finish, timeoutMs); // 遅すぎる場合はタイムアウトで進行させる
    checkProgress();
  });
}
