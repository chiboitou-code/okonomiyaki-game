// ゲーム全体の状態（シーン）を管理するシンプルなステートマシン
export const SCENES = {
  TITLE: "title",
  COOKING: "cooking",
  ADULT_COOKING: "adult_cooking",
  ADULT_TOPPING: "adult_topping",
  TOPPING: "topping",
  RESULT: "result",
  GAMEOVER: "gameover",
};

export function createGameState() {
  return {
    scene: SCENES.TITLE,
    flipResults: [], // "kanpeki" | "sokosoko" | "koge" | "namayake" を4回分ためる
    toppings: [], // { type: "sauce" | "mayo" | "aonori" | "katsuobushi", points: [...] }
  };
}
