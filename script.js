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
  state.locked=false;

  state.player=createPlayer(playerDeckIds);
  state.enemy=createPlayer(countsToDeckIds(DEFAULT_DECK_COUNTS));

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

// 「供物」を持つカードは生け贄2体分として数える
function sacrificeValue(lanes, owner){
  return lanes.reduce((sum, l)=>{
    const c = owner.field[l];
    if(!c) return sum;
    return sum + (hasAbility(c, '供物') ? 2 : 1);
  }, 0);
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
  banner.textContent = `生け贄 ${value} / ${card.sacrifice} 選択中(自分の場のカードをタップして選択→空きレーンをタップで召喚)`;
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

  // ドロー/死体を漁るはどちらか1回のみ、ターン切り替え演出中は全操作を止める
  $('btn-draw').disabled = state.phase!=='draw' || state.locked;
  $('btn-scavenge').disabled = state.phase!=='draw' || state.locked;
  $('btn-end').disabled = state.phase!=='main' || state.locked;

  document.querySelectorAll('.player-lane').forEach(el=>{
    el.onclick=()=>onPlayerLane(Number(el.dataset.lane));
  });
}

// ==================== プレイヤー操作 ====================
function onPlayerLane(lane){
  if(state.locked) return; // 敵ターン演出中は操作不可
  if(state.phase!=='main'){
    toast('ドローかスカベンジを先に行ってください');
    return;
  }
  if(!state.selectedHand) return;

  const idx = state.player.hand.findIndex(c=>c.uid===state.selectedHand);
  if(idx===-1) return;
  const card = state.player.hand[idx];
  const occupied = !!state.player.field[lane];

  // 自分の場のカードをタップ → 生け贄として選択/解除(「供物」は2体分として数える)
  if(occupied){
    if(card.sacrifice<=0) return;
    if(state.sacrificeTargets.includes(lane)){
      state.sacrificeTargets = state.sacrificeTargets.filter(l=>l!==lane);
    }else{
      const currentValue = sacrificeValue(state.sacrificeTargets, state.player);
      if(currentValue>=card.sacrifice){
        toast('生け贄はもう十分選んでいます');
        return;
      }
      state.sacrificeTargets.push(lane);
    }
    render();
    return;
  }

  // 空きレーンをタップ → 召喚を実行
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
    state.sacrificeTargets.forEach(l=>{
      const sacCard = state.player.field[l];
      if(sacCard){
        state.player.grave.push(sacCard);
        state.player.field[l]=null;
        sacrificedNames.push(sacCard.name);
      }
    });
    log(`「${sacrificedNames.join('」「')}」を生け贄に捧げた`);
    playSound('sacrifice');
  }

  state.player.soul -= card.soul;
  state.player.hand.splice(idx,1);
  state.player.field[lane]=card;
  state.selectedHand=null;
  state.sacrificeTargets=[];
  log(`「${card.name}」を召喚`);
  playSound('summon');
  triggerOnSummon(card, state.player, lane);
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
function triggerOnSummon(card, owner, lane){
  if(!card || !Array.isArray(card.abilities)) return;
  card.abilities.forEach(ability=>{
    switch(ability){
      // 例: case "召喚時に何かする": ここに処理を書く; break;
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

// 「供物」を持つカードは生け贄1体で2体分として扱う
function sacrificeCost(list, owner){
  return list.reduce((sum,item)=> sum + (hasAbility(item.c, '供物') ? 2 : 1), 0);
}

// ==================== 敵AI ====================
function enemyMainPhase(){
  // 山札が切れていたらドローできない→この時点でプレイヤーの勝利
  if(state.enemy.deck.length===0){
    return { deckout:true };
  }
  if(state.enemy.hand.length<5){
    state.enemy.hand.push(state.enemy.deck.pop());
    log('敵が1枚ドロー');
  }
  // 魂は死亡時と死体を漁る操作でのみ増える(毎ターン自動増加は廃止)

  let summoned = false;

  for(let lane=0; lane<3; lane++){
    if(state.enemy.field[lane]) continue;

    // 魂コストと生け贄コストの両方を満たせる、最もソウルコストが高いカードを選ぶ
    let bestIdx = -1;
    for(let i=0;i<state.enemy.hand.length;i++){
      const c = state.enemy.hand[i];
      if(c.soul > state.enemy.soul) continue;
      const otherCards = state.enemy.field
        .map((f,idx)=>({c:f,idx}))
        .filter(o=>o.c && o.idx!==lane);
      const othersValue = sacrificeCost(otherCards, state.enemy);
      if(c.sacrifice > othersValue) continue;
      if(bestIdx===-1 || c.soul > state.enemy.hand[bestIdx].soul) bestIdx = i;
    }
    if(bestIdx===-1) continue;

    const card = state.enemy.hand[bestIdx];

    if(card.sacrifice>0){
      const candidates = state.enemy.field
        .map((c,idx)=>({c,idx}))
        .filter(o=>o.c && o.idx!==lane)
        .sort((a,b)=>a.c.currentHp-b.c.currentHp);
      let acc = 0, k = 0;
      const sacrificedNames = [];
      while(acc < card.sacrifice && k < candidates.length){
        const target = candidates[k];
        state.enemy.grave.push(target.c);
        state.enemy.field[target.idx] = null;
        acc += hasAbility(target.c, '供物') ? 2 : 1;
        sacrificedNames.push(target.c.name);
        k++;
      }
      if(sacrificedNames.length){
        log(`敵が「${sacrificedNames.join('」「')}」を生け贄に捧げた`);
      }
    }

    state.enemy.soul -= card.soul;
    state.enemy.hand.splice(bestIdx,1);
    state.enemy.field[lane] = card;
    summoned = true;
    log(`敵が「${card.name}」を召喚`);
    triggerOnSummon(card, state.enemy, lane);
  }

  // 召喚できなかった場合は「死体を漁る」を行う
  if(!summoned){
    const needsSoul = state.enemy.hand.some(c => c.soul > state.enemy.soul);
    if(needsSoul){
      state.enemy.soul += 1;
      log('敵が死体を漁って魂を1獲得');
    }
  }

  return { deckout:false };
}

// ==================== ターン進行 ====================
// プレイヤーの「ターン終了」ボタンで呼ばれる。プレイヤーの攻撃までを処理したら
// 「敵のターン」の表示を挟んでから敵の処理(runEnemyTurn)に続ける。
function endTurn(){
  if(state.locked) return;
  if(state.phase!=='main'){
    toast('ドローかスカベンジを先に行ってください');
    return;
  }
  state.locked = true;

  // プレイヤーの攻撃
  for(let lane=0; lane<3; lane++){
    const atk = state.player.field[lane];
    if(!atk) continue;

    // 召喚ターンは攻撃できない（突進を除く）
    if(atk.summonedThisTurn && !hasAbility(atk, '突進')) continue;

    for(let hit=0; hit<attackCount(atk); hit++){
      const def = state.enemy.field[lane];
      if(hasAbility(atk, '飛行')){
        if(def && hasAbility(def, '守護')){
          battle(atk, state.player, def, state.enemy, lane);
        }else{
          state.enemy.hp -= atk.atk;
          log(`「${atk.name}」が敵プレイヤーに直接攻撃`);
        }
      }else{
        if(!def){
          state.enemy.hp -= atk.atk;
          log(`「${atk.name}」が敵プレイヤーを攻撃`);
        }else{
          battle(atk, state.player, def, state.enemy, lane);
        }
      }
      playSound('attack');
      if(state.enemy.hp<=0){
        state.locked = false;
        endGame('win');
        return;
      }
    }
  }

  // 召喚酔い解除
  state.player.field.forEach(c=>{ if(c) c.summonedThisTurn=false; });
  render();

  state.active = 'enemy';
  showTurnBanner('敵のターン');
  setTimeout(runEnemyTurn, 800);
}

// 「敵のターン」表示のあとに呼ばれる。敵のドロー・召喚・攻撃をまとめて処理し、
// 最後にプレイヤーのターンへ戻す。
function runEnemyTurn(){
  const result = enemyMainPhase();
  if(result && result.deckout){
    log('敵の山札が切れた');
    state.locked = false;
    endGame('win');
    return;
  }
  render();

  // 敵の攻撃
  for(let lane=0; lane<3; lane++){
    const atk = state.enemy.field[lane];
    if(!atk) continue;

    if(atk.summonedThisTurn && !hasAbility(atk, '突進')) continue;

    for(let hit=0; hit<attackCount(atk); hit++){
      const def = state.player.field[lane];
      if(hasAbility(atk, '飛行')){
        if(def && hasAbility(def, '守護')){
          battle(atk, state.enemy, def, state.player, lane);
        }else{
          state.player.hp -= atk.atk;
          log(`敵の「${atk.name}」が直接攻撃`);
        }
      }else{
        if(!def){
          state.player.hp -= atk.atk;
          log(`敵の「${atk.name}」が直接攻撃`);
        }else{
          battle(atk, state.enemy, def, state.player, lane);
        }
      }
      playSound('attack');
      if(state.player.hp<=0){
        state.locked = false;
        endGame('lose');
        return;
      }
    }
  }

  state.enemy.field.forEach(c=>{ if(c) c.summonedThisTurn=false; });

  state.turn++;
  state.phase='draw';
  state.active='player';
  state.locked = false;
  render();
  showTurnBanner('あなたのターン');
}

// atk(攻撃側)とdef(防御側)がそれぞれどちらの持ち主のカードかを明示して受け取ることで、
// 死亡時に間違った場・墓地を操作してしまうバグを防ぐ。
function battle(atk, atkOwner, def, defOwner, lane){
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

  if(def.currentHp<=0) resolveDeath(def, defOwner, lane);
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
