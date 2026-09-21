
// カードの原本データ(idはscript.jsのmakeCard()が参照するので必須)
// icon は画像素材が無いカード用のテキスト表示。image を指定すると、そのカードは
// 画像(images/フォルダ内のファイル)で表示される。両方無い場合は名前のみ表示。
// reap: 「使役」能力持ちカード専用。戦闘で敵モンスターを倒した時に手札に加えるカードのidを指定する
// (例: ネクロマンサーは reap:"skeleton" → 撃破するたびにスケルトンが手札に加わる)。
// 将来「使役」持ちの新カードを追加する際は、このreapに欲しいカードのidを指定するだけでよい。
// onDeath: 「献血」能力持ちカード専用。このカード自身が死亡した時(戦闘・生け贄どちらでも)に
// 手札に加えるカードのidを指定する(例: 生け贄の子羊は onDeath:"bloodvial" → 死ぬと血の小瓶が手札に加わる)。
const CARD_MASTER = [
  { id: "slime",    name: "スライム",     icon: "", image: "images/slime.jpg", atk: 1, hp: 2, sacrifice: 0, soul: 1, abilities: [] },
  { id: "ghost",    name: "ゴースト",     icon: "", image: "images/ghost.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["飛行"] },
  { id: "skeleton", name: "スケルトン",   icon: "", image: "images/skeleton.jpg", atk: 2, hp: 1, sacrifice: 0, soul: 1, abilities: [] },
  { id: "orc",      name: "オーク",       icon: "", image: "images/orc.jpg", atk: 3, hp: 2, sacrifice: 1, soul: 1, abilities: [] },
  { id: "zombie",   name: "ゾンビ",       icon: "", image: "images/zombie.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 2, abilities: ["不死"] },
  { id: "golem",    name: "鎧ゴーレム",   icon: "", image: "images/golem.jpg", atk: 2, hp: 3, sacrifice: 0, soul: 3, abilities: ["毒無効"] },
  { id: "viper",    name: "毒ヘビ",       icon: "", image: "images/viper.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["毒"] },
  { id: "knight",   name: "盾の騎士",     icon: "", image: "images/knight.jpg", atk: 1, hp: 4, sacrifice: 0, soul: 2, abilities: ["守護"] },
  { id: "demon",    name: "デーモン",     icon: "", image: "images/demon.jpg", atk: 5, hp: 4, sacrifice: 2, soul: 3, abilities: ["貫通","召喚時"] },
  { id: "necromancer", name: "ネクロマンサー", icon: "", image: "images/necromancer.jpg", atk: 2, hp: 3, sacrifice: 1, soul: 4, abilities: ["召喚時","使役"], reap: "skeleton" },
  { id: "ram",      name: "破城槌",       icon: "", image: "images/ram.jpg", atk: 4, hp: 2, sacrifice: 1, soul: 2, abilities: ["貫通"] },
  { id: "berserker", name: "バーサーカー", icon: "", image: "images/berserker.jpg", atk: 2, hp: 2, sacrifice: 1, soul: 2, abilities: ["2連撃"] },
  // ---- 新規カード5種(既存カード・既存ルールは変更せず追加のみ) ----
  // 「供物」「魂収集」は元々ABILITY_INFOに定義済みだが、これまでどのカードも持っていなかった能力。
  // 新カードで初めて実際に使用する。
  { id: "lamb",     name: "生け贄の子羊", icon: "🐑", image: "images/lamb.jpg", atk: 1, hp: 1, sacrifice: 0, soul: 1, abilities: ["供物","献血"], onDeath: "bloodvial" },
  // 「血の小瓶」は生け贄の子羊の「献血」で手に入る専用カード。画像素材は無いのでicon表示。
  // 攻撃力0・HP1で、戦闘での活躍は期待せず「生け贄に捧げるためだけ」に存在する低コストカード。
  { id: "bloodvial", name: "血の小瓶",     icon: "🩸", atk: 0, hp: 1, sacrifice: 0, soul: 1, abilities: [] },
  // 【バランス調整】バーサーカー(atk2/hp2/soul2/2連撃)と全く同じコストなのに、
  // 「魂収集」は死んだ時に魂+1されるだけの受け身な能力で、「2連撃」(実質倍打点)より
  // 明らかに弱く割に合っていなかったため、HPを3に上げて生存力で差別化した。
  { id: "ghoul",    name: "墓守りのグール", icon: "👻", image: "images/ghoul.jpg", atk: 2, hp: 3, sacrifice: 0, soul: 2, abilities: ["魂収集"] },
  { id: "guardian", name: "鉄壁の守護者", icon: "🛡️", image: "images/guardian.jpg", atk: 2, hp: 5, sacrifice: 1, soul: 3, abilities: ["守護","装甲"] },
  { id: "reaper",   name: "死神",         icon: "💀", image: "images/reaper.jpg", atk: 3, hp: 4, sacrifice: 1, soul: 3, abilities: ["毒","貫通"] },
  { id: "duelist",  name: "双剣の傭兵",   icon: "⚔️", atk: 3, hp: 1, sacrifice: 0, soul: 4, abilities: ["2連撃"] },
  // ---- 追加カード2種(「魂喰らい」「知識」の新能力お披露目用) ----
  // 【バランス調整】鎧ゴーレム(atk2/hp3/毒無効/soul3)と全く同じ素の数値(atk2/hp3)なのに
  // ソウルイーターは soul2 と1安く、さらに攻撃的に強い能力(魂喰らい)まで付いていて
  // コスト対性能が明らかに突出していたため、鎧ゴーレムと同じsoul3に引き上げて揃えた。
  { id: "souleater", name: "ソウルイーター", icon: "👹", atk: 2, hp: 3, sacrifice: 0, soul: 3, abilities: ["魂喰らい"] },
  { id: "seer",       name: "予言者",         icon: "🔮", atk: 1, hp: 2, sacrifice: 0, soul: 2, abilities: ["知識"] },
  // ---- 追加カード1種(2体目の「飛行」持ち) ----
  { id: "harpy",      name: "ハーピー",       icon: "🦅", atk: 3, hp: 2, sacrifice: 0, soul: 3, abilities: ["飛行"] },
  // ---- 追加カード1種(新能力「身代わり」お披露目用。レーンを問わず直接攻撃を受け止める壁役) ----
  // 【バランス調整】守護1体のみを止める盾の騎士(sac0/soul2)や鉄壁の守護者(sac1/soul3)と比べ、
  // 「身代わり」はレーンを問わず直接攻撃を止められる代わりに攻撃力0と割高すぎたため、
  // soulコストを4→3に引き下げ、鉄壁の守護者と同水準にした(HP6の高耐久はそのまま維持)。
  { id: "wallgiant",  name: "肉壁の巨兵",     icon: "🗿", atk: 0, hp: 6, sacrifice: 1, soul: 3, abilities: ["身代わり"] },
  // ---- 追加カード1種(新能力「断末魔」お披露目用。安価な使い捨て身代わり役) ----
  // 肉壁の巨兵(atk0/hp6/sac1/soul3)より薄く壊れやすい代わりに、死んだ時にカードを1枚引ける
  // ので、攻撃を受け止めてすぐ退場しても損をしにくい「使い捨ての壁」として運用できる。
  // 【バランス調整】soul2→1に引き下げ、序盤(魂が少ないうち)から出せる安価な壁として使えるようにした。
  { id: "decoydoll",  name: "囮人形",         icon: "🪆", atk: 0, hp: 2, sacrifice: 0, soul: 1, abilities: ["身代わり","断末魔"] },
  // ---- 追加カード1種(猫娘) ----
  // 「速攻」は新規能力。召喚したターンでも1列目が空いていればすぐ攻撃に参加できるため、
  // 通常なら1ターン待たされる召喚酔いをスキップできる強力な効果。そのため単体の
  // ステータスはあえて低めに抑え(atk2/hp2)、召喚コストも(当時の)berserker(atk2/hp2/soul2)と
  // 同水準の低コストに設定。長期戦向けの高ステータス枠ではなく、
  // 「安く出して即座に殴りに行く」早期テンポ用のカードという位置づけ。
  // (その後berserkerは生け贄コスト1に調整されたため、現在は猫娘の方が軽いコストになっている)
  { id: "catgirl",   name: "猫娘",           icon: "🐾", image: "images/catgirl.jpg", atk: 2, hp: 2, sacrifice: 0, soul: 2, abilities: ["速攻"] }
];

// ==================== 魔法カード ====================
// モンスターカードとは違い「場に出す」のではなく、使った瞬間に効果を発動して
// 即座に墓地へ送られる(場に留まらない)特殊なカード。
// type:'spell' で判別する。target は対象の選び方:
//   'ally'     … 自分の場のモンスター1体を対象に選ぶ
//   'allyBack' … 自分の場の「2列目」のモンスター1体を対象に選ぶ
//   'enemy'    … 相手の場のモンスター1体を対象に選ぶ
//   'none'     … 対象を選ばず、手札からタップした瞬間に即発動する
// effect は実際の処理内容(applySpellEffectで分岐)、value は効果の数値。
const SPELL_MASTER = [
  { id: "elixir", name: "強化の秘薬", icon: "🧪", type: "spell", effect: "buff",
    target: "ally", soul: 2, sacrifice: 0, abilities: [],
    value: { atk: 2, hp: 1 },
    desc: "自分のモンスター1体をATK+2/HP+1(永続)" },
  { id: "flashstep", name: "電光石火", icon: "⚡", type: "spell", effect: "rush",
    target: "allyBack", soul: 1, sacrifice: 0, abilities: [],
    desc: "自分の2列目のモンスター1体を、召喚したターンでもすぐさま1列目(攻撃エリア)へ移動させる" },
  { id: "fireball", name: "火炎弾", icon: "🔥", type: "spell", effect: "damage",
    target: "enemy", soul: 2, sacrifice: 0, abilities: [],
    value: 3,
    desc: "敵モンスター1体に3ダメージ(装甲などの軽減あり)" },
  // 【バランス調整/バグ修正】soul(発動コスト)が0だったため「1枚のカードを使うだけで
  // 完全に無償で魂+3」になってしまっており、コストとリターンが釣り合っていなかった。
  // 一度はsoul1に変更したが、初手から生け贄なしでバーサーカーへ繋げる動きが強すぎたため
  // 生け贄コスト1を追加。そのうえで、生け贄コストだけでコストとして十分と判断し、
  // soulコストは0に戻した(「場にいるモンスター1体を捧げて魂+3(実質、生け贄が魂3に変わる)」
  // というシンプルなカードになった)。
  { id: "soulsurge", name: "魂の奔流", icon: "🌀", type: "spell", effect: "soulGain",
    target: "none", soul: 0, sacrifice: 1, abilities: [],
    value: 3,
    desc: "自分のモンスター1体を生け贄に捧げ、使った瞬間に魂を+3する" }
];
CARD_MASTER.push(...SPELL_MASTER);

// 各能力の説明文(能力一覧モーダルで表示)
const ABILITY_INFO = {
  "飛行":   "相手の場に「守護」がいなければ、他のカードを無視して相手プレイヤーに直接攻撃できる。",
  "不死":   "戦闘でHPが0になった時、または生け贄に選ばれた時、そのカードにつき1回だけHP満タンで復活する(生け贄に選ばれた場合、生け贄コストとしてはきちんと使えるが、実際には場に残る)。一度この能力を使い切った(revived)後は、通常のカードと同じように戦闘で死んだり生け贄で場を離れたりする。",
  "装甲":   "受けるダメージを1軽減する(攻撃時・被攻撃時どちらでも)。",
  "毒":     "1点でもダメージを与えれば、相手のHPに関係なく即座に撃破する。",
  "毒無効": "相手の「毒」による即死効果を受けない(通常通りダメージ計算でHPが減るだけになる)。",
  "守護":   "このカードがいるレーンには「飛行」の攻撃も直接攻撃にならず、必ずこのカードと戦闘する。",
  "魂収集": "このカードが倒された時、持ち主が獲得する魂が(通常の1個ではなく)2個になる。",
  "供物":   "このカードを生け贄として捧げる場合、1体で生け贄2体分として扱われる。",
  "速攻":   "召喚したターンでも、レーンの1列目(攻撃エリア)が空いていればすぐそこへ移動し、召喚したターンから攻撃に参加できる(1列目が埋まっている場合は他のカードと同じく2列目で待機する)。",
  "貫通":   "余ったダメージをプレイヤーにも与える。",
  "2連撃":  "同じターンに2回攻撃する。",
  "召喚時": "場に出た時に効果を発動する。",
  "魂喰らい": "戦闘で敵モンスターを倒した時、持ち主が魂を1獲得する。",
  "知識":   "場に出た時、山札の一番上を手札に加える(手札が上限の場合は発動しない)。",
  "使役":   "戦闘で敵モンスターを倒した時、専用のカードを1枚手札に加える(手札が上限の場合は発動しない)。",
  "身代わり": "このカードが1列目(攻撃エリア)にいる間、相手のどのレーンからの直接攻撃も、代わりにこのカードが受ける。ただし、このカードが「守護」を持っていない場合、「飛行」の攻撃だけは素通りして直接プレイヤーに命中する。",
  "断末魔": "このカードが死んだ(戦闘・生け贄などで墓地に送られた)時、持ち主が山札の一番上を1枚手札に加える(手札が上限の場合は発動しない)。",
  "献血":   "このカードが死んだ(戦闘・生け贄などで墓地に送られた)時、持ち主に専用のカードが1枚手札に加わる(手札が上限の場合は発動しない)。"
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
// 「毒無効」持ち(鎧ゴーレム、毒ヘビ・死神の即死を無効化できる壁役)を増やして序盤〜中盤の対応力を底上げし、
// 代わりにデーモン・破城槌など最上位コストのカードは1枚に絞って枚数を空けた。
//
// 【バグ修正】AI同士の自己対戦シミュレーションで統計を取ったところ、合計枚数が37枚になっており
// プレイヤーのデッキ上限(DECK_MAX_SIZE=27)を大きく超えていたことが判明(新カードを追加するたびに
// 1枚ずつ積み増され、誰も合計を数え直していなかったのが原因)。AIだけ山札が尽きにくく実質的に
// 有利になっていたため、27枚に収まるよう調整した。毒ヘビ・盾の騎士・鎧ゴーレムの厚みは維持しつつ、
// 影響の小さいカード(生け贄の子羊・予言者・双剣の傭兵・強化の秘薬)を削り、
// 他の重複枠(スケルトン・オーク・バーサーカー・囮人形・猫娘)も2→1に整理した。
// 今後カードを追加する際は、必ず合計が27枚を超えていないか確認すること。
const AI_DECK_COUNTS = {
  slime: 1, ghost: 1, skeleton: 1, orc: 1,
  zombie: 1, golem: 2, viper: 3, knight: 2,
  demon: 1, necromancer: 1, ram: 1, berserker: 1,
  ghoul: 1, guardian: 1, reaper: 1,
  souleater: 1, harpy: 1, wallgiant: 1, decoydoll: 1,
  flashstep: 1, fireball: 1, soulsurge: 1, catgirl: 1
};

// 1枚のカードidから何枚デッキに入れられるか
const MAX_COPIES_PER_CARD = 3;
const DECK_MIN_SIZE = 10;
const DECK_MAX_SIZE = 27;

// 手札の上限枚数(元は5枚だったが、魔法カード追加に伴い手札を持ちやすいよう8枚に拡張)
const HAND_LIMIT = 8;

// デッキ枚数設定(オブジェクト {id: 枚数}) からidの配列を作る
function countsToDeckIds(counts){
  const ids = [];
  Object.keys(counts).forEach(id=>{
    for(let i=0;i<counts[id];i++) ids.push(id);
  });
  return ids;
}
