// unifreestyle-cypher-fix.js
// Makes the existing Cypher room visible from Home and Battle setup.

function isFreestylePage() {
  return location.pathname.toLowerCase().includes('unifreestyle.html');
}

function openCypherRoom() {
  if (typeof window.goToPage === 'function') {
    window.goToPage('cypher');
  } else {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var page = document.getElementById('page-cypher');
    if (page) page.classList.add('active');
  }
}

function addCypherStyles() {
  if (document.getElementById('ub-cypher-launch-style')) return;
  var style = document.createElement('style');
  style.id = 'ub-cypher-launch-style';
  style.textContent = [
    '.ub-cypher-launch{margin:14px 14px 18px;padding:16px;background:linear-gradient(135deg,rgba(201,168,76,.14),rgba(0,170,255,.10));border:1px solid rgba(201,168,76,.42);border-radius:12px;cursor:pointer;box-shadow:0 16px 38px rgba(0,0,0,.34);position:relative;overflow:hidden}',
    '.ub-cypher-launch:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 20% 0,rgba(64,208,255,.18),transparent 38%);pointer-events:none}',
    '.ub-cypher-launch-inner{position:relative;display:flex;align-items:center;gap:14px}',
    '.ub-cypher-icon{font-size:2.3rem;flex-shrink:0}',
    '.ub-cypher-title{font-family:"Bebas Neue",sans-serif;font-size:1.45rem;letter-spacing:2px;color:#F0C040;line-height:1}',
    '.ub-cypher-sub{font-size:.8rem;color:rgba(240,237,232,.68);line-height:1.35;margin-top:4px}',
    '.ub-cypher-badge{display:inline-flex;margin-bottom:6px;padding:3px 8px;border-radius:999px;border:1px solid #40D0FF;color:#40D0FF;font-family:Orbitron,sans-serif;font-size:.42rem;letter-spacing:2px;font-weight:800}',
    '.ub-cypher-arrow{margin-left:auto;font-size:1.5rem;color:#C9A84C}'
  ].join('');
  document.head.appendChild(style);
}

function makeCypherCard() {
  var card = document.createElement('div');
  card.className = 'ub-cypher-launch';
  card.onclick = openCypherRoom;
  card.innerHTML = '<div class="ub-cypher-launch-inner"><div class="ub-cypher-icon">🌀</div><div style="flex:1"><div class="ub-cypher-badge">NEW MODE · LIVE</div><div class="ub-cypher-title">CYPHER ROOM</div><div class="ub-cypher-sub">Multi-artist freestyle circle · 60-sec turns · DJ controls rotation</div></div><div class="ub-cypher-arrow">→</div></div>';
  return card;
}

function injectCypherLauncher() {
  if (!isFreestylePage()) return;
  if (!document.getElementById('page-cypher')) return;
  addCypherStyles();

  var homeBody = document.querySelector('#page-home .page-body');
  if (homeBody && !document.getElementById('ub-cypher-home-launch')) {
    var homeCard = makeCypherCard();
    homeCard.id = 'ub-cypher-home-launch';
    homeBody.insertBefore(homeCard, homeBody.firstChild);
  }

  var queueBody = document.querySelector('#page-queue .page-body');
  if (queueBody && !document.getElementById('ub-cypher-queue-launch')) {
    var queueCard = makeCypherCard();
    queueCard.id = 'ub-cypher-queue-launch';
    var insertAfter = queueBody.children[1] || queueBody.firstChild;
    if (insertAfter && insertAfter.nextSibling) queueBody.insertBefore(queueCard, insertAfter.nextSibling);
    else queueBody.appendChild(queueCard);
  }
}

// Safety fallbacks if Cypher functions were not loaded yet.
window.openCypherRoom = openCypherRoom;
if (typeof window.leaveCypher !== 'function') {
  window.leaveCypher = function () { if (typeof window.goToPage === 'function') window.goToPage('queue'); };
}
if (typeof window.joinCypher !== 'function') {
  window.joinCypher = function (role) {
    var tip = document.getElementById('cyTip');
    if (tip) tip.innerHTML = '<strong>Joined as ' + role + '.</strong> Cypher controls are ready for live testing.';
    if (typeof window.showToast === 'function') window.showToast('🌀 Joined Cypher as ' + role);
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectCypherLauncher);
} else {
  injectCypherLauncher();
}
setTimeout(injectCypherLauncher, 800);
setTimeout(injectCypherLauncher, 1800);
