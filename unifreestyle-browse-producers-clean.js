(function(){
'use strict';
function n(s){return String(s||'').replace(/\s+/g,' ').trim().toLowerCase()}
function e(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function g(k,f){try{return JSON.parse(localStorage.getItem(k)||f)}catch(x){return JSON.parse(f)}}
function p(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(x){}}
function u(o){return(o&&(o.username||o.name))?String(o.username||o.name).toLowerCase().replace(/[^a-z0-9_]/g,''):''}
function cur(){return g('ub_current_user','null')||g('ub_user','null')||{}}
function users(){return g('ub_users','{}')}
function follows(){return g('ub_profile_follows_v1','{}')}
function saveFollows(f){p('ub_profile_follows_v1',f)}
function live(t){try{return localStorage.getItem('ub_profile_live_'+t)==='1'}catch(x){return false}}
function real(){var out=[], all=users(), c=cur(), cn=u(c), seen={}; Object.keys(all||{}).forEach(function(k){var x=all[k]; if(x&&u(x)) out.push(x)}); if(cn&&!out.some(function(x){return u(x)===cn})) out.unshift(c); return out.filter(function(x){var name=u(x); if(!name||name==='djblaze'||name==='phantombeats'||seen[name]) return false; seen[name]=1; return true})}
function following(t){return !!follows()[u(cur())+'__'+t]}
function follow(t){var me=u(cur()); if(!me||me===t)return; var f=follows(), k=me+'__'+t; if(f[k]) delete f[k]; else f[k]={follower:me,following:t,at:Date.now()}; saveFollows(f); render()}
function watch(t){if(window.showToast)showToast(live(t)?'🔴 Watching @'+t+' live':'@'+t+' is not live right now')}
function profile(t){try{localStorage.setItem('ub_view_producer_profile',t)}catch(x){} if(window.goToPage)goToPage('profile')}
function render(){var page=document.getElementById('page-browseproducer'); if(!page||!page.classList.contains('active'))return; var list=document.getElementById('ubProducerList'); if(!list)return; var input=document.getElementById('ubProducerSearchInput'); var q=n(input&&input.value); var data=real().filter(function(x){return !q||n((x.name||'')+' '+(x.username||'')+' '+(x.bio||'')+' '+(x.role||'')).indexOf(q)>-1}); list.innerHTML=data.map(function(x){var name=u(x), isLive=live(name), fol=following(name), av=x.photo?'<img src="'+e(x.photo)+'">':e(x.avatar||'🎤'); return '<div class="ub-producer-row"><div class="ub-prod-avatar">'+av+'</div><div><div class="ub-prod-name">'+e(x.name||name)+' '+(isLive?'🔴':'')+'</div><div class="ub-prod-user">@'+e(name)+' · '+e(x.role||'artist')+'</div><div class="ub-prod-bio">'+e(x.bio||'Producer on Uni Freestyle.')+'</div></div><div class="ub-prod-actions"><button class="'+(fol?'ub-btn-blue':'ub-btn-gold')+'" onclick="ubBrowseProducersClean.follow(\''+name+'\')">'+(fol?'FOLLOWING':'FOLLOW')+'</button><button class="'+(isLive?'ub-btn-red':'ub-btn-blue')+'" onclick="ubBrowseProducersClean.watch(\''+name+'\')">'+(isLive?'WATCH LIVE':'NOT LIVE')+'</button><button class="ub-btn-blue" onclick="ubBrowseProducersClean.profile(\''+name+'\')">PROFILE</button></div></div>'}).join('')||'<div style="padding:14px;color:rgba(240,237,232,.65);">No producers found. Sign in or sync users from Firebase.</div>'}
window.ubBrowseProducersClean={render:render,follow:follow,watch:watch,profile:profile};
function boot(){if(window.ubHomeSessions){window.ubHomeSessions.renderProducers=render; var old=window.ubHomeSessions.openBrowseProducers; window.ubHomeSessions.openBrowseProducers=function(){if(old)old();setTimeout(render,80)}} render()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot(); setTimeout(boot,500); setInterval(render,1000);
})();