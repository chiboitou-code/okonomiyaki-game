# くるっと！おこのみやき（プロトタイプ雛形）

仕様書（お好み焼きひっくり返しゲーム）をもとにした開発用の雛形です。
今はイラスト・音源が仮の状態（図形描画・無音）ですが、ゲームとして一通り動きます。

## 使い方

初回のみ:
```
npm install
```

開発サーバーを起動:
```
npm run dev
```
表示されたURL（例: http://localhost:5173）をブラウザで開くと動作確認できます。

スマホの実機で確認したい場合:
```
npm run dev -- --host
```
表示された `Network:` のURL（例: http://192.168.x.x:5173）に、PCと同じWi-Fiに繋いだスマホのブラウザからアクセスしてください。

## フォルダ構成

```
src/
  main.js            … エントリーポイント。画面遷移・入力・ループを統括
  style.css           … 全体スタイル
  game/
    gameState.js       … シーン管理（タイトル/調理/トッピング/結果）
    gauge.js           … ひっくり返しのタイミングゲージ・判定ロジック
    cookingPhase.js     … 調理フェーズ（4回のひっくり返し判定、演出）
    toppingPhase.js     … トッピングフェーズ（ドラッグ/フリック/タップ操作）
public/
  images/             … ここにGemini生成画像を配置していく（下記の命名ルール参照）
  audio/              … ここにフリー音源を配置していく
```

## 今の実装状況（できていること）

- ひっくり返しタイミング判定（ゲージ式、計4回、回ごとに焼き加減が変化）
- ソース・かつおぶし・あおのり：ドラッグ/タップで描画
- マヨネーズ：フリック操作で線が引ける（弱いフリックでも一定の長さが出るよう補正済み）
- トッピングの「ぜんぶけす」「できあがり」
- 結果画面（4回の判定結果から簡易的な総合評価コメントを表示）

見た目は全て仮の図形描画です。画像を差し込む処理はまだ入っていません。

## 画像を差し込むときの想定（次のステップ）

`public/images/` に画像を置いたら、`cookingPhase.js` の `render()` 内で
`ctx.fillStyle` や `ctx.ellipse` で描いている部分を `ctx.drawImage()` に置き換えていく想定です。

画像を用意する際は、以下のような命名・分類にしておくと差し替えがスムーズです。

```
public/images/
  okonomiyaki/
    base.png         … 焼く前の生地
    kanpeki.png       … かんぺきに焼けた時のパーツ
    sokosoko.png      … そこそこ焼けた時のパーツ
    koge.png          … 焦げた時のパーツ
    namayake.png      … 生焼けの時のパーツ
  toppings/
    icon_sauce.png
    icon_mayo.png
    icon_aonori.png
    icon_katsuobushi.png
  ui/
    title_logo.png
    hetagai_bg.png    … 背景など
```

透過PNG（背景なし）で書き出すのがおすすめです。Gemini生成後にサイズがバラつく場合は、
最終的に同じ解像度・余白に揃える一手間（Figma等でのリサイズ）が必要になります。

## 音を差し込むときの想定

`public/audio/` に音源を置き、`main.js` や各フェーズ内で `new Audio("/audio/xxx.mp3")` の形で
再生する処理を追加していく想定です（今はまだ未実装）。

```
public/audio/
  se_tap.mp3
  se_flip.mp3
  se_success.mp3
  se_burn.mp3
  se_topping_sauce.mp3
  se_topping_mayo.mp3
  bgm.mp3
```

## 次にやると良いこと

1. `npm install` → `npm run dev` で一度動かしてみる
2. 気になる挙動（ゲージの速さ、フリックの感度など）を触って調整する
3. 画像を1種類ずつ差し込んで `drawImage` に置き換えていく
4. 音を1つずつ追加していく
