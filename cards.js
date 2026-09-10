
// カードの原本データ(idはscript.jsのmakeCard()が参照するので必須)
// icon は画像素材が無いカード用のテキスト表示。image を指定すると、そのカードは
// 画像(images/フォルダ内のファイル)で表示される。両方無い場合は名前のみ表示。
const CARD_MASTER = [
  { id: "slime",    name: "スライム",     icon: "", image: "images/slime.jpg", atk: 1, hp: 2, sacrifice: 0, soul: 1, abilities: [] },
  { id: "ghost",    name: "ゴースト",     icon: "", image: "images/ghost.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["飛行"] },
  { id: "skeleton", name: "スケルトン",   icon: "", image: "images/skeleton.jpg", atk: 2, hp: 1, sacrifice: 0, soul: 1, abilities: [] },
  { id: "orc",      name: "オーク",       icon: "", image: "images/orc.jpg", atk: 3, hp: 2, sacrifice: 1, soul: 1, abilities: [] },
  { id: "zombie",   name: "ゾンビ",       icon: "", image: "images/zombie.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 2, abilities: ["不死"] },
  { id: "golem",    name: "鎧ゴーレム",   icon: "", image: "images/golem.jpg", atk: 2, hp: 3, sacrifice: 0, soul: 2, abilities: ["装甲"] },
  { id: "viper",    name: "毒ヘビ",       icon: "", image: "images/viper.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["毒"] },
  { id: "knight",   name: "盾の騎士",     icon: "", image: "images/knight.jpg", atk: 1, hp: 4, sacrifice: 0, soul: 2, abilities: ["守護"] },
  { id: "demon",    name: "デーモン",     icon: "", image: "images/demon.jpg", atk: 5, hp: 4, sacrifice: 2, soul: 3, abilities: ["貫通"] },
  { id: "necromancer", name: "ネクロマンサー", icon: "", image: "images/necromancer.jpg", atk: 1, hp: 3, sacrifice: 1, soul: 3, abilities: ["召喚時"] },
  { id: "ram",      name: "破城槌",       icon: "", image: "images/ram.jpg", atk: 4, hp: 2, sacrifice: 1, soul: 2, abilities: ["貫通"] },
  { id: "berserker", name: "バーサーカー", icon: "", image: "images/berserker.jpg", atk: 2, hp: 2, sacrifice: 0, soul: 2, abilities: ["2連撃"] },
  // ---- 新規カード5種(既存カード・既存ルールは変更せず追加のみ) ----
  // 「供物」「魂収集」は元々ABILITY_INFOに定義済みだが、これまでどのカードも持っていなかった能力。
  // 新カードで初めて実際に使用する。
  { id: "lamb",     name: "生け贄の子羊", icon: "🐑", image: "images/lamb.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["供物"] },
  { id: "ghoul",    name: "墓守りのグール", icon: "👻", atk: 2, hp: 2, sacrifice: 0, soul: 2, abilities: ["魂収集"] },
  { id: "guardian", name: "鉄壁の守護者", icon: "🛡️", atk: 2, hp: 5, sacrifice: 1, soul: 3, abilities: ["守護","装甲"] },
  { id: "reaper",   name: "死神",         icon: "💀", atk: 3, hp: 4, sacrifice: 1, soul: 3, abilities: ["毒","貫通"] },
  { id: "duelist",  name: "双剣の傭兵",   icon: "⚔️", atk: 3, hp: 1, sacrifice: 0, soul: 4, abilities: ["2連撃"] },
  // ---- 追加カード2種(「魂喰らい」「知識」の新能力お披露目用) ----
  { id: "souleater", name: "ソウルイーター", icon: "👹", atk: 2, hp: 3, sacrifice: 0, soul: 2, abilities: ["魂喰らい"] },
  { id: "seer",       name: "予言者",         icon: "🔮", atk: 1, hp: 2, sacrifice: 0, soul: 2, abilities: ["知識"] }
];

// 各能力の説明文(能力一覧モーダルで表示)
const ABILITY_INFO = {
  "飛行":   "相手の場に「守護」がいなければ、他のカードを無視して相手プレイヤーに直接攻撃できる。",
  "不死":   "戦闘でHPが0になっても、そのカードにつき1回だけHP満タンで復活する。",
  "装甲":   "受けるダメージを1軽減する(攻撃時・被攻撃時どちらでも)。",
  "毒":     "1点でもダメージを与えれば、相手のHPに関係なく即座に撃破する。",
  "守護":   "このカードがいるレーンには「飛行」の攻撃も直接攻撃にならず、必ずこのカードと戦闘する。",
  "魂収集": "このカードが倒された時、持ち主が獲得する魂が(通常の1個ではなく)2個になる。",
  "供物":   "このカードを生け贄として捧げる場合、1体で生け贄2体分として扱われる。",
  "貫通":   "余ったダメージをプレイヤーにも与える。",
  "2連撃":  "同じターンに2回攻撃する。",
  "召喚時": "場に出た時に効果を発動する。",
  "魂喰らい": "戦闘で敵モンスターを倒した時、持ち主が魂を1獲得する。",
  "知識":   "場に出た時、山札の一番上を手札に加える(手札が上限の場合は発動しない)。"
};

// デッキ編成のデフォルト枚数(各カードid: 枚数)。プレイヤーはこれを基準に編成できる。
const DEFAULT_DECK_COUNTS = {
  slime: 2, ghost: 2, skeleton: 2, orc: 2,
  zombie: 2, golem: 2, viper: 2, knight: 2
};

// 敵AI専用のデッキ枚数設定。プレイヤーのデフォルト編成(DEFAULT_DECK_COUNTS)には手を加えない。
// 前回の編成は強力な高コストカードに寄せすぎて、序盤に弱いモンスターを並べられるだけで
// 対処しきれない(除去・壁が足りない)という問題があったため、
// 「毒ヘビ」(何でも1発で倒せる汎用除去)や「守護」持ち(盾の騎士・鉄壁の守護者)、
// 「装甲」持ち(鎧ゴーレム)を増やして序盤〜中盤の対応力を底上げし、
// 代わりにデーモン・破城槌など最上位コストのカードは1枚に絞って枚数を空けた。
const AI_DECK_COUNTS = {
  slime: 1, ghost: 1, skeleton: 3, orc: 2,
  zombie: 1, golem: 2, viper: 3, knight: 2,
  demon: 1, necromancer: 1, ram: 1, berserker: 2,
  lamb: 1, ghoul: 1, guardian: 1, reaper: 1, duelist: 1,
  souleater: 1, seer: 1
};

// 1枚のカードidから何枚デッキに入れられるか
const MAX_COPIES_PER_CARD = 3;
const DECK_MIN_SIZE = 10;
const DECK_MAX_SIZE = 27;

// デッキ枚数設定(オブジェクト {id: 枚数}) からidの配列を作る
function countsToDeckIds(counts){
  const ids = [];
  Object.keys(counts).forEach(id=>{
    for(let i=0;i<counts[id];i++) ids.push(id);
  });
  return ids;
}
