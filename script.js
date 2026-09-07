const state = {
  turn: 1,
  phase: 'draw',
  active: 'player',
  logs: [],
  selectedHand: null,
  sacrificeTargets: [],
  deckCounts: {},
  player: null,
  enemy: null,
  locked: false // ターン切り替え演出中などに操作を止めるためのフラグ
};

const $ = id => document.getElementById(id);

function show(id){
  document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
  $(id).classList.add('active');
}

function log(msg){
  state.logs.unshift(msg);
  state.logs = state.logs.slice(0,30);
  $('log-list').innerHTML = state.logs.map(x=>`<li>${x}</li>`).join('');
}

// ==== 一時的なメッセージ表示(操作できない理由をすぐに伝える) ====
let toastTimer = null;
function toast(msg){
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{
    el.classList.remove('show');
    el.classList.add('hidden');
  }, 1600);
}

// ==== 簡易サウンド(WebAudio、素材不要のビープ音) ====
let audioCtx = null;
function initAudio(){
  if(audioCtx) return;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }catch(e){
    audioCtx = null;
  }
}
function playSound(type){
  if(!audioCtx) return;
  const freqs = { summon:440, attack:260, sacrifice:180, win:660, lose:110 };
  const freq = freqs[type] || 330;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type==='lose' ? 'sawtooth' : 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.35);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime+0.35);
}

