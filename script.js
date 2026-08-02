const state = {
  turn: 1,
  phase: 'draw',
  active: 'player',
  logs: [],
  selectedHand: null,
  sacrificeTargets: [],
  deckCounts: {},
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

function createPlayer(deckIds){
  const deck = shuffle(deckIds).map(makeCard);
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

// ==================== デッキ編成画面 ====================
function renderDeckBuilder(){
  $('deck-min').textContent = DECK_MIN_SIZE;
  $('deck-max').textContent = DECK_MAX_SIZE;

  $('deck-list').innerHTML = CARD_MASTER.map(card=>{
    const count = state.deckCounts[card.id] || 0;
    const sacText = card.sacrifice>0 ? ` / 生け贄${card.sacrifice}` : '';
    return `
      <div class="deck-row">
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

  state.player=createPlayer(playerDeckIds);
  state.enemy=createPlayer(countsToDeckIds(DEFAULT_DECK_COUNTS));

  show('game-screen');
  log('ゲーム開始');
  render();
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
function renderCard(card){
  return `
    <div class="card">
      <div class="name"><span class="icon">${card.icon||''}</span>${card.name}</div>
      <div class="stats">ATK ${card.atk} / HP ${card.currentHp}</div>
      <div class="stats">魂 ${card.soul}${card.sacrifice>0?` / 生け贄${card.sacrifice}`:''}</div>
      <div class="abilities">${card.abilities.map(a=>`<span class="badge">${a}</span>`).join('')}</div>
    </div>
  `;
}

function renderField(targetId, owner, enemy=false){
  $(targetId).innerHTML = owner.field.map((card,lane)=>{
    let cls = enemy ? 'lane enemy-lane' : 'lane player-lane';
    if(!enemy && state.sacrificeTargets.includes(lane)) cls += ' sac-selected';
    if(!card) return `<div class="${cls}" data-lane="${lane}">空き</div>`;
    return `<div class="${cls}" data-lane="${lane}">${renderCard(card)}</div>`;
  }).join('');
}

function renderHand(){
  $('hand').innerHTML = state.player.hand.map(card=>`
    <div class="card ${state.selectedHand===card.uid?'selected':''}" data-hand="${card.uid}">
      <div class="name"><span class="icon">${card.icon||''}</span>${card.name}</div>
      <div class="stats">ATK ${card.atk} / HP ${card.currentHp}</div>
      <div class="stats">魂 ${card.soul}${card.sacrifice>0?` / 生け贄${card.sacrifice}`:''}</div>
      <div class="abilities">${card.abilities.map(a=>`<span class="badge">${a}</span>`).join('')}</div>
    </div>
  `).join('');

  document.querySelectorAll('[data-hand]').forEach(el=>{
    el.onclick=()=>{
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

function updateSacrificeBanner(){
  const banner = $('sacrifice-banner');
  const card = state.selectedHand ? state.player.hand.find(c=>c.uid===state.selectedHand) : null;
  if(!card || card.sacrifice<=0){
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.textContent = `生け贄 ${state.sacrificeTargets.length} / ${card.sacrifice} 選択中(自分の場のカードをタップして選択→空きレーンをタップで召喚)`;
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
  updateSacrificeBanner();

  document.querySelectorAll('.player-lane').forEach(el=>{
    el.onclick=()=>onPlayerLane(Number(el.dataset.lane));
  });
}

// ==================== プレイヤー操作 ====================
function onPlayerLane(lane){
  if(state.phase!=='main'){
    toast('ドローかスカベンジを先に行ってください');
    return;
  }
  if(!state.selectedHand) return;

  const idx = state.player.hand.findIndex(c=>c.uid===state.selectedHand);
  if(idx===-1) return;
  const card = state.player.hand[idx];
  const occupied = !!state.player.field[lane];

  // 自分の場のカードをタップ → 生け贄として選択/解除
  if(occupied){
    if(card.sacrifice<=0) return;
    if(state.sacrificeTargets.includes(lane)){
      state.sacrificeTargets = state.sacrificeTargets.filter(l=>l!==lane);
    }else{
      if(state.sacrificeTargets.length>=card.sacrifice){
        toast('生け贄はもう十分選んでいます');
        return;
      }
      state.sacrificeTargets.push(lane);
    }
    render();
    return;
  }

  // 空きレーンをタップ → 召喚を実行
  if(card.sacrifice>0 && state.sacrificeTargets.length < card.sacrifice){
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
    state.sacrificeTargets.forEach(l=>{
      const sacCard = state.player.field[l];
      if(sacCard){
        state.player.grave.push(sacCard);
        state.player.field[l]=null;
        sacrificedNames.push(sacCard.name);
      }
    });
    log(`「${sacrificedNames.join('」「')}」を生け贄に捧げた(敵の魂+${sacrificedNames.length})`);
    playSound('sacrifice');
  }

  state.player.soul -= card.soul;
  state.player.hand.splice(idx,1);
  state.player.field[lane]=card;
  state.selectedHand=null;
  state.sacrificeTargets=[];
  log(`「${card.name}」を召喚`);
  playSound('summon');
  render();
}

function drawCard(){
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
  if(state.phase!=='draw') return;
  state.player.soul += 1;
  state.phase='main';
  log('死体を漁って魂 +1');
  render();
}

// ==================== 敵AI ====================
function enemyMainPhase(){
  if(state.enemy.deck.length>0 && state.enemy.hand.length<5){
    state.enemy.hand.push(state.enemy.deck.pop());
    log('敵が1枚ドロー');
  }
  state.enemy.soul += 1;

  for(let lane=0; lane<3; lane++){
    if(state.enemy.field[lane]) continue;

    // 魂コストと生け贄コストの両方を満たせる、最もソウルコストが高いカードを選ぶ
    let bestIdx = -1;
    for(let i=0;i<state.enemy.hand.length;i++){
      const c = state.enemy.hand[i];
      if(c.soul > state.enemy.soul) continue;
      const others = state.enemy.field.filter((f,idx)=>f && idx!==lane).length;
      if(c.sacrifice > others) continue;
      if(bestIdx===-1 || c.soul > state.enemy.hand[bestIdx].soul) bestIdx = i;
    }
    if(bestIdx===-1) continue;

    const card = state.enemy.hand[bestIdx];

    if(card.sacrifice>0){
      const candidates = state.enemy.field
        .map((c,idx)=>({c,idx}))
        .filter(o=>o.c && o.idx!==lane)
        .sort((a,b)=>a.c.currentHp-b.c.currentHp);
      for(let k=0;k<card.sacrifice;k++){
        const target = candidates[k];
        if(!target) break;
        state.enemy.grave.push(target.c);
        state.enemy.field[target.idx] = null;
        log(`敵が「${target.c.name}」を生け贄に捧げた(あなたの魂+1)`);
      }
    }

    state.enemy.soul -= card.soul;
    state.enemy.hand.splice(bestIdx,1);
    state.enemy.field[lane] = card;
    log(`敵が「${card.name}」を召喚`);
  }
}

// ==================== ターン進行 ====================
function endTurn(){
  // プレイヤーの攻撃
  for(let lane=0; lane<3; lane++){
    const atk = state.player.field[lane];
    if(!atk) continue;

    // 召喚ターンは攻撃できない（突進を除く）
    if(atk.summonedThisTurn && !hasAbility(atk, '突進')) continue;

    const def = state.enemy.field[lane];

    if(hasAbility(atk, '飛行')){
      if(def && hasAbility(def, '守護')){
        battleEnemy(atk, def, lane);
      }else{
        state.enemy.hp -= atk.atk;
        log(`「${atk.name}」が敵プレイヤーに直接攻撃`);
      }
    }else{
      if(!def){
        state.enemy.hp -= atk.atk;
        log(`「${atk.name}」が敵プレイヤーを攻撃`);
      }else{
        battleEnemy(atk, def, lane);
      }
    }
    playSound('attack');

    if(state.enemy.hp<=0){
      endGame('win');
      return;
    }
  }

  // 召喚酔い解除
  state.player.field.forEach(c=>{ if(c) c.summonedThisTurn=false; });

  // 敵のメインフェイズ(ドロー・魂獲得・召喚)
  enemyMainPhase();
  render();

  // 敵の攻撃
  for(let lane=0; lane<3; lane++){
    const atk = state.enemy.field[lane];
    if(!atk) continue;

    if(atk.summonedThisTurn && !hasAbility(atk, '突進')) continue;

    const def = state.player.field[lane];

    if(hasAbility(atk, '飛行')){
      if(def && hasAbility(def, '守護')){
        battleEnemy(atk, def, lane);
      }else{
        state.player.hp -= atk.atk;
        log(`敵の「${atk.name}」が直接攻撃`);
      }
    }else{
      if(!def){
        state.player.hp -= atk.atk;
        log(`敵の「${atk.name}」が直接攻撃`);
      }else{
        battleEnemy(atk, def, lane);
      }
    }
    playSound('attack');

    if(state.player.hp<=0){
      endGame('lose');
      return;
    }
  }

  state.enemy.field.forEach(c=>{ if(c) c.summonedThisTurn=false; });

  state.turn++;
  state.phase='draw';
  render();
}

function battleEnemy(atk, def, lane){
  let atkDamage = atk.atk;
  let defDamage = def.atk;

  if(hasAbility(def, '装甲')){
    atkDamage = Math.max(0, atkDamage - 1);
  }
  if(hasAbility(atk, '装甲')){
    defDamage = Math.max(0, defDamage - 1);
  }

  if(hasAbility(atk, '毒') && atkDamage > 0){
    def.currentHp = 0;
  }else{
    def.currentHp -= atkDamage;
  }

  if(hasAbility(def, '毒') && defDamage > 0){
    atk.currentHp = 0;
  }else{
    atk.currentHp -= defDamage;
  }

  if(def.currentHp<=0){
    if(hasAbility(def, '不死') && !def.revived){
      def.currentHp = def.hp;
      def.revived = true;
      log(`「${def.name}」が不死で復活`);
    }else{
      state.player.grave.push(def);
      state.player.field[lane]=null;
    }
  }

  if(atk.currentHp<=0){
    if(hasAbility(atk, '不死') && !atk.revived){
      atk.currentHp = atk.hp;
      atk.revived = true;
      log(`「${atk.name}」が不死で復活`);
    }else{
      state.enemy.grave.push(atk);
      state.enemy.field[lane]=null;
    }
  }
}

function hasAbility(card, ability){
  return card && Array.isArray(card.abilities) && card.abilities.includes(ability);
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
