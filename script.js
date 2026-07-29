// ChatGPT patch v2

const state = {
  turn: 1,
  phase: 'draw',
  active: 'player',
  logs: [],
  selectedHand: null,
  player: null,
  enemy: null
};

const $ = id => document.getElementById(id);

function show(id){
  document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
  $(id).classList.add('active');
}

function log(msg){
  state.logs.unshift(msg);
  state.logs = state.logs.slice(0,5);
  $('log-list').innerHTML = state.logs.map(x=>`<li>${x}</li>`).join('');
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function makeCard(id){
  const base = CARD_MASTER.find(c=>c.id===id);
  return {
    uid: Math.random().toString(36).slice(2),
    ...base,
    currentHp: base.hp,
    summonedThisTurn: true,
    attacked: false
  };
}

function createPlayer(){
  const deck = shuffle(START_DECK).map(makeCard);
  const hand = [];
  for(let i=0;i<3;i++) hand.push(deck.pop());
  return {
    hp:20,
    soul:0,
    deck,
    hand,
    field:[null,null,null],
    grave:[]
  };
}

function startGame(){
  state.turn=1;
  state.phase='draw';
  state.active='player';
  state.logs=[];
  state.selectedHand=null;

  state.player=createPlayer();
  state.enemy=createPlayer();

  show('game-screen');
  log('ゲーム開始');
  render();
}

function renderCard(card){
  return `
    <div class="card">
      <div class="name">${card.name}</div>
      <div class="stats">ATK ${card.atk} / HP ${card.currentHp}</div>
      <div class="stats">魂 ${card.soul}</div>
      <div class="abilities">${card.abilities.map(a=>`<span class="badge">${a}</span>`).join('')}</div>
    </div>
  `;
}

function renderField(targetId, owner, enemy=false){
  $(targetId).innerHTML = owner.field.map((card,lane)=>{
    const cls = enemy ? 'lane enemy-lane' : 'lane player-lane';
    if(!card) return `<div class="${cls}" data-lane="${lane}">空き</div>`;
    return `<div class="${cls}" data-lane="${lane}">${renderCard(card)}</div>`;
  }).join('');
}

function renderHand(){
  $('hand').innerHTML = state.player.hand.map(card=>`
    <div class="card ${state.selectedHand===card.uid?'selected':''}" data-hand="${card.uid}">
      <div class="name">${card.name}</div>
      <div class="stats">ATK ${card.atk} / HP ${card.currentHp}</div>
      <div class="stats">魂 ${card.soul}</div>
      <div class="abilities">${card.abilities.map(a=>`<span class="badge">${a}</span>`).join('')}</div>
    </div>
  `).join('');

  document.querySelectorAll('[data-hand]').forEach(el=>{
    el.onclick=()=>{
      state.selectedHand=el.dataset.hand;
      log('召喚するレーンをタップ');
      render();
    };
  });
}

function render(){
  $('player-hp').textContent=state.player.hp;
  $('enemy-hp').textContent=state.enemy.hp;
  $('player-soul').textContent=state.player.soul;
  $('enemy-soul').textContent=state.enemy.soul;
  $('player-deck').textContent=state.player.deck.length;
  $('enemy-deck').textContent=state.enemy.deck.length;
  $('turn-label').textContent=`ターン ${state.turn}`;
  $('phase-label').textContent=state.phase==='draw'?'ドロー':'メイン';

  renderField('enemy-lanes', state.enemy, true);
  renderField('player-lanes', state.player);
  renderHand();

  document.querySelectorAll('.player-lane').forEach(el=>{
    el.onclick=()=>onPlayerLane(Number(el.dataset.lane));
  });
}

function onPlayerLane(lane){
  if(state.phase!=='main') return;
  if(state.player.field[lane]) return;
  if(!state.selectedHand) return;

  const idx = state.player.hand.findIndex(c=>c.uid===state.selectedHand);
  if(idx===-1) return;

  const card = state.player.hand[idx];

  if(state.player.soul < card.soul){
    log('魂が足りない');
    return;
  }

  state.player.soul -= card.soul;
  state.player.hand.splice(idx,1);
  state.player.field[lane]=card;
  state.selectedHand=null;
  log(`「${card.name}」を召喚`);
  render();
}

function drawCard(){
  if(state.phase!=='draw') return;

  if(state.player.deck.length===0){
    alert('山札切れで敗北');
    show('title-screen');
    return;
  }

  if(state.player.hand.length>=5){
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
  if(state.phase!=='draw') return;
  state.player.soul += 1;
  state.phase='main';
  log('魂 +1');
  render();
}

function endTurn(){
  enemyTurn();
}

function enemyTurn(){
  if(state.enemy.deck.length>0 && state.enemy.hand.length<5){
    state.enemy.hand.push(state.enemy.deck.pop());
  }else{
    state.enemy.soul += 1;
  }

  for(let lane=0; lane<3; lane++){
    if(state.enemy.field[lane]) continue;

    const idx = state.enemy.hand.findIndex(c=>c.soul<=state.enemy.soul);
    if(idx!==-1){
      const card = state.enemy.hand.splice(idx,1)[0];
      state.enemy.soul -= card.soul;
      state.enemy.field[lane]=card;
      log(`敵が「${card.name}」を召喚`);
    }
  }

  for(let lane=0; lane<3; lane++){
    const atk = state.enemy.field[lane];
    if(!atk) continue;

    const def = state.player.field[lane];

    if(!def){
      state.player.hp -= atk.atk;
      log(`敵の「${atk.name}」が直接攻撃`);
      if(state.player.hp<=0){
        alert('敗北');
        show('title-screen');
        return;
      }
    }else{
      def.currentHp -= atk.atk;
      atk.currentHp -= def.atk;

      if(def.currentHp<=0){
        state.player.grave.push(def);
        state.player.field[lane]=null;
      }
      if(atk.currentHp<=0){
        state.enemy.grave.push(atk);
        state.enemy.field[lane]=null;
      }
    }
  }

  state.turn++;
  state.phase='draw';
  render();
}

$('btn-start').onclick=startGame;
$('btn-draw').onclick=drawCard;
$('btn-scavenge').onclick=scavenge;
$('btn-end').onclick=endTurn;


// ===== Added by ChatGPT patch v2 =====

function hasAbility(card, ability){
    return card && Array.isArray(card.abilities) && card.abilities.includes(ability);
}

function dealDamage(targetCard, amount){
    if(!targetCard || amount <= 0) return;
    if(hasAbility(targetCard, "装甲")){
        amount = Math.max(0, amount - 1);
    }
    targetCard.hp -= amount;
}

function reviveUndead(card){
    if(!card) return false;
    if(hasAbility(card, "不死") && !card._revivedThisTurn){
        card.hp = Math.max(1, card.maxHp || card.hp || 1);
        card._revivedThisTurn = true;
        return true;
    }
    return false;
}

// Simple AI helper (non-destructive if not used by original code)
function aiChooseLane(field){
    for(let i=0;i<3;i++){
        if(!field[i]) return i;
    }
    return -1;
}

// ===== End patch =====
