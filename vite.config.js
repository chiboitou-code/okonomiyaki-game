import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pagesで公開する時、URLが https://ユーザー名.github.io/リポジトリ名/ になるため、
  // リポジトリ名と同じ名前をここに指定する必要がある
  base: "/okonomiyaki-game/",
});
