// unipack-google-signin.js
// Adds Google Sign In button to UniBeatz Pack Studio login + signup pages

(function(){
  'use strict';

  function injectCss(){
    if(document.getElementById('ubGoogleCss')) return;
    var s=document.createElement('style'); s.id='ubGoogleCss';
    s.textContent=[
      '.ub-google-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;font-family:Rajdhani,sans-serif;font-size:1rem;font-weight:600;cursor:pointer;margin-top:10px;transition:all .2s;}',
      '.ub-google-btn:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.3);}',
      '.ub-google-btn svg{flex-shrink:0;}',
      '.ub-or-divider{display:flex;align-items:center;gap:10px;margin:14px 0;color:rgba(255,255,255,.3);font-size:.85rem;}',
      '.ub-or-divider::before,.ub-or-divider::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.1);}'
    ].join('');
    document.head.appendChild(s);
  }

  function googleSvg(){
    return '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 7.1 29.5 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 7.1 29.5 5 24 5 16.3 5 9.7 9.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 45c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.3C29.2 36.5 26.7 37 24 37c-5.2 0-9.7-3.3-11.4-8H6.2C9.6 38.8 16.3 45 24 45z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.9 2.4-2.5 4.5-4.6 6l6.2 5.3C42.5 36.9 44 31.2 44 25c0-1.3-.1-2.6-.4-3.9z"/></svg>';
  }

  function handleGoogleSignIn(){
    var fb=window.UB_FIREBASE;
    if(!fb||!fb.GoogleAuthProvider||!fb.signInWithPopup||!fb.auth){
      showFallbackToast('Google sign-in not ready. Try again in a moment.');
      return;
    }
    var provider=new fb.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    fb.signInWithPopup(fb.auth, provider).then(function(cred){
      var user=cred.user;
      // Build local user record matching existing format
      var users={};
      try{ users=JSON.parse(localStorage.getItem('ub_users')||'{}'); }catch(e){}
      var username=(user.displayName||user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g,'_');
      // Check if already exists
      var existing=null;
      for(var k in users){ if(users[k].email===user.email){ existing=users[k]; username=k; break; } }
      var userData=existing||{
        uid: user.uid,
        name: user.displayName||username,
        username: username,
        email: user.email,
        photo: user.photoURL||'',
        avatar: '🎤',
        role: 'artist',
        points:0, wins:0, losses:0, battles:0, votes:0, followers:0,
        joined: new Date().toLocaleDateString('en-US',{month:'short',year:'numeric'}),
        unipackTier: 'starter',
        isAdmin: user.email==='unibeatzproduction@gmail.com'
      };
      if(user.photoURL) userData.photo=user.photoURL;
      if(userData.isAdmin) userData.unipackTier='master';
      users[userData.username]=userData;
      localStorage.setItem('ub_users',JSON.stringify(users));
      localStorage.setItem('ub_current_user',JSON.stringify(userData));
      localStorage.setItem('ub_user',JSON.stringify(userData));
      // Also write to Firestore profiles
      if(fb.setDoc&&fb.doc&&fb.db){
        fb.setDoc(fb.doc(fb.db,'profiles',userData.username),{
          username:userData.username, name:userData.name, email:userData.email,
          photo:userData.photo, role:userData.role, authProvider:'google',
          uid:user.uid, updatedAt:Date.now()
        },{merge:true}).catch(function(){});
      }
      showFallbackToast('✅ Signed in as '+userData.name.split(' ')[0]+'!');
      // Use existing goPage if available
      setTimeout(function(){
        if(typeof window.goPage==='function') window.goPage('studio');
        else if(typeof window.setCurrentUser==='function') window.setCurrentUser(userData);
      },500);
    }).catch(function(e){
      if(e.code==='auth/popup-closed-by-user') return;
      showFallbackToast('Google sign-in failed: '+(e.message||e.code));
    });
  }

  function showFallbackToast(msg){
    if(typeof window.showToast==='function'){ window.showToast(msg); return; }
    var t=document.getElementById('toast');
    if(t){ t.textContent=msg; t.className='toast show'; setTimeout(function(){ t.classList.remove('show'); },3500); }
  }

  function injectButtons(){
    ['login','signup'].forEach(function(page){
      var card=document.querySelector('#page-'+page+' .auth-card');
      if(!card||card.querySelector('.ub-google-btn')) return;
      // Find the submit button
      var submitBtn=card.querySelector('.btn-gold.btn-full');
      if(!submitBtn) return;
      var divider=document.createElement('div');
      divider.className='ub-or-divider';
      divider.textContent='or';
      var btn=document.createElement('button');
      btn.className='ub-google-btn';
      btn.innerHTML=googleSvg()+' Continue with Google';
      btn.onclick=handleGoogleSignIn;
      submitBtn.insertAdjacentElement('afterend', divider);
      divider.insertAdjacentElement('afterend', btn);
    });
  }

  function boot(){
    injectCss();
    // Retry until pages exist
    var attempts=0;
    var t=setInterval(function(){
      attempts++;
      injectButtons();
      if(document.querySelector('#page-login .ub-google-btn')&&
         document.querySelector('#page-signup .ub-google-btn')){
        clearInterval(t);
      }
      if(attempts>30) clearInterval(t);
    },400);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
  setTimeout(boot,800);

})();
