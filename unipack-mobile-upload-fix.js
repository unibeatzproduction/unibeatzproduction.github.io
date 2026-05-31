// unipack-mobile-upload-fix.js
// Passive mobile guard: never touches file input change events.
// The native UniPack onchange handlers load beats/stems. This only restores Studio after mobile file picker returns.

function isUniPack() {
  return location.pathname.toLowerCase().includes('unipack.html');
}

function forceStudioOpenSoft() {
  if (!isUniPack()) return;
  try {
    if (typeof window.goPage === 'function') {
      var waveA = document.getElementById('waveformSectionA');
      var waveB = document.getElementById('waveformSectionB');
      var loadedA = waveA && waveA.style.display !== 'none';
      var loadedB = waveB && waveB.style.display !== 'none';
      window.goPage('studio');
      if (loadedA && waveA) waveA.style.display = 'block';
      if (loadedB && waveB) waveB.style.display = 'block';
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

function attachPassiveGuards() {
  if (!isUniPack()) return;

  // Only mark intent before file picker opens. Do not prevent, stop, or handle file changes.
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