// ==== ターン表示バナー(「あなたのターン」「敵のターン」を中央に大きく表示) ====
let turnBannerHideTimer = null;
let turnBannerCleanupTimer = null;
function showTurnBanner(text){
  const el = $('turn-banner');
  clearTimeout(turnBannerHideTimer);
  clearTimeout(turnBannerCleanupTimer);
  el.textContent = text;
  el.classList.remove('hidden');
  // 一度リフローさせてからshowを付けることでアニメーションを確実に発火させる
  requestAnimationFrame(()=>{
    el.classList.add('show');
  });
  turnBannerHideTimer = setTimeout(()=>{
    el.classList.remove('show');
    turnBannerCleanupTimer = setTimeout(()=>{ el.classList.add('hidden'); }, 250);
  }, 800);
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function cardName(id){
  const c = CARD_MASTER.find(c=>c.id===id);
  return c ? c.name : id;
}

function makeCard(id){
  const base = CARD_MASTER.find(c=>c.id===id);
  return {
    uid: Math.random().toString(36).slice(2),
    ...base,
    currentHp: base.hp,
    summonedThisTurn: true,
    attacked: false,
    revived: false
  };
}

const FIELD_LANES = 4;
const FIELD_SLOTS = 8;
const FRONT_START = 0;
const BACK_START = 4;
const MAX_FIELD_CARDS = 4;

function frontIndex(lane){ return lane; }
function backIndex(lane){ return BACK_START + lane; }
function rowOf(index){ return index < BACK_START ? 'front' : 'back'; }
function laneOf(index){ return index < BACK_START ? index : index - BACK_START; }
function fieldCount(owner){ return owner.field.filter(Boolean).length; }

// 2列目は完全な召喚待機エリアなので、攻撃側・防御側どちらの処理でも
// 2列目のモンスターは一切参照しない(攻撃対象にもならないし、攻撃もしない)。
function targetForAttack(owner, lane, flying=false){
  const front = owner.field[frontIndex(lane)];

  if(flying){
    // 飛行は正面(1列目)に「守護」がいる時だけ足止めされる。2列目の守護は無視。
    if(front && hasAbility(front,'守護')) return {card:front,index:frontIndex(lane)};
    return null;
  }

  // 通常攻撃は同レーンの1列目だけを見る。1列目が空いていれば2列目がいてもプレイヤーを攻撃する。
  if(front) return {card:front,index:frontIndex(lane)};
  return null;
}

// ターン終了時などに呼び、2列目のモンスターを同じレーンの1列目へ移動させる。
// 1列目が空いているレーンだけ移動し、埋まっているレーンはそのまま2列目に残す
// (次にそのレーンの1列目が空いたタイミングで、次回このゲームがadvanceRowを呼んだ時に移動する)。
function advanceRow(owner, ownerLabel){
  for(let lane=0; lane<FIELD_LANES; lane++){
    const f = frontIndex(lane), b = backIndex(lane);
    const backCard = owner.field[b];
    if(backCard && !owner.field[f]){
      owner.field[f] = backCard;
      owner.field[b] = null;
      backCard.summonedThisTurn = false;
      log(`${ownerLabel}の「${backCard.name}」が1列目へ移動し、攻撃可能になった`);
    }
  }
}

function fieldSlots(owner){
  return owner.field.map((c,index)=>({c,index})).filter(x=>x.c);
}

function createPlayer(deckIds){
  const deck = shuffle(deckIds).map(makeCard);
  const hand = [];
  for(let i=0;i<3;i++) hand.push(deck.pop());
  return {
    hp:20,
    soul:0,
    deck,
    hand,
    field:Array(8).fill(null),
    grave:[]
  };
}

// ==================== デッキ編成画面 ====================
function renderDeckBuilder(){
  $('deck-min').textContent = DECK_MIN_SIZE;
  $('deck-max').textContent = DECK_MAX_SIZE;

  $('deck-list').innerHTML = CARD_MASTER.map(card=>{
    const count = state.deckCounts[card.id] || 0;
    const sacText = card.sacrifice>0 ? ` / 生け贄${card.sacrifice}` : '';
    return `
      <div class="deck-row">
        ${card.image ? `<img class="deck-row-thumb" src="${card.image}" alt="${card.name}">` : ''}
        <div class="deck-row-info">
          <span class="name">${card.name}</span>
          <span class="stats">ATK${card.atk}/HP${card.hp}/魂${card.soul}${sacText}</span>
          <div class="abilities">${card.abilities.map(a=>`<span class="badge">${a}</span>`).join('')}</div>
        </div>
        <div class="stepper">
          <button data-dec="${card.id}">−</button>
          <span class="count">${count}</span>
          <button data-inc="${card.id}">＋</button>
        </div>
      </div>
    `;
  }).join('');

  const total = Object.values(state.deckCounts).reduce((a,b)=>a+b,0);
  $('deck-total').textContent = total;
  $('btn-deck-confirm').disabled = (total < DECK_MIN_SIZE || total > DECK_MAX_SIZE);

  $('deck-list').querySelectorAll('[data-inc]').forEach(btn=>{
    btn.onclick=()=>{
      const id = btn.dataset.inc;
      const cur = state.deckCounts[id] || 0;
      const totalNow = Object.values(state.deckCounts).reduce((a,b)=>a+b,0);
      if(cur >= MAX_COPIES_PER_CARD){ toast(`「${cardName(id)}」は最大${MAX_COPIES_PER_CARD}枚まで`); return; }
      if(totalNow >= DECK_MAX_SIZE){ toast(`デッキは最大${DECK_MAX_SIZE}枚まで`); return; }
      state.deckCounts[id] = cur + 1;
      renderDeckBuilder();
    };
  });
  $('deck-list').querySelectorAll('[data-dec]').forEach(btn=>{
    btn.onclick=()=>{
      const id = btn.dataset.dec;
      const cur = state.deckCounts[id] || 0;
      if(cur<=0) return;
      state.deckCounts[id] = cur - 1;
      renderDeckBuilder();
    };
  });
}

// ==================== 能力一覧モーダル ====================
function renderGlossary(){
  $('glossary-list').innerHTML = Object.keys(ABILITY_INFO).map(name=>`
    <li><b>${name}</b> — ${ABILITY_INFO[name]}</li>
  `).join('');
}
function openGlossary(){
  renderGlossary();
  $('glossary-modal').classList.remove('hidden');
}
function closeGlossary(){
  $('glossary-modal').classList.add('hidden');
}

// ==================== ゲーム開始／終了 ====================
function startGame(playerDeckIds){
  state.turn=1;
  state.phase='draw';
  state.active='player';
  state.logs=[];
  state.selectedHand=null;
  state.sacrificeTargets=[];
  state.locked=false;

  state.player=createPlayer(playerDeckIds);
  state.enemy=createPlayer(countsToDeckIds(AI_DECK_COUNTS));

  show('game-screen');
  log('ゲーム開始');
  render();
  showTurnBanner('あなたのターン');
}

function endGame(result){
  const title = $('result-title');
  const desc = $('result-desc');
  if(result==='win'){
    title.textContent = '勝利！';
    desc.textContent = '敵プレイヤーのHPを0にした！';
    playSound('win');
  }else if(result==='deckout'){
    title.textContent = '敗北…';
    desc.textContent = '山札が切れてしまった…';
    playSound('lose');
  }else{
    title.textContent = '敗北…';
    desc.textContent = 'HPが0になってしまった…';
    playSound('lose');
  }
  show('result-screen');
}

// ==================== 描画 ====================
// mode: 'field' = 場の正方形マス用(名前は省略しATK/HPのみ), 'hand' = 手札の正方形マス用(名前・魂コストも表示)
function renderCard(card, {mode='field', extraClass='', dataAttr='', waiting=false}={}){
  const isHand = mode==='hand';
  const abilitiesHtml = card.abilities.map(a=>`<span class="badge">${a}</span>`).join('');
  const waitBadge = waiting ? '<span class="badge wait-badge">待機中</span>' : '';
  const cls = `card${card.image?' has-art':''}${extraClass?` ${extraClass}`:''}`;

  if(card.image){
    if(isHand){
      // 手札の正方形マス用:画像いっぱいに敷き詰め、上に名前・下にATK/HPと魂コストを重ねる
      const soulLine = `魂${card.soul}${card.sacrifice>0?`/贄${card.sacrifice}`:''}`;
      return `
        <div class="${cls}" ${dataAttr} style="background-image:url('${card.image}')">
          <div class="card-name-ribbon">${card.name}</div>
          <div class="card-overlay">
            <div class="stats-mini">ATK${card.atk}/HP${card.currentHp} ${soulLine}</div>
            <div class="abilities">${abilitiesHtml}</div>
          </div>
        </div>
      `;
    }
    // 場の正方形マス用:画像を敷き詰めて、下部にATK/HPと能力だけ重ねて表示
    return `
      <div class="${cls}" ${dataAttr} style="background-image:url('${card.image}')">
        <div class="card-overlay">
          <div class="stats-mini">ATK ${card.atk} / HP ${card.currentHp}</div>
          <div class="abilities">${abilitiesHtml}${waitBadge}</div>
        </div>
      </div>
    `;
  }
  // 画像が無いカード:場・手札どちらも同じ正方形の中に名前+ステータスを小さく収める
  return `
    <div class="${cls}" ${dataAttr}>
      <div class="name"><span class="icon">${card.icon||''}</span>${card.name}</div>
      <div class="stats">ATK ${card.atk} / HP ${card.currentHp}</div>
      <div class="stats">魂 ${card.soul}${card.sacrifice>0?` / 生け贄${card.sacrifice}`:''}</div>
      <div class="abilities">${abilitiesHtml}${waitBadge}</div>
    </div>
  `;
}

function renderField(targetId, owner, enemy=false){
  const attackRow = {label:'1列目：攻撃エリア', start:FRONT_START, isBack:false};
  const summonRow = {label:'2列目：召喚エリア', start:BACK_START, isBack:true};
  // 相手側だけ表示順を入れ替え、召喚エリアを上・攻撃エリアを下(=ターン表示バーに近い側)にする。
  // これにより画面中央で相手の攻撃エリアと自分の攻撃エリアが向かい合う形になり、盤面が見やすくなる。
  const rows = enemy ? [summonRow, attackRow] : [attackRow, summonRow];
  // 自分の場で、今まさに手札のモンスターを召喚できる状態かどうか
  const selecting = !enemy && state.phase==='main' && !state.locked && !!state.selectedHand;
  const selectedCard = selecting ? state.player.hand.find(c=>c.uid===state.selectedHand) : null;
  const isSacrificing = !!(selectedCard && selectedCard.sacrifice>0);

  $(targetId).innerHTML = rows.map(row=>{
    const cells = Array.from({length:FIELD_LANES},(_,lane)=>{
      const index = row.start + lane;
      const card = owner.field[index];
      let cls = enemy ? 'lane enemy-lane' : 'lane player-lane';
      cls += row.isBack ? ' back-row' : ' front-row';
      if(!enemy && state.sacrificeTargets.includes(index)) cls += ' sac-selected';

      if(!card){
        // 空きマス:2列目は召喚可能、1列目は召喚不可(移動でしか埋まらない)
        if(!enemy && row.isBack){
          cls += ' slot-empty summonable-slot';
          const label = (selecting && !isSacrificing) ? 'ここに召喚' : '空き(召喚エリア)';
          return `<div class="${cls}" data-slot="${index}">${label}</div>`;
        }
        cls += ' slot-empty not-summonable';
        return `<div class="${cls}" data-slot="${index}">空き<br>(召喚不可)</div>`;
      }

      const waiting = row.isBack; // 2列目にいる間は常に攻撃不可・被攻撃不可
      return `<div class="${cls}${waiting?' back-safe':''}" data-slot="${index}">${renderCard(card, {mode:'field', waiting})}</div>`;
    }).join('');
    return `<div class="field-row ${row.isBack?'summon-row':'attack-row'}"><div class="row-label">${row.label}</div><div class="lanes">${cells}</div></div>`;
  }).join('');
}
function renderHand(){
  $('hand').innerHTML = state.player.hand.map(card=>renderCard(card, {
    mode: 'hand',
    extraClass: state.selectedHand===card.uid ? 'selected' : '',
    dataAttr: `data-hand="${card.uid}"`
  })).join('');

  document.querySelectorAll('[data-hand]').forEach(el=>{
    el.onclick=()=>{
      if(state.locked) return; // 敵ターン演出中は手札を操作できないようにする
      const uid = el.dataset.hand;
      if(state.selectedHand===uid){
        state.selectedHand=null;
        state.sacrificeTargets=[];
      }else{
        state.selectedHand=uid;
        state.sacrificeTargets=[];
        const card = state.player.hand.find(c=>c.uid===uid);
        if(card && card.sacrifice>0){
          toast(`生け贄が${card.sacrifice}体必要です`);
        }else{
          log('召喚するレーンをタップ');
        }
      }
      render();
    };
  });
}

// 「供物」を持つカードは1体で生け贄2体分として数える(プレイヤー・AI共通で使う)
function sacrificeUnitValue(card){
  return hasAbility(card, '供物') ? 2 : 1;
}
function sacrificeValue(lanes, owner){
  return lanes.reduce((sum, l)=>{
    const c = owner.field[l];
    if(!c) return sum;
    return sum + sacrificeUnitValue(c);
  }, 0);
}

// AIが生け贄を選ぶ処理(HPが低い順に、必要な価値を満たすまで選ぶ)。
// 「見積もり(何体生け贄になるか)」と「実際に生け贄を捧げる処理」の両方で
// この関数を使うことで、2箇所の処理がズレて場の上限チェックが狂うのを防ぐ。
function pickSacrifices(owner, excludeIndex, neededValue){
  const candidates = fieldSlots(owner)
    .filter(o=>o.index!==excludeIndex)
    .sort((a,b)=>a.c.currentHp-b.c.currentHp);
  const chosen = [];
  let value = 0;
  for(const cand of candidates){
    if(value>=neededValue) break;
    chosen.push(cand);
    value += sacrificeUnitValue(cand.c);
  }
  return { chosen, value, enough: value>=neededValue };
}

function updateSacrificeBanner(){
  const banner = $('sacrifice-banner');
  const card = state.selectedHand ? state.player.hand.find(c=>c.uid===state.selectedHand) : null;
  if(!card || card.sacrifice<=0){
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  const value = sacrificeValue(state.sacrificeTargets, state.player);
  banner.textContent = `生け贄 ${value} / ${card.sacrifice} 選択中(自分の場のカードをタップして選択→空きマスをタップで召喚)`;
}

function render(){
  $('player-hp').textContent=state.player.hp;
  $('enemy-hp').textContent=state.enemy.hp;
  $('player-soul').textContent=state.player.soul;
  $('enemy-soul').textContent=state.enemy.soul;
  $('player-deck').textContent=state.player.deck.length;
  $('enemy-deck').textContent=state.enemy.deck.length;
  const playerFieldCount = fieldCount(state.player);
  const enemyFieldCount = fieldCount(state.enemy);
  const pfc = $('player-field-count');
  const efc = $('enemy-field-count');
  if(pfc) pfc.textContent = `場 ${playerFieldCount} / ${MAX_FIELD_CARDS}`;
  if(efc) efc.textContent = `場 ${enemyFieldCount} / ${MAX_FIELD_CARDS}`;
  $('turn-label').textContent=`ターン ${state.turn}`;
  $('phase-label').textContent=state.phase==='draw'?'ドロー':'メイン';
  const activeLabel = $('active-label');
  const isEnemyActive = state.locked || state.active==='enemy';
  activeLabel.textContent = isEnemyActive ? '敵の番' : 'あなたの番';
  activeLabel.classList.toggle('is-enemy', isEnemyActive);

  renderField('enemy-lanes', state.enemy, true);
  renderField('player-lanes', state.player);
  renderHand();
  updateSacrificeBanner();

  // ドロー/死体を漁るはどちらか1回のみ、ターン切り替え演出中は全操作を止める
  $('btn-draw').disabled = state.phase!=='draw' || state.locked;
  $('btn-scavenge').disabled = state.phase!=='draw' || state.locked;
  $('btn-end').disabled = state.phase!=='main' || state.locked;

  document.querySelectorAll('.player-lane').forEach(el=>{
    el.onclick=()=>onPlayerLane(Number(el.dataset.slot));
  });
}

// ==================== プレイヤー操作 ====================
function onPlayerLane(slot){
  if(state.locked) return;
  if(state.phase!=='main'){
    toast('ドローかスカベンジを先に行ってください');
    return;
  }
  if(!state.selectedHand) return;

  const idx = state.player.hand.findIndex(c=>c.uid===state.selectedHand);
  if(idx===-1) return;
  const card = state.player.hand[idx];
  const occupied = !!state.player.field[slot];

  if(occupied){
    if(card.sacrifice<=0) return;
    if(state.sacrificeTargets.includes(slot)){
      state.sacrificeTargets = state.sacrificeTargets.filter(l=>l!==slot);
    }else{
      const currentValue = sacrificeValue(state.sacrificeTargets, state.player);
      if(currentValue>=card.sacrifice){
        toast('生け贄はもう十分選んでいます');
        return;
      }
      state.sacrificeTargets.push(slot);
    }
    render();
    return;
  }

  if(rowOf(slot)!=='back'){
    toast('モンスターは2列目(召喚エリア)にのみ召喚できます');
    return;
  }
  // 生け贄で場のカードが減る分は先に差し引いてから4体制限を判定する。
  // (そうしないと、場が4体の時に「1体を生け贄にして別の1体を出す」入れ替えができなくなってしまう)
  const projectedFieldCount = fieldCount(state.player) - state.sacrificeTargets.length;
  if(projectedFieldCount>=MAX_FIELD_CARDS){
    toast('場には4体までしか出せません');
    return;
  }
  if(card.sacrifice>0 && sacrificeValue(state.sacrificeTargets, state.player) < card.sacrifice){
    toast(`先に生け贄を${card.sacrifice}体選んでください`);
    return;
  }
  if(state.player.soul < card.soul){
    toast('魂が足りない');
    log('魂が足りない');
    return;
  }

  if(card.sacrifice>0){
    const sacrificedNames = [];
    state.sacrificeTargets.forEach(slot=>{
      const sacCard = state.player.field[slot];
      if(sacCard){
        state.player.field[slot]=null;
        state.player.grave.push(sacCard);
        const soulAmount = gainSoulOnDeath(sacCard, state.player);
        triggerOnDeath(sacCard, state.player, slot);
        sacrificedNames.push(sacCard.name);
        log(`生け贄「${sacCard.name}」で魂+${soulAmount}`);
      }
    });
    log(`「${sacrificedNames.join('」「')}」を生け贄に捧げた`);
    playSound('sacrifice');
  }

  state.player.soul -= card.soul;
  state.player.hand.splice(idx,1);
  state.player.field[slot]=card;
  state.selectedHand=null;
  state.sacrificeTargets=[];
  log(`「${card.name}」を${rowOf(slot)==='back'?'2列目':'1列目'}に召喚`);
  playSound('summon');
  triggerOnSummon(card, state.player, slot);
  render();
}
function drawCard(){
  if(state.locked) return;
  if(state.phase!=='draw') return;

  if(state.player.deck.length===0){
    endGame('deckout');
    return;
  }

  if(state.player.hand.length>=5){
    toast('手札上限です');
    log('手札上限');
    state.phase='main';
    render();
    return;
  }

  state.player.hand.push(state.player.deck.pop());
  state.phase='main';
  log('1枚ドロー');
  render();
}

function scavenge(){
  if(state.locked) return;
  if(state.phase!=='draw') return;
  state.player.soul += 1;
  state.phase='main';
  log('死体を漁って魂 +1');
  render();
}

// ==================== 召喚時／死亡時能力の土台 ====================
// 今はまだ何も発動しないが、将来「召喚時」に発動する能力を追加しやすいように
// カードを場に出すたびに必ずこの関数を通す。
function triggerOnSummon(card, owner, slot){
  if(!card || !Array.isArray(card.abilities)) return;
  card.abilities.forEach(ability=>{
    switch(ability){
      case '召喚時': {
        if(card.id==='necromancer' && fieldCount(owner)<MAX_FIELD_CARDS){
          // スケルトンも2列目にしか召喚できない
          const empty = owner.field.findIndex((c,idx)=>!c && rowOf(idx)==='back');
          if(empty!==-1){
            const skeleton = makeCard('skeleton');
            owner.field[empty]=skeleton;
            log(`${owner===state.player?'あなた':'敵'}の「ネクロマンサー」が「スケルトン」を召喚`);
          }
        }
        break;
      }
      default:
        break;
    }
  });
}

// 今はまだ何も発動しないが、将来「死亡時」に発動する能力を追加しやすいように
// カードが場から墓地に行くたびに必ずこの関数を通す(不死で復活した場合は呼ばれない)。
function triggerOnDeath(card, owner, lane){
  if(!card || !Array.isArray(card.abilities)) return;
  card.abilities.forEach(ability=>{
    switch(ability){
      // 例: case "死亡時に何かする": ここに処理を書く; break;
      default:
        break;
    }
  });
}

// ==================== 魂獲得・死亡処理 ====================
// 「魂収集」を持つカードは通常の1個ではなく2個の魂を持ち主に与える
function gainSoulOnDeath(card, owner){
  const amount = hasAbility(card, '魂収集') ? 2 : 1;
  owner.soul += amount;
  return amount;
}

// カードのHPが0以下になった時の処理(不死の復活 or 死亡)をowner/lane付きで一元管理する。
// これにより「誰の場のカードか」を取り違えるバグを防ぐ。
function resolveDeath(card, owner, lane){
  if(hasAbility(card, '不死') && !card.revived){
    card.currentHp = card.hp;
    card.revived = true;
    log(`「${card.name}」が不死で復活`);
    return;
  }
  owner.field[lane] = null;
  owner.grave.push(card);
  const amount = gainSoulOnDeath(card, owner);
  const who = (owner===state.player) ? 'あなた' : '敵';
  log(`「${card.name}」が倒れた(${who}の魂+${amount})`);
  triggerOnDeath(card, owner, lane);
}



// ==================== 敵AI ====================
// このゲームのルール(3レーン、2列目にしか召喚できない、召喚したターンは攻撃不可、
// 場は合計4体まで、ドロー/死体を漁るはどちらか1回、手札上限5、突進なし、など)は
// 一切変更しない。AIはその範囲内で「状況を見て少し賢く動く」ことだけを行う。
//
// 実装方針:
//  1. enemyChooseDrawOrScavenge : ドロー / 死体を漁る のどちらが良いかを状況から判断
//  2. evaluateSummonOption      : 手札のカード×召喚先レーンの組み合わせを評価してスコア化
//  3. pickSacrificesForAI       : 生け贄が必要な時、守護や毒など価値の高いカードを
//                                  なるべく残しつつ選ぶ
//  4. getAIAttackLaneOrder      : 攻撃を処理する順番を「より有利な攻撃から」に並べ替える
//                                  (このゲームは同じレーンの相手としか戦えないため、
//                                  順番を変えても勝敗そのものは変わらないが、確殺・貫通・
//                                  守護崩しなどを優先して処理する)
// 完全な最適解の計算は行わず、あくまで「今の場を見て有利な方を選ぶ」程度にとどめる。

// ---- 場のカード1体のおおよその強さを数値化する(評価の基準として使う) ----
function cardPower(card){
  let v = card.atk + card.currentHp*0.5;
  if(hasAbility(card,'守護')) v += 2;
  if(hasAbility(card,'毒')) v += 2;
  if(hasAbility(card,'貫通')) v += 1.5;
  if(hasAbility(card,'2連撃')) v += 2;
  if(hasAbility(card,'飛行')) v += 1;
  if(hasAbility(card,'装甲')) v += 1;
  if(hasAbility(card,'不死')) v += 1.5;
  if(hasAbility(card,'魂収集')) v += 0.5;
  return v;
}

// ---- 相手(attackerOwner)の飛行が直接攻撃できてしまう、defenderOwner側の危険レーン一覧 ----
// (そのレーンのdefenderOwner側1列目に守護がいなければ、飛行に直接攻撃される)
function flyingThreatLanes(defenderOwner, attackerOwner){
  const lanes = [];
  for(let lane=0; lane<FIELD_LANES; lane++){
    const atk = attackerOwner.field[frontIndex(lane)];
    if(atk && hasAbility(atk,'飛行')){
      const myFront = defenderOwner.field[frontIndex(lane)];
      if(!myFront || !hasAbility(myFront,'守護')) lanes.push(lane);
    }
  }
  return lanes;
}

// ---- ドロー / 死体を漁る の判断 ----
// プレイヤーと同じく、このターンはどちらか一方しか選べない。
// 手札上限・山札切れといった絶対条件を先に処理し、それ以外は
// 「手札の余裕」「今すぐ使える魂があるか」「あと少しの魂で出したい強いカードがあるか」
// などから判断する。僅差の場合は少しランダム性を持たせ、毎回同じ判断にしない。
function enemyChooseDrawOrScavenge(){
  if(state.enemy.hand.length >= 5) return 'scavenge'; // 手札上限を超えてドローはできない
  if(state.enemy.deck.length === 0) return 'scavenge'; // 山札切れ(=敗北)を避ける

  const soul = state.enemy.soul;
  const hand = state.enemy.hand;
  const hasEmptySlot = state.enemy.field.some((c,idx)=>!c && rowOf(idx)==='back');
  const affordableNow = hand.some(c=>c.soul<=soul);
  const nearAffordable = hand.some(c=>c.soul===soul+1 && (c.atk+c.hp)>=3);

  let scoreDraw = 0;
  let scoreScavenge = 0;

  if(hand.length<=1) scoreDraw += 3;          // 手札が少ない→次の行動にカードが必要
  if(hand.length>=4) scoreScavenge += 2;      // 手札はもう十分ある
  if(!hasEmptySlot) scoreScavenge += 1;       // 場が埋まっていてどうせ今は出せない
  if(!affordableNow && hand.length>0) scoreScavenge += 1; // 今召喚できるカードがない
  if(affordableNow) scoreDraw += 1;           // 召喚できるカードは既にある
  if(nearAffordable) scoreScavenge += 3;      // あと少しの魂で強いカードが出せる
  if(soul<=1) scoreScavenge += 1;             // 魂が足りていない

  // 僅差なら固定行動にならないよう軽くランダム性を混ぜる
  scoreDraw += Math.random()*0.6;
  scoreScavenge += Math.random()*0.6;

  return scoreScavenge>scoreDraw ? 'scavenge' : 'draw';
}

function enemyDrawPhase(){
  const choice = enemyChooseDrawOrScavenge();

  if(choice==='draw'){
    if(state.enemy.deck.length===0){
      return { deckout:true }; // 保険(enemyChooseDrawOrScavengeで基本的に回避済み)
    }
    state.enemy.hand.push(state.enemy.deck.pop());
    log('敵が1枚ドロー');
  }else{
    state.enemy.soul += 1;
    log('敵が死体を漁って魂を1獲得');
  }
  return { deckout:false };
}

// ---- 召喚するカード×レーンの組を評価する ----
// atk/hp/コストといった数値だけでなく、能力・自分と相手双方の場・双方のHPなどを見て
// 「この状況ならこのカードをこのレーンに出す価値が高い」をスコアとして表す。
function evaluateSummonOption(card, lane){
  let score = card.atk + card.hp*0.5;

  const enemyFront = state.player.field[frontIndex(lane)]; // AIから見た「相手」= プレイヤー
  const ownFieldCountNow = fieldCount(state.enemy);

  if(hasAbility(card,'守護')){
    const flyingLanes = flyingThreatLanes(state.enemy, state.player);
    if(flyingLanes.includes(lane)) score += 4; // 相手の飛行を止められるレーンは特に価値が高い
    else score += 0.5;
    if(enemyFront) score += 1; // 正面に敵がいるなら盾として機能しやすい
  }

  if(hasAbility(card,'毒')){
    // 通常攻撃では倒しにくい(HPが高い)相手の正面に出す価値が高い
    if(enemyFront && enemyFront.currentHp >= 3) score += 3;
    else if(enemyFront) score += 1;
  }

  if(hasAbility(card,'貫通')){
    // 正面のHPが低い(倒した上で余剰ダメージが出やすい)、または正面が空だと価値が高い
    if(enemyFront && enemyFront.currentHp <= card.atk) score += 2.5;
    else if(!enemyFront) score += 1.5;
  }

  if(hasAbility(card,'飛行')){
    if(!enemyFront || !hasAbility(enemyFront,'守護')) score += 2.5; // 直接攻撃を狙える
  }

  if(hasAbility(card,'2連撃')){
    score += 1.5;
    if(!enemyFront) score += 1; // 直接攻撃なら2回分そのままダメージになる
  }

  if(state.player.hp <= 6) score += card.atk*0.5; // 相手の残りHPが少ない時は火力を重視
  if(state.enemy.hp <= 8 && hasAbility(card,'守護')) score += 1.5; // 自分が押されている時は守護を優先
  if(ownFieldCountNow===0) score += 1; // 場が空なら展開を優先

  return score;
}

// ---- 生け贄選び(AI専用) ----
// HPだけでなく能力(守護・毒など)や、すでに攻撃準備ができているかも考慮し、
// 「生け贄の価値1あたり、失う強さが小さいカード」から優先して選ぶ。
// 「供物」は1体で生け贄2体分になるルールはそのまま(sacrificeUnitValueを利用)。
function pickSacrificesForAI(owner, excludeIndex, neededValue){
  const candidates = fieldSlots(owner).filter(o=>o.index!==excludeIndex);

  const scored = candidates.map(o=>{
    const c = o.c;
    let keep = cardPower(c);
    if(rowOf(o.index)==='front' && !c.summonedThisTurn) keep += 1.5; // 攻撃に参加できるカードは残す価値が高い
    const unit = sacrificeUnitValue(c);
    return { o, unit, costPerValue: keep/unit };
  });

  scored.sort((a,b)=>a.costPerValue-b.costPerValue);

  const chosen = [];
  let value = 0;
  for(const s of scored){
    if(value>=neededValue) break;
    chosen.push(s.o);
    value += s.unit;
  }
  return { chosen, value, enough: value>=neededValue };
}

function enemyMainPhase(){
  const drawResult = enemyDrawPhase();
  if(drawResult.deckout) return { deckout:true };

  // 場の空き(最大4体)で自然に終わるが、念のため上限回数も設けて無限ループを防ぐ
  let safety = 0;
  while(safety++ < 20){
    // AIも2列目(召喚エリア)にしか召喚できない
    const emptySlots = state.enemy.field
      .map((c,index)=>({c,index}))
      .filter(x=>!x.c && rowOf(x.index)==='back');
    if(!emptySlots.length) break;

    // 召喚可能な(カード, レーン)の組をすべて集めて評価する
    const options = [];
    for(let i=0;i<state.enemy.hand.length;i++){
      const c = state.enemy.hand[i];
      if(c.soul > state.enemy.soul) continue;

      for(const target of emptySlots){
        const lane = laneOf(target.index);
        const pick = pickSacrificesForAI(state.enemy, target.index, c.sacrifice);
        if(!pick.enough) continue;
        // 生け贄で減る分を差し引いてから4体制限を判定する(プレイヤーと同じ入れ替えルール)
        const projectedCount = fieldCount(state.enemy) - pick.chosen.length + 1;
        if(projectedCount > MAX_FIELD_CARDS) continue;

        let score = evaluateSummonOption(c, lane);
        if(c.id==='necromancer' && projectedCount < MAX_FIELD_CARDS) score += 1.5; // スケルトンも一緒に出せる
        // 生け贄で失う戦力が大きいほど評価を下げる(価値の高いカードを無駄に失わない)
        score -= pick.chosen.reduce((sum,item)=>sum+cardPower(item.c),0) * 0.5;

        options.push({ handIndex:i, slot:target.index, card:c, pick, score });
      }
    }

    if(!options.length) break;

    // 最も評価の高い選択肢の近くに複数候補があれば、その中から少しランダムに選ぶ
    // (状況が同じでも毎回まったく同じ行動にならないようにするため)
    options.sort((a,b)=>b.score-a.score);
    const top = options[0].score;
    const nearTop = options.filter(o=>o.score >= top-0.75);
    const chosenOption = nearTop[Math.floor(Math.random()*nearTop.length)];
    const { handIndex, slot, card, pick } = chosenOption;

    if(card.sacrifice>0){
      const names=[];
      pick.chosen.forEach(item=>{
        state.enemy.field[item.index]=null;
        state.enemy.grave.push(item.c);
        const soulAmount = gainSoulOnDeath(item.c, state.enemy);
        triggerOnDeath(item.c, state.enemy, item.index);
        names.push(item.c.name);
        log(`敵の生け贄「${item.c.name}」で魂+${soulAmount}`);
      });
      if(names.length) log(`敵が「${names.join('」「')}」を生け贄に捧げた`);
    }

    state.enemy.soul -= card.soul;
    state.enemy.hand.splice(handIndex,1);
    state.enemy.field[slot]=card;
    log(`敵が「${card.name}」を${rowOf(slot)==='back'?'2列目':'1列目'}に召喚`);
    triggerOnSummon(card,state.enemy,slot);
  }

  return {deckout:false};
}

// ---- 攻撃の処理順を「有利な順」に並べ替える ----
// このゲームは同じレーンの相手としか戦えない(飛行のみ、守護がいなければ直接攻撃)ため、
// 順番を変えても各レーンの結果や最終的なダメージ量は変わらない。
// それでも「確実に倒せる攻撃」「守護を崩せる攻撃」「貫通が通る攻撃」「直接攻撃」を
// 優先して処理することで、ログの流れが自然になり、AIが意図を持って攻撃しているように見える。
function getAIAttackLaneOrder(attackerOwner, defenderOwner){
  const lanes = [];
  for(let lane=0; lane<FIELD_LANES; lane++){
    const atk = attackerOwner.field[frontIndex(lane)];
    if(!atk || atk.summonedThisTurn) continue;

    const target = targetForAttack(defenderOwner, lane, hasAbility(atk,'飛行'));
    let priority;
    if(!target){
      priority = 5; // 直接攻撃できるレーン
    }else{
      const def = target.card;
      const dmg = hasAbility(def,'装甲') ? Math.max(0, atk.atk-1) : atk.atk;
      const kills = hasAbility(atk,'毒') ? dmg>0 : dmg>=def.currentHp;
      if(kills && hasAbility(def,'守護')) priority = 6;      // 邪魔な守護を崩せる攻撃を最優先
      else if(kills) priority = 4;                            // 確実に倒せる攻撃
      else if(hasAbility(atk,'貫通') && dmg>def.currentHp) priority = 3; // 貫通ダメージが入る
      else priority = 1;
    }
    lanes.push({ lane, priority });
  }
  lanes.sort((a,b)=>b.priority-a.priority);
  return lanes.map(l=>l.lane);
}
// ==================== ターン進行 ====================
// 1列目のモンスターが総攻撃するフェイズの共通処理。
// プレイヤー攻撃・敵攻撃のどちらでも同じルールを1箇所にまとめることで、
// 処理が二重に存在してズレてしまうバグを防ぐ。
// 攻撃側の場のオーナー(attackerOwner)・防御側の場のオーナー(defenderOwner)に加えて、
// 直接攻撃時のログ文言と、防御側のHPが0になった時の決着(win/lose)を渡す。
// 決着がついた場合はtrueを返すので、呼び出し側はそこで処理を打ち切ること。
function resolveAttackPhase(attackerOwner, defenderOwner, directHitLog, loseResultForDefender, laneOrder){
  const order = laneOrder || [0,1,2,3];
  for(const lane of order){
    const atk=attackerOwner.field[frontIndex(lane)];
    if(!atk) continue;
    if(atk.summonedThisTurn) continue; // 移動できずまだ2列目相当で待機中のはずの保険チェック

    for(let hit=0;hit<attackCount(atk);hit++){
      const target=targetForAttack(defenderOwner,lane,hasAbility(atk,'飛行'));
      if(target && target.card){
        battle(atk,attackerOwner,target.card,defenderOwner,target.index);
      }else{
        defenderOwner.hp-=atk.atk;
        log(directHitLog(atk));
      }
      playSound('attack');
      if(defenderOwner.hp<=0){
        endGame(loseResultForDefender);
        return true;
      }
    }
  }
  return false;
}

// プレイヤーの「ターン終了」ボタンで呼ばれる。プレイヤーの攻撃までを処理したら
// 「敵のターン」の表示を挟んでから敵の処理(runEnemyTurn)に続ける。
function endTurn(){
  if(state.locked) return;
  if(state.phase!=='main'){
    toast('ドローかスカベンジを先に行ってください');
    return;
  }
  state.locked=true;

  // 召喚エリア(2列目)のモンスターは召喚したターンには攻撃エリアへ移動しない。
  // 移動は次に自分のターンが回ってきた時(runEnemyTurンの終わり)にのみ行われるので、
  // ここでは呼ばない。ターン終了時はあくまで「今すでに攻撃エリアにいるモンスター」だけが攻撃する。

  const ended = resolveAttackPhase(
    state.player, state.enemy,
    atk => hasAbility(atk,'飛行') ? `「${atk.name}」が敵プレイヤーに直接攻撃` : `「${atk.name}」が敵プレイヤーを攻撃`,
    'win'
  );
  if(ended){ state.locked=false; return; }

  render();
  state.active='enemy';
  showTurnBanner('敵のターン');
  setTimeout(runEnemyTurn,800);
}

function runEnemyTurn(){
  // 自分の攻撃で敵の1列目が空いた場合に備え、敵メインフェイズの前にも移動を試みる
  // (「1列目が空いたら次のターン開始時に自動で移動する」ルール)
  advanceRow(state.enemy, '敵');

  const result=enemyMainPhase();
  if(result && result.deckout){
    log('敵の山札が切れた');
    state.locked=false; endGame('win'); return;
  }

  // 敵が今ターン召喚したモンスターは、このターンの攻撃には参加させない
  // (移動は次に敵のターンが回ってきた時、このrunEnemyTurnの冒頭でのみ行う)
  render();

  const laneOrder = getAIAttackLaneOrder(state.enemy, state.player);
  const ended = resolveAttackPhase(
    state.enemy, state.player,
    atk => `敵の「${atk.name}」が直接攻撃`,
    'lose',
    laneOrder
  );
  if(ended){ state.locked=false; return; }

  state.turn++;
  state.phase='draw';
  state.active='player';
  state.locked=false;
  // 次のプレイヤーターン開始時、1列目が空いていれば2列目のモンスターを自動で移動
  advanceRow(state.player, 'あなた');
  render();
  showTurnBanner('あなたのターン');
}
// atk(攻撃側)とdef(防御側)がそれぞれどちらの持ち主のカードかを明示して受け取ることで、
// 死亡時に間違った場・墓地を操作してしまうバグを防ぐ。
function battle(atk, atkOwner, def, defOwner, slot){
  let atkDamage = atk.atk;

  if(hasAbility(def, '装甲')){
    atkDamage = Math.max(0, atkDamage - 1);
  }

  const beforeHp = def.currentHp;

  if(hasAbility(atk, '毒') && atkDamage > 0){
    def.currentHp = 0;
  }else{
    def.currentHp -= atkDamage;
  }

  if(hasAbility(atk, '貫通')){
    const excess = atkDamage - beforeHp;
    if(excess > 0){
      if(defOwner===state.enemy) state.enemy.hp -= excess;
      else state.player.hp -= excess;
      log(`「${atk.name}」の貫通で${excess}ダメージ`);
    }
  }

  if(def.currentHp<=0) resolveDeath(def, defOwner, slot);
}

function hasAbility(card, ability){
  return card && Array.isArray(card.abilities) && card.abilities.includes(ability);
}



function attackCount(card){
  return hasAbility(card, '2連撃') ? 2 : 1;
}
// ==================== イベント登録 ====================
$('btn-start').onclick = () => {
  initAudio();
  state.deckCounts = {...DEFAULT_DECK_COUNTS};
  renderDeckBuilder();
  show('deckbuilder-screen');
};

$('btn-deck-reset').onclick = () => {
  state.deckCounts = {...DEFAULT_DECK_COUNTS};
  renderDeckBuilder();
};

$('btn-deck-confirm').onclick = () => {
  const ids = countsToDeckIds(state.deckCounts);
  startGame(ids);
};

$('btn-draw').onclick=drawCard;
$('btn-scavenge').onclick=scavenge;
$('btn-end').onclick=endTurn;

$('btn-result-title').onclick = () => show('title-screen');

$('btn-glossary-title').onclick = openGlossary;
$('btn-glossary').onclick = openGlossary;
$('btn-glossary-close').onclick = closeGlossary;


