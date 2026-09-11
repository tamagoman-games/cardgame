// ==================== 対人戦(オンライン)ネットワーク層 ====================
// PeerJSの公開シグナリングサーバーを使い、同じ「コード」を入力した2人を
// WebRTCで直接つなげる。ゲームロジックはホスト側だけが実行する
// (ホスト権威モデル)。ゲスト側は自分の操作を「意図(intent)」として
// ホストへ送るだけで、実際の判定・盤面更新はすべてホストが行い、
// その結果(view)をゲストへ送り返して画面を更新する。
//
// 通信内容はこのゲームの盤面情報のみで、個人情報などは一切含まない。

const NET = {
  mode: 'local',   // 'local'(通常のAI対戦) | 'host' | 'guest'
  peer: null,
  conn: null,
  myDeckIds: null,
  guestDeckIds: null
};

let guestLastActive = null;
let guestLastPendingSkeleton = null;

function pvpSanitizeCode(raw){
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

function pvpHostId(code){
  return 'soulsac8-room-' + code;
}

function pvpStatus(msg){
  const a = document.getElementById('pvp-status');
  const b = document.getElementById('deck-pvp-status');
  if (a) a.textContent = msg;
  if (b) b.textContent = msg;
}

function pvpResetToTitle(message){
  NET.mode = 'local';
  if (NET.conn) { try { NET.conn.close(); } catch(e){} }
  if (NET.peer) { try { NET.peer.destroy(); } catch(e){} }
  NET.conn = null;
  NET.peer = null;
  NET.myDeckIds = null;
  NET.guestDeckIds = null;
  guestLastActive = null;
  guestLastPendingSkeleton = null;
  if (message) toast(message);
  show('title-screen');
}

// 「対人戦」ボタン: コード入力画面を表示
function pvpOpenScreen(){
  pvpStatus('');
  const input = document.getElementById('pvp-code-input');
  if (input) input.value = '';
  show('pvp-screen');
}

// コードを打って「接続」を押した時の処理。
// まず自分がそのコードの「ホスト」になれるか試し、既に誰かがホストしていたら
// 自動的に「ゲスト」としてそのホストに接続しにいく。
function pvpConnect(rawCode){
  const code = pvpSanitizeCode(rawCode);
  if (!code){
    toast('コードを入力してください');
    return;
  }

  pvpStatus('接続中…');
  const hostId = pvpHostId(code);
  let settled = false;

  let hostPeer;
  try{
    hostPeer = new Peer(hostId);
  }catch(e){
    pvpStatus('この端末はオンライン対戦に対応していません');
    return;
  }

  hostPeer.on('open', () => {
    settled = true;
    NET.mode = 'host';
    NET.peer = hostPeer;
    pvpStatus('相手の参加を待っています…(コード: ' + code + ')');

    hostPeer.on('connection', conn => {
      NET.conn = conn;
      pvpSetupConn(conn, 'host');
    });
  });

  hostPeer.on('error', err => {
    if (settled) return;
    if (err && err.type === 'unavailable-id'){
      // 既に誰かがこのコードでホストしている → 自分はゲストとして参加する
      settled = true;
      let guestPeer;
      try{
        guestPeer = new Peer();
      }catch(e){
        pvpStatus('接続に失敗しました');
        return;
      }
      guestPeer.on('open', () => {
        NET.mode = 'guest';
        NET.peer = guestPeer;
        pvpStatus('接続しています…');
        const conn = guestPeer.connect(hostId, { reliable: true });
        NET.conn = conn;
        pvpSetupConn(conn, 'guest');
      });
      guestPeer.on('error', () => {
        pvpStatus('接続できませんでした。コードを確認してもう一度お試しください');
      });
    }else{
      pvpStatus('接続エラーが発生しました。もう一度お試しください');
    }
  });
}

function pvpSetupConn(conn, role){
  conn.on('open', () => {
    pvpStatus('接続しました！デッキを選んでください');
    state.deckCounts = { ...DEFAULT_DECK_COUNTS };
    renderDeckBuilder();
    show('deckbuilder-screen');
  });
  conn.on('data', data => {
    if (role === 'host') hostHandleGuestMessage(data);
    else guestHandleHostMessage(data);
  });
  conn.on('close', () => {
    pvpResetToTitle('相手との接続が切れました');
  });
  conn.on('error', () => {
    toast('通信エラーが発生しました');
  });
}

function netSend(msg){
  if (NET.conn && NET.conn.open) NET.conn.send(msg);
}

// ==================== ホスト側: ゲストからの意図を処理 ====================
function hostHandleGuestMessage(msg){
  if (!msg || !msg.t) return;

  if (msg.t === 'deck'){
    NET.guestDeckIds = msg.ids;
    maybeStartPvPGame();
    return;
  }

  if (!state.enemy) return; // ゲームがまだ始まっていない

  if (msg.t === 'draw') pvpEnemyDraw();
  else if (msg.t === 'scavenge') pvpEnemyScavenge();
  else if (msg.t === 'summon') pvpEnemySummon(msg.slot, msg.handUid, msg.sacrifice || []);
  else if (msg.t === 'spell') pvpEnemySpell(msg.handUid, msg.side, msg.slot);
  else if (msg.t === 'skeletonPick') pvpEnemySkeletonPick(msg.slot);
  else if (msg.t === 'endTurn') pvpEnemyEndTurn();
}

function maybeStartPvPGame(){
  if (NET.mode !== 'host') return;
  if (!NET.myDeckIds || !NET.guestDeckIds) return;
  startGame(NET.myDeckIds, NET.guestDeckIds);
}

// ホストの盤面(state)を、ゲスト視点(player/enemyを入れ替えた視点)に
// 変換して送る。プレイヤーの手札は元々どちらの画面にも表示されない
// ゲームなので(場・HP・魂・山札枚数だけが表示対象)、追加の秘匿処理は不要。
function flipActive(a){ return a === 'player' ? 'enemy' : 'player'; }

function broadcastView(){
  if (NET.mode !== 'host' || !NET.conn || !NET.conn.open) return;
  if (!state.enemy || !state.player) return;
  const view = {
    turn: state.turn,
    phase: state.phase,
    active: flipActive(state.active),
    locked: state.active === 'player', // 自分(ホスト)の番の間はゲスト側の操作を止める
    pendingSkeleton: state.pendingSkeleton ? flipActive(state.pendingSkeleton) : null,
    player: state.enemy,
    enemy: state.player,
    logs: state.logs
  };
  netSend({ t: 'view', v: view });
}

// ---- ゲスト操作(ホスト側で実際に判定・適用する) ----
function pvpEnemyDraw(){
  if (state.active !== 'enemy' || state.locked || state.phase !== 'draw' || state.pendingSkeleton) return;
  if (state.enemy.deck.length === 0){ endGame('win'); return; }
  if (state.enemy.hand.length >= HAND_LIMIT){
    state.phase = 'main';
    log('敵の手札が上限のためメインフェイズへ');
    render();
    return;
  }
  state.enemy.hand.push(state.enemy.deck.pop());
  state.phase = 'main';
  log('敵が1枚ドロー');
  render();
}

function pvpEnemyScavenge(){
  if (state.active !== 'enemy' || state.locked || state.phase !== 'draw' || state.pendingSkeleton) return;
  state.enemy.soul += 1;
  state.phase = 'main';
  log('敵が死体を漁って魂を1獲得');
  render();
}

function pvpEnemySummon(slot, handUid, sacrificeSlots){
  if (state.active !== 'enemy' || state.locked || state.phase !== 'main' || state.pendingSkeleton) return;
  const idx = state.enemy.hand.findIndex(c => c.uid === handUid);
  if (idx === -1) return;
  const card = state.enemy.hand[idx];
  if (typeof slot !== 'number' || rowOf(slot) !== 'back') return;
  if (state.enemy.field[slot]) return;

  const validSacs = (sacrificeSlots || []).filter(s => state.enemy.field[s]);
  const projected = fieldCount(state.enemy) - validSacs.length;
  if (projected >= MAX_FIELD_CARDS) return;
  if (card.sacrifice > 0 && sacrificeValue(validSacs, state.enemy) < card.sacrifice) return;
  if (state.enemy.soul < card.soul) return;

  if (card.sacrifice > 0){
    const names = [];
    validSacs.forEach(s => {
      const sacCard = state.enemy.field[s];
      if (sacCard){
        state.enemy.field[s] = null;
        state.enemy.grave.push(sacCard);
        const amt = gainSoulOnDeath(sacCard, state.enemy);
        triggerOnDeath(sacCard, state.enemy, s);
        names.push(sacCard.name);
        log(`敵の生け贄「${sacCard.name}」で魂+${amt}`);
      }
    });
    if (names.length) log(`敵が「${names.join('」「')}」を生け贄に捧げた`);
  }

  state.enemy.soul -= card.soul;
  state.enemy.hand.splice(idx, 1);
  card._summonedAt = Date.now();
  state.enemy.field[slot] = card;
  log(`敵が「${card.name}」を${rowOf(slot) === 'back' ? '2列目' : '1列目'}に召喚`);
  playSound('summon');
  triggerOnSummon(card, state.enemy, slot);
  render();
}

// ゲストが魔法カードを使った時の処理(ゲスト視点の「自分の場」=state.enemy、「敵の場」=state.player)
function pvpEnemySpell(handUid, side, slot){
  if (state.active !== 'enemy' || state.locked || state.phase !== 'main' || state.pendingSkeleton) return;
  const idx = state.enemy.hand.findIndex(c => c.uid === handUid);
  if (idx === -1) return;
  const card = state.enemy.hand[idx];
  if (!card || card.type !== 'spell') return;

  if (card.target === 'ally' && side !== 'own') return;
  if (card.target === 'allyBack' && side !== 'own') return;
  if (card.target === 'enemy' && side !== 'enemy') return;

  if (card.target !== 'none'){
    const fieldOwner = side === 'own' ? state.enemy : state.player;
    if (typeof slot !== 'number' || !fieldOwner.field[slot]) return;
    if (card.target === 'allyBack'){
      if (rowOf(slot) !== 'back') return;
      const lane = laneOf(slot);
      if (state.enemy.field[frontIndex(lane)]) return;
    }
  }

  if (state.enemy.soul < card.soul) return;

  const ok = applySpellEffect(card, state.enemy, state.player, slot);
  if (!ok) return;
  state.enemy.soul -= card.soul;
  state.enemy.hand.splice(idx, 1);
  playSound('summon');
  render();
}

// ゲストが「ネクロマンサー」のスケルトンをどこに出すか選んだ時の処理
function pvpEnemySkeletonPick(slot){
  if (state.pendingSkeleton !== 'enemy') return;
  if (typeof slot !== 'number' || rowOf(slot) !== 'back') return;
  if (state.enemy.field[slot]) return;
  const skeleton = makeCard('skeleton');
  skeleton._summonedAt = Date.now();
  state.enemy.field[slot] = skeleton;
  state.pendingSkeleton = null;
  log('敵の「ネクロマンサー」が「スケルトン」を召喚');
  playSound('summon');
  render();
}

function pvpEnemyEndTurn(){
  if (state.active !== 'enemy' || state.locked || state.phase !== 'main' || state.pendingSkeleton) return;
  state.locked = true;

  const ended = resolveAttackPhase(
    state.enemy, state.player,
    atk => `敵の「${atk.name}」が直接攻撃`,
    'lose'
  );
  if (ended){ state.locked = false; render(); return; }

  state.turn++;
  state.phase = 'draw';
  state.active = 'player';
  state.locked = false;
  advanceRow(state.player, 'あなた');
  render();
  showTurnBanner('あなたのターン');
}

// ==================== ゲスト側: ホストからのviewを反映 ====================
function guestHandleHostMessage(msg){
  if (!msg || !msg.t) return;
  if (msg.t === 'view') guestApplyView(msg.v);
}

function guestApplyView(v){
  if (!v) return;
  state.turn = v.turn;
  state.phase = v.phase;
  state.active = v.active;
  state.locked = v.locked;
  state.pendingSkeleton = v.pendingSkeleton || null;
  state.player = v.player;
  state.enemy = v.enemy;
  state.selectedHand = null;
  state.sacrificeTargets = [];

  const gameScreen = document.getElementById('game-screen');
  if (gameScreen && !gameScreen.classList.contains('active')){
    show('game-screen');
  }

  render();
  guestRenderLogs(v.logs);

  if (guestLastActive !== null && guestLastActive !== state.active){
    showTurnBanner(state.active === 'player' ? 'あなたのターン' : '相手のターン');
  }
  guestLastActive = state.active;

  if (state.pendingSkeleton === 'player' && guestLastPendingSkeleton !== 'player'){
    toast('スケルトンを召喚する場所を選んでください');
  }
  guestLastPendingSkeleton = state.pendingSkeleton;
}

// ホスト側の文言(「あなた」=ホスト自身、「敵」=対戦相手)を
// ゲスト視点(「あなた」=ゲスト自身、「相手」=ホスト)に入れ替えて表示する
function guestRenderLogs(logs){
  const el = document.getElementById('log-list');
  if (!el) return;
  el.innerHTML = (logs || []).map(x => {
    const swapped = x
      .split('あなた').join('\u0000')
      .split('敵').join('あなた')
      .split('\u0000').join('相手');
    return `<li>${swapped}</li>`;
  }).join('');
}
