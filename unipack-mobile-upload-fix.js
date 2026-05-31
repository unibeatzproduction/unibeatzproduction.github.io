// unipack-mobile-upload-fix.js
// Keeps UniPack Studio open and forces audio loading after mobile file selection.

function forceStudioOpen() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;

  try {
    if (typeof window.goPage === 'function') {
      window.goPage('studio');
      return;
    }
  } catch (e) {}

  document.querySelectorAll('.page').forEach(function (page) {
    page.classList.remove('active');
  });
  var studio = document.getElementById('page-studio');
  if (studio) studio.classList.add('active');
}

function getCurrentSection() {
  var activeTab = document.querySelector('.section-tab.active');
  if (activeTab && activeTab.id === 'tab-loops') return 'B';
  return 'A';
}

function forceAudioLoad(input, sec) {
  if (!input || !input.files || !input.files[0]) return;
  forceStudioOpen();

  var file = input.files[0];
  var beforeName = '';
  try {
    var state = window.SEC && window.SEC[sec];
    beforeName = state && state.trackName ? state.trackName : '';
  } catch (e) {}

  setTimeout(function () {
    try {
      var waveform = document.getElementById('waveformSection' + sec);
      var isVisible = waveform && waveform.style.display !== 'none' && waveform.offsetParent !== null;
      var state = window.SEC && window.SEC[sec];
      var loaded = isVisible || (state && state.audioBuffer);

      if (!loaded && typeof window.handleAudioUpload === 'function') {
        window.handleAudioUpload(input, sec);
      }
    } catch (e) {
      console.warn('[UniPack Mobile Upload Fix] retry failed:', e);
    }
  }, 300);

  setTimeout(function () {
    try {
      var waveform = document.getElementById('waveformSection' + sec);
      var state = window.SEC && window.SEC[sec];
      var loaded = (waveform && waveform.style.display !== 'none') || (state && state.audioBuffer);
      if (!loaded && typeof window.showToast === 'function') {
        window.showToast('Still loading audio. Try MP3 or smaller WAV if it does not appear.');
      }
    } catch (e) {}
  }, 2500);
}

function protectUploadInputs() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;

  ['A', 'B'].forEach(function (sec) {
    var input = document.getElementById('uploadInput' + sec);
    if (!input || input.dataset.mobileUploadFixed === 'yes') return;
    input.dataset.mobileUploadFixed = 'yes';

    input.addEventListener('click', function () {
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      forceStudioOpen();
    }, true);

    input.addEventListener('change', function () {
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      forceStudioOpen();
      setTimeout(forceStudioOpen, 150);
      setTimeout(forceStudioOpen, 600);
      setTimeout(forceStudioOpen, 1600);
      forceAudioLoad(input, sec);
    }, false);
  });

  document.querySelectorAll('[onclick*="uploadInput"]').forEach(function (btn) {
    if (btn.dataset.mobileUploadFixed === 'yes') return;
    btn.dataset.mobileUploadFixed = 'yes';
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      forceStudioOpen();
      var sec = getCurrentSection();
      var input = document.getElementById('uploadInput' + sec);
      if (input) input.click();
      return false;
    }, true);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
setTimeout(boot, 800);
setTimeout(boot, 1800);
