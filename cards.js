
// カードの原本データ(idはscript.jsのmakeCard()が参照するので必須)
// icon は画像素材が無いのでテキスト表示
const CARD_MASTER = [
  { id: "slime",    name: "スライム",     icon: "", atk: 1, hp: 2, sacrifice: 0, soul: 1, abilities: [] },
  { id: "ghost",    name: "ゴースト",     icon: "", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["飛行"] },
  { id: "skeleton", name: "スケルトン",   icon: "", atk: 2, hp: 1, sacrifice: 0, soul: 1, abilities: [] },
  { id: "orc",      name: "オーク",       icon: "", atk: 3, hp: 2, sacrifice: 1, soul: 1, abilities: [] },
  { id: "zombie",   name: "ゾンビ",       icon: "", atk: 1, hp: 1, sacrifice: 0, soul: 2, abilities: ["突進", "不死"] },
  { id: "golem",    name: "鎧ゴーレム",   icon: "", atk: 2, hp: 3, sacrifice: 0, soul: 2, abilities: ["装甲"] },
  { id: "viper",    name: "毒ヘビ",       icon: "", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["毒"] },
  { id: "knight",   name: "盾の騎士",     icon: "", atk: 1, hp: 3, sacrifice: 0, soul: 2, abilities: ["守護"] }
];

// 各能力の説明文(能力一覧モーダルで表示)
const ABILITY_INFO = {
  "飛行":   "相手の場に「守護」がいなければ、他のカードを無視して相手プレイヤーに直接攻撃できる。",
  "突進":   "召喚した直後のターンでも攻撃できる(通常は召喚した次のターンから)。",
  "不死":   "戦闘でHPが0になっても、そのカードにつき1回だけHP満タンで復活する。",
  "装甲":   "受けるダメージを1軽減する(攻撃時・被攻撃時どちらでも)。",
  "毒":     "1点でもダメージを与えれば、相手のHPに関係なく即座に撃破する。",
  "守護":   "このカードがいるレーンには「飛行」の攻撃も直接攻撃にならず、必ずこのカードと戦闘する。"
};

// デッキ編成のデフォルト枚数(各カードid: 枚数)。プレイヤーはこれを基準に編成できる。
const DEFAULT_DECK_COUNTS = {
  slime: 2, ghost: 2, skeleton: 2, orc: 2,
  zombie: 2, golem: 2, viper: 2, knight: 2
};

// 1枚のカードidから何枚デッキに入れられるか
const MAX_COPIES_PER_CARD = 3;
const DECK_MIN_SIZE = 10;
const DECK_MAX_SIZE = 24;

// デッキ枚数設定(オブジェクト {id: 枚数}) からidの配列を作る
function countsToDeckIds(counts){
  const ids = [];
  Object.keys(counts).forEach(id=>{
    for(let i=0;i<counts[id];i++) ids.push(id);
  });
  return ids;
}
