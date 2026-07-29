
const CARD_MASTER = [
  { id:'slime', name:'スライム', soul:1, atk:1, maxHp: 0,
        hp:2, abilities:[] },
  { id:'skeleton', name:'スケルトン', soul:1, atk:2, hp:1, abilities:[] },
  { id:'ghost', name:'ゴースト', soul:1, atk:1, hp:1, abilities:['飛行'] },
  { id:'bat', name:'コウモリ', soul:1, atk:1, hp:1, abilities:['飛行','速攻'] },
  { id:'watchdog', name:'番犬', soul:2, atk:2, hp:3, abilities:['守護'] },
  { id:'golem', name:'石のゴーレム', soul:2, atk:1, hp:4, abilities:['装甲'] },
  { id:'zombie', name:'ゾンビ', soul:1, atk:2, hp:2, abilities:['毒'] },
  { id:'revenant', name:'蘇る屍鬼', soul:2, atk:2, hp:2, abilities:['不死'] },
  { id:'sheep', name:'生贄の羊', soul:1, atk:1, hp:1, abilities:['供物'] }
];

const START_DECK = [];
for (const card of CARD_MASTER) {
  START_DECK.push(card.id);
  START_DECK.push(card.id);
}
while (START_DECK.length < 30) START_DECK.push('slime');
