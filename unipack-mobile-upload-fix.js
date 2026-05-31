// unipack-mobile-upload-fix.js
// Mobile UniPack upload fix: visible file inputs that do NOT bubble into old upload-zone click handlers.

function isUniPack() {
  return location.pathname.toLowerCase().includes('unipack.html');
}

function markStayStudio() {
  if (!isUniPack()) return;
  sessionStorage.setItem('ub_unipack_stay_studio', '1');
}

function keepCurrentStudioVisible() {
  if (!isUniPack()) return;
  document.querySelectorAll('.page').forEach(function (page) { page.classList.remove('active'); });
  var studio = document.getElementById('page-studio');
  if (studio) studio.classList.add('active');
}

function addStyle() {
  if (document.getElementById('ub-mobile-upload-style')) return;
  var style = document.createElement('style');
  style.id = 'ub-mobile-upload-style';
  style.textContent = '.ub-mobile-file-row{margin-top:12px;padding:10px;border:1px solid rgba(64,208,255,.35);border-radius:10px;background:rgba(0,170,255,.08)}.ub-mobile-file-label{display:block;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;color:#40D0FF;margin-bottom:7px}.ub-mobile-file-input{display:block;width:100%;padding:11px;border-radius:8px;background:#070710;color:#fff;border:1px solid rgba(201,168,76,.45);font-size:.82rem}.ub-mobile-file-note{margin-top:7px;font-size:.72rem;color:rgba(240,237,232,.58);line-height:1.35}@media(min-width:900px){.ub-mobile-file-row{display:none!important}}';
  document.head.appendChild(style);
}

function addMainMobileInput(sec) {
  var zone = document.getElementById('uploadZone' + sec);
  if (!zone || document.getElementById('ubMobileInput' + sec)) return;
  var row = document.createElement('div');
  row.className = 'ub-mobile-file-row';
  row.innerHTML = '<label class="ub-mobile-file-label">MOBILE DIRECT UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileInput' + sec + '" type="file" accept="audio/*"><div class="ub-mobile-file-note">Tap this box directly on phone/tablet.</div>';
  zone.appendChild(row);

  row.addEventListener('click', function (e) { e.stopPropagation(); }, true);
  row.addEventListener('pointerdown', function (e) { e.stopPropagation(); markStayStudio(); }, true);
  row.addEventListener('touchstart', function (e) { e.stopPropagation(); markStayStudio(); }, true);

  var input = row.querySelector('input');
  input.addEventListener('click', function (e) { e.stopPropagation(); markStayStudio(); }, true);
  input.addEventListener('change', function (e) {
    e.stopPropagation();
    markStayStudio();
    keepCurrentStudioVisible();
    if (typeof window.handleAudioUpload === 'function') {
      window.handleAudioUpload(input, sec);
    } else {
      alert('Upload engine not ready yet. Refresh and try again.');
    }
  }, true);
}

function addStemMobileInput() {
  var stemBox = document.getElementById('ub-stem-studio');
  if (!stemBox || document.getElementById('ubMobileStemInput')) return;
  var row = document.createElement('div');
  row.className = 'ub-mobile-file-row';
  row.innerHTML = '<label class="ub-mobile-file-label">MOBILE STEM DIRECT UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileStemInput" type="file" multiple accept="audio/*"><div class="ub-mobile-file-note">Tap this box directly to add stems on mobile.</div>';
  stemBox.appendChild(row);
  row.addEventListener('click', function (e) { e.stopPropagation(); }, true);
  row.addEventListener('pointerdown', function (e) { e.stopPropagation(); markStayStudio(); }, true);
  row.addEventListener('touchstart', function (e) { e.stopPropagation(); markStayStudio(); }, true);
  var input = row.querySelector('input');
  input.addEventListener('click', function (e) { e.stopPropagation(); markStayStudio(); }, true);
  input.addEventListener('change', function (e) {
    e.stopPropagation();
    markStayStudio();
    keepCurrentStudioVisible();
    document.dispatchEvent(new CustomEvent('ub-mobile-stems-selected', { detail: { files: Array.from(input.files || []) } }));
  }, true);
}

function attachGuards() {
  if (!isUniPack()) return;
  addStyle();
  addMainMobileInput('A');
  addMainMobileInput('B');
  addStemMobileInput();
}

function boot() {
  attachGuards();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

setTimeout(boot, 800);
setTimeout(boot, 1800);
setTimeout(boot, 3200);
