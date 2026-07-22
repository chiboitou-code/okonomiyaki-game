// クリア画面からのシェア機能（Web Share API、画像添付）。
// 対応していないブラウザ（多くのデスクトップブラウザ等）では、
// isShareSupported() が false を返すので、呼び出し側でボタン自体を表示しないようにする。

export function isShareSupported() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// data URL（"data:image/png;base64,...."）を同期的にFileへ変換する。
// canvas.toBlob()は非同期（コールバック）になり、その中でnavigator.share()を呼ぶと
// 一部ブラウザで「ユーザー操作の直後ではない」と判定されて共有が失敗することがあるため、
// 同期的なtoDataURL()＋atob()でFileを作り、タップイベントのハンドラ内で即座にshare()する。
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

// クリア画面（canvas）のスクリーンショットを画像としてシェアする。文言・URLは付けない。
export function shareScreenshot(canvasEl, filename = "okonomiyaki.png") {
  if (!canvasEl || !isShareSupported()) return;
  try {
    const dataUrl = canvasEl.toDataURL("image/png");
    const file = dataUrlToFile(dataUrl, filename);
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return;
    }
    navigator.share({ files: [file] }).catch(() => {
      // ユーザーがキャンセルした場合等はエラーにせず、何もしない
    });
  } catch (e) {
    // toDataURLに失敗した場合（画像の読み込み元が別オリジン等）は何もしない
  }
}
