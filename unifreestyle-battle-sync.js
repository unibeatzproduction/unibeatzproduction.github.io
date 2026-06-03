// unifreestyle-battle-sync.js
// Shared Firebase sync for UniFreestyle battle sessions.
(function(){
  'use strict';

  var st = { db:null, mod:null, room:'battle-room', unsub:null, data:null };

  function toast(msg){ if(window.showToast) window.showToast(msg); else console.log('[battle-sync]', msg); }

  async function fb(){
    if(st.db && st.mod) return st;
    if(!window.UB_FIREBASE || !window.UB_FIREBASE.app) throw new Error('Firebase not ready');
    st.mod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    st.db = st.mod.getFirestore(window.UB_FIREBASE.app);
    return st;
  }

  function ref(room){ return st.mod.doc(st.db, 'battle_sessions', room || st.room); }

  function base(room, mode){
    return {
      room: room,
      mode: mode || 'showdown',
      status: 'waiting',
      round: 1,
      roundSeconds: 180,
      startedAt: 0,
      scores: { teamA:0, teamB:0, artist1:0, artist2:0, dj1:0, dj2:0 },
      votes: {},
      winner: '',
      bracket: { size:8, round:1, match:1, champion:'' },
      updatedAt: Date.now()
    };
  }

  async function open(room, mode){
    await fb();
    st.room = room || 'battle-room';
    var r = ref(st.room);
    var snap = await st.mod.getDoc(r);
    if(!snap.exists()) await st.mod.setDoc(r, base(st.room, mode), { merge:true });
    if(st.unsub) try{ st.unsub(); }catch(e){}
    st.unsub = st.mod.onSnapshot(r, function(s){
      st.data = s.exists() ? s.data() : null;
      if(window.ubBattleModes && window.ubBattleModes.applyRemoteState){
        window.ubBattleModes.applyRemoteState(st.data);
      }
    });
  }

  async function patch(obj){
    await fb();
    obj.updatedAt = Date.now();
    await st.mod.setDoc(ref(st.room), obj, { merge:true });
  }

  async function score(key, value){
    await fb();
    var data = st.data || base(st.room, 'showdown');
    var scores = Object.assign({}, data.scores || {});
    scores[key] = Math.max(0, (Number(scores[key]) || 0) + value);
    await patch({ scores:scores });
  }

  async function start(seconds){ await patch({ status:'live', startedAt:Date.now(), roundSeconds:seconds || 180 }); }
  async function stop(){ await patch({ status:'paused' }); }
  async function winner(name){ await patch({ status:'complete', winner:name }); }
  async function reset(){ await patch({ scores:{ teamA:0, teamB:0, artist1:0, artist2:0, dj1:0, dj2:0 }, votes:{}, winner:'' }); }

  async function bracketSize(size){ await patch({ bracket:{ size:size, round:1, match:1, champion:'' } }); }

  async function advance(name){
    var data = st.data || base(st.room, 'tournament');
    var b = Object.assign({ size:8, round:1, match:1, champion:'' }, data.bracket || {});
    b.match += 1;
    if(b.match > Math.max(1, b.size / Math.pow(2, b.round))){ b.round += 1; b.match = 1; }
    if(b.round > Math.log2(b.size)){ b.champion = name; }
    await patch({ bracket:b, winner:b.champion || name });
  }

  window.ubBattleSync = { open:open, patch:patch, score:score, start:start, stop:stop, winner:winner, reset:reset, bracketSize:bracketSize, advance:advance, state:st };
})();
