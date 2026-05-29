// unipack-mobile-upload-fix.js
// Keeps UniPack Studio open after mobile file selection.

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
    }, true);
  });

  document.querySelectorAll('[onclick*="uploadInput"]').forEach(function (btn) {
    if (btn.dataset.mobileUploadFixed === 'yes') return;
    btn.dataset.mobileUploadFixed = 'yes';
    btn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      sessionStorage.setItem('ub_unipack_stay_studio', '1');
      forceStudioOpen();
      var sec = window.activeSection || 'A';
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
