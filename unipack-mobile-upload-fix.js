// unipack-mobile-upload-fix.js
// Mobile UniPack upload fix: adds real visible file inputs so mobile browsers fire onchange reliably.

function isUniPack() {
  return location.pathname.toLowerCase().includes('unipack.html');
}

function forceStudioOpenSoft() {
  if (!isUniPack()) return;
  try {
    if (typeof window.goPage === 'function') {
      window.goPage('studio');
      return;
    }
  } catch (e) {}
  document.querySelectorAll('.page').forEach(function (page) { page.classList.remove('active'); });
  var studio = document.getElementById('page-studio');
  if (studio) studio.classList.add('active');
}

function markStayStudio() {
  if (!isUniPack()) return;
  sessionStorage.setItem('ub_unipack_stay_studio', '1');
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
  row.innerHTML = '<label class="ub-mobile-file-label">MOBILE DIRECT UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileInput' + sec + '" type="file" accept="audio/*"><div class="ub-mobile-file-note">Use this on phone/tablet if the gold Choose File button does not load audio.</div>';
  zone.appendChild(row);
  var input = row.querySelector('input');
  input.addEventListener('change', function () {
    markStayStudio();
    forceStudioOpenSoft();
    if (typeof window.handleAudioUpload === 'function') {
      window.handleAudioUpload(input, sec);
    } else {
      alert('Upload engine not ready yet. Refresh and try again.');
    }
  });
}

function addStemMobileInput() {
  var stemBox = document.getElementById('ub-stem-studio');
  if (!stemBox || document.getElementById('ubMobileStemInput')) return;
  var row = document.createElement('div');
  row.className = 'ub-mobile-file-row';
  row.innerHTML = '<label class="ub-mobile-file-label">MOBILE STEM DIRECT UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileStemInput" type="file" multiple accept="audio/*"><div class="ub-mobile-file-note">Use this on phone/tablet to add stems directly.</div>';
  stemBox.appendChild(row);
  var input = row.querySelector('input');
  input.addEventListener('change', function () {
    markStayStudio();
    var original = document.getElementById('ubStemInput');
    if (original) {
      // The browser will not let us copy FileList into another input reliably, so trigger Stem Studio's list directly if available.
      var event = new CustomEvent('ub-mobile-stems-selected', { detail: { files: Array.from(input.files || []) } });
      document.dispatchEvent(event);
    }
  });
}

function attachPassiveGuards() {
  if (!isUniPack()) return;
  addStyle();
  addMainMobileInput('A');
  addMainMobileInput('B');
  addStemMobileInput();
  document.querySelectorAll('#uploadZoneA,#uploadZoneB,#ub-stem-studio,[onclick*="uploadInput"],[onclick*="ubStemInput"]').forEach(function (el) {
    if (!el || el.dataset.ubPassiveGuard === 'yes') return;
    el.dataset.ubPassiveGuard = 'yes';
    el.addEventListener('pointerdown', markStayStudio, { passive: true });
    el.addEventListener('touchstart', markStayStudio, { passive: true });
    el.addEventListener('click', markStayStudio, { passive: true });
  });
}

function maybeRestoreStudio() {
  if (!isUniPack()) return;
  if (sessionStorage.getItem('ub_unipack_stay_studio') !== '1') return;
  setTimeout(forceStudioOpenSoft, 150);
  setTimeout(forceStudioOpenSoft, 600);
}

function boot() {
  attachPassiveGuards();
  maybeRestoreStudio();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.addEventListener('focus', maybeRestoreStudio);
window.addEventListener('pageshow', maybeRestoreStudio);
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) maybeRestoreStudio();
});
setTimeout(boot, 800);
setTimeout(boot, 1800);
setTimeout(boot, 3200);
