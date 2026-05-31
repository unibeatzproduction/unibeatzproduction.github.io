// unipack-mobile-upload-fix.js
// Mobile-safe UniPack guard: keep Studio open WITHOUT blocking native upload handlers.

function forceStudioOpen() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;
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

function getSectionFromInput(input) {
  if (!input || !input.id) return 'A';
  if (input.id.toLowerCase().includes('b')) return 'B';
  return 'A';
}

function getCurrentSection() {
  var activeTab = document.querySelector('.section-tab.active');
  if (activeTab && activeTab.id === 'tab-loops') return 'B';
  return 'A';
}

function isLoaded(sec) {
  try {
    var waveform = document.getElementById('waveformSection' + sec);
    var visible = waveform && waveform.style.display !== 'none';
    return !!visible;
  } catch (e) { return false; }
}

function manualLoadIfNeeded(input, sec) {
  if (!input || !input.files || !input.files[0]) return;
  setTimeout(function () {
    forceStudioOpen();
    if (isLoaded(sec)) return;
    try {
      if (typeof window.handleAudioUpload === 'function') {
        window.handleAudioUpload(input, sec);
      }
    } catch (e) {
      console.warn('[UniPack mobile] manual audio call failed', e);
    }
  }, 500);
  setTimeout(function () {
    forceStudioOpen();
    if (!isLoaded(sec) && typeof window.showToast === 'function') {
      window.showToast('File selected. If waveform does not show, tap Upload again once.');
    }
  }, 2500);
}

function protectUploadInputs() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;

  document.querySelectorAll('input[type="file"]').forEach(function (input) {
    var id = input.id || '';
    var isMainUpload = id === 'uploadInputA' || id === 'uploadInputB';
    var isStemUpload = id === 'ubStemInput';
    if (!isMainUpload && !isStemUpload) return;
    if (input.dataset.mobileUploadFixed === 'yes') return;
    input.dataset.mobileUploadFixed = 'yes';

    input.addEventListener('click', function () {
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      setTimeout(forceStudioOpen, 100);
    }, false);

    input.addEventListener('change', function () {
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      var sec = getSectionFromInput(input);
      setTimeout(forceStudioOpen, 80);
      setTimeout(forceStudioOpen, 350);
      setTimeout(forceStudioOpen, 1000);
      if (isMainUpload) manualLoadIfNeeded(input, sec);
    }, false);
  });

  // IMPORTANT: do not preventDefault / stopPropagation here.
  // The original inline onclick handlers must still run.
  document.querySelectorAll('[onclick*="uploadInput"], [onclick*="ubStemInput"]').forEach(function (btn) {
    if (btn.dataset.mobileUploadFixedBtn === 'yes') return;
    btn.dataset.mobileUploadFixedBtn = 'yes';
    btn.addEventListener('click', function () {
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      setTimeout(forceStudioOpen, 100);
      setTimeout(forceStudioOpen, 500);
    }, false);
  });
}

function boot() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;
  protectUploadInputs();
  if (sessionStorage.getItem('ub_unipack_stay_studio') === '1') {
    setTimeout(forceStudioOpen, 50);
    setTimeout(forceStudioOpen, 400);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
setTimeout(boot, 800);
setTimeout(boot, 1800);
setTimeout(boot, 3200);
