// クリア画面からのシェア機能（Web Share API）。
// 対応していないブラウザ（多くのデスクトップブラウザ等）では、
// isShareSupported() が false を返すので、呼び出し側でボタン自体を表示しないようにする。

export function isShareSupported() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function shareScore(score, modeLabel) {
  if (!isShareSupported()) return;
  const text = `「くるっと！おこのみやき」${modeLabel}で${score}点とったよ！`;
  const url = typeof window !== "undefined" ? window.location.href : undefined;
  navigator.share({ text, url }).catch(() => {
    // ユーザーがキャンセルした場合等はエラーにせず、何もしない
  });
}
