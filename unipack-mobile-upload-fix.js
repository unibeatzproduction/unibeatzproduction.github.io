// unipack-mobile-upload-fix.js
// Mobile UniPack upload fix: puts direct mobile inputs OUTSIDE old clickable upload zones.

function isUniPack() {
  return location.pathname.toLowerCase().includes('unipack.html');
}

function addStyle() {
  if (document.getElementById('ub-mobile-upload-style')) return;
  var style = document.createElement('style');
  style.id = 'ub-mobile-upload-style';
  style.textContent = '.ub-mobile-file-row{margin:12px 0 14px;padding:12px;border:1px solid rgba(64,208,255,.42);border-radius:10px;background:rgba(0,170,255,.08)}.ub-mobile-file-label{display:block;font-family:Orbitron,sans-serif;font-size:.52rem;letter-spacing:2px;color:#40D0FF;margin-bottom:7px}.ub-mobile-file-input{display:block;width:100%;padding:12px;border-radius:8px;background:#070710;color:#fff;border:1px solid rgba(201,168,76,.45);font-size:.86rem}.ub-mobile-file-note{margin-top:7px;font-size:.72rem;color:rgba(240,237,232,.58);line-height:1.35}@media(min-width:900px){.ub-mobile-file-row{display:none!important}}';
  document.head.appendChild(style);
}

function keepStudioVisible() {
  var studio = document.getElementById('page-studio');
  if (!studio) return;
  document.querySelectorAll('.page').forEach(function (page) { page.classList.remove('active'); });
  studio.classList.add('active');
}

// Fire keepStudioVisible aggressively when page regains focus after file picker
function setupFocusGuard() {
  if (window._ubFocusGuardSetup) return;
  window._ubFocusGuardSetup = true;

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      setTimeout(keepStudioVisible, 50);
      setTimeout(keepStudioVisible, 300);
      setTimeout(keepStudioVisible, 700);
    }
  });

  window.addEventListener('focus', function () {
    setTimeout(keepStudioVisible, 50);
    setTimeout(keepStudioVisible, 300);
  });

  window.addEventListener('pageshow', function () {
    setTimeout(keepStudioVisible, 50);
  });
}

function addMainMobileInput(sec) {
  var zone = document.getElementById('uploadZone' + sec);
  if (!zone || document.getElementById('ubMobileInput' + sec)) return;
  var row = document.createElement('div');
  row.className = 'ub-mobile-file-row';
  row.id = 'ubMobileRow' + sec;
  row.innerHTML = '<label class="ub-mobile-file-label">📱 MOBILE DIRECT UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileInput' + sec + '" type="file" accept="audio/*"><div class="ub-mobile-file-note">Use this box to upload on mobile instead of the gold area above.</div>';
  zone.insertAdjacentElement('afterend', row);

  var input = row.querySelector('input');

  input.addEventListener('click', function () {
    keepStudioVisible();
  });

  input.addEventListener('change', function () {
    keepStudioVisible();
    setTimeout(keepStudioVisible, 100);
    setTimeout(keepStudioVisible, 500);
    setTimeout(keepStudioVisible, 1000);
    setTimeout(keepStudioVisible, 2000);

    if (!input.files || !input.files[0]) return;

    if (typeof window.handleAudioUpload === 'function') {
      window.handleAudioUpload(input, sec);
    } else {
      // handleAudioUpload not ready yet — retry after a short delay
      setTimeout(function () {
        if (typeof window.handleAudioUpload === 'function') {
          window.handleAudioUpload(input, sec);
        } else {
          alert('Upload engine not ready yet. Refresh and try again.');
        }
      }, 800);
    }
  });
}

function addStemMobileInput() {
  var stemBox = document.getElementById('ub-stem-studio');
  if (!stemBox || document.getElementById('ubMobileStemInput')) return;
  var row = document.createElement('div');
  row.className = 'ub-mobile-file-row';
  row.id = 'ubMobileStemRow';
  row.innerHTML = '<label class="ub-mobile-file-label">📱 MOBILE STEM UPLOAD</label><input class="ub-mobile-file-input" id="ubMobileStemInput" type="file" multiple accept="audio/*"><div class="ub-mobile-file-note">Use this box to select stems on mobile.</div>';
  stemBox.insertAdjacentElement('afterend', row);

  var input = row.querySelector('input');

  input.addEventListener('click', function () {
    keepStudioVisible();
  });

  input.addEventListener('change', function () {
    keepStudioVisible();
    setTimeout(keepStudioVisible, 100);
    setTimeout(keepStudioVisible, 500);
    setTimeout(keepStudioVisible, 1000);
    setTimeout(keepStudioVisible, 2000);

    if (!input.files || !input.files.length) return;

    var files = Array.from(input.files);

    // Try to use unipack-stems.js internal stem handler
    // It listens for ubStemInput change — trigger it directly
    var stemInput = document.getElementById('ubStemInput');
    if (stemInput) {
      // Transfer files via DataTransfer
      try {
        var dt = new DataTransfer();
        files.forEach(function (f) { dt.items.add(f); });
        stemInput.files = dt.files;
        stemInput.dispatchEvent(new Event('change'));
        return;
      } catch (e) {
        console.warn('DataTransfer failed, falling back to custom event:', e);
      }
    }

    // Fallback: dispatch custom event (original behavior)
    document.dispatchEvent(new CustomEvent('ub-mobile-stems-selected', {
      detail: { files: files }
    }));
  });
}

function boot() {
  if (!isUniPack()) return;
  addStyle();
  setupFocusGuard();
  addMainMobileInput('A');
  addMainMobileInput('B');
  addStemMobileInput();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
setTimeout(boot, 800);
setTimeout(boot, 1800);
setTimeout(boot, 3200);
