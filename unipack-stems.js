// unipack-stems.js
// Adds Stem Studio as a 4th tab matching ONE-SHOTS / LOOPS / MIDI style

function cleanText(value) {
  return String(value || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function waitFor(selector, tries, done) {
  var count = 0;
  var timer = setInterval(function () {
    count += 1;
    var el = document.querySelector(selector);
    if (el || count >= tries) { clearInterval(timer); done(el); }
  }, 250);
}

function updateLandingCopy() {
  var tagline = document.querySelector('.hero-tagline');
  if (tagline) tagline.textContent = 'TURN YOUR BEAT OR STEMS INTO A SAMPLE PACK';
  var desc = document.querySelector('.hero-desc');
  if (desc) {
    desc.innerHTML = 'UniBeatz Pack Studio chops, organizes, labels, and exports beats or uploaded stems into a clean sample pack — stems, drums, loops, one-shots, MIDI notes, artwork, and metadata. <strong style="color:var(--gold-light);">Built for producers who want clean packs fast.</strong>';
  }
  document.querySelectorAll('.demo-step-desc').forEach(function (el) {
    if ((el.textContent || '').includes('Upload your finished beat')) {
      el.textContent = 'Upload your finished beat, full stems, drum stems, or melody stems.';
    }
    if ((el.textContent || '').includes('One click')) {
      el.textContent = 'One click — organized folders for Stems, Loops, One-Shots, MIDI, and artwork.';
    }
  });
}

function addStemStudio() {
  if (!location.pathname.toLowerCase().includes('unipack.html')) return;
  if (document.getElementById('tab-stems')) return;

  updateLandingCopy();

  waitFor('.section-tabs', 40, function (tabs) {
    if (!tabs || document.getElementById('tab-stems')) return;

    // ── Add STEMS tab button ──
    var stemTab = document.createElement('div');
    stemTab.className = 'section-tab';
    stemTab.id = 'tab-stems';
    stemTab.onclick = function () { switchToStems(); };
    stemTab.innerHTML = [
      '🎚️ STEMS',
      '<span class="tab-label">Organize · Package · Export</span>',
      '<span class="tab-count" id="tab-stems-count">0 stems</span>'
    ].join('');
    tabs.appendChild(stemTab);

    // ── Add STEMS panel ──
    var workspace = tabs.closest('.workspace') || tabs.parentNode;
    var panel = document.createElement('div');
    panel.className = 'section-panel';
    panel.id = 'panel-stems';
    panel.innerHTML = [
      // Drop zone (matches upload-zone style)
      '<input id="ubStemInput" type="file" multiple accept="audio/*" style="display:none"/>',
      '<div class="upload-zone" id="ubStemDropZone" onclick="document.getElementById(\'ubStemInput\').click()" ondragover="event.preventDefault();this.classList.add(\'dragging\')" ondragleave="this.classList.remove(\'dragging\')" ondrop="window.ubStemHandleDrop(event)">',
      '  <div class="upload-icon">🎚️</div>',
      '  <div class="upload-title">Add Your Stems</div>',
      '  <div class="upload-desc">Drums · Bass · Melody · Vocals · FX · Full song stems</div>',
      '  <button class="btn-gold">Choose Files</button>',
      '</div>',
      // Controls row (shown after stems added)
      '<div id="ubStemControls" style="display:none;margin:12px 0;">',
      '  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">',
      '    <button class="tool-btn" onclick="document.getElementById(\'ubStemInput\').click()">➕ Add More</button>',
      '    <button class="tool-btn primary" id="ubStemZipBtn" onclick="window.ubExportStemsZip()">📦 Export Stems ZIP</button>',
      '    <button class="tool-btn danger" onclick="window.ubClearStems()">🗑️ Clear All</button>',
      '  </div>',
      '  <div id="ubStemList" style="display:grid;gap:8px;"></div>',
      '</div>',
      // Info tip
      '<div class="cy-tip" style="margin-top:14px;">',
      '  <strong style="color:var(--blue-bright);">Stem Packaging:</strong> Organizes your stems into a <code>/Stems</code> folder inside a ZIP. This is stem packaging, not AI stem separation.',
      '</div>'
    ].join('');
    workspace.appendChild(panel);

    // ── State ──
    var stems = [];

    function updateCount() {
      var el = document.getElementById('tab-stems-count');
      if (el) el.textContent = stems.length + ' stem' + (stems.length !== 1 ? 's' : '');
    }

    function draw() {
      var dropZone = document.getElementById('ubStemDropZone');
      var controls = document.getElementById('ubStemControls');
      var list = document.getElementById('ubStemList');
      if (!list) return;

      if (!stems.length) {
        if (dropZone) dropZone.style.display = 'block';
        if (controls) controls.style.display = 'none';
        return;
      }

      if (dropZone) dropZone.style.display = 'none';
      if (controls) controls.style.display = 'block';

      list.innerHTML = stems.map(function (file, index) {
        var mb = Math.round(file.size / 1024 / 1024 * 10) / 10;
        var ext = file.name.split('.').pop().toUpperCase();
        return [
          '<div style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:rgba(0,0,0,.25);">',
          '  <span style="font-size:1.2rem;">🎧</span>',
          '  <div>',
          '    <div style="font-family:Rajdhani,sans-serif;font-size:.92rem;color:#F0EDE8;font-weight:600;">' + cleanText(file.name) + '</div>',
          '    <div style="font-family:Orbitron,sans-serif;font-size:.4rem;letter-spacing:1.5px;color:rgba(240,237,232,.5);margin-top:2px;">' + ext + ' · ' + mb + ' MB</div>',
          '  </div>',
          '  <button class="tool-btn danger" style="padding:6px 10px;font-size:.44rem;" data-stem-remove="' + index + '">Remove</button>',
          '</div>'
        ].join('');
      }).join('');

      list.querySelectorAll('[data-stem-remove]').forEach(function (btn) {
        btn.onclick = function () {
          stems.splice(Number(btn.getAttribute('data-stem-remove')), 1);
          draw();
          updateCount();
        };
      });

      updateCount();
    }

    // File input change
    var input = document.getElementById('ubStemInput');
    input.onchange = function () {
      stems = stems.concat(Array.from(input.files || []));
      input.value = '';
      draw();
      updateCount();
    };

    // Mobile stems event (from unipack-mobile-upload-fix.js)
    document.addEventListener('ub-mobile-stems-selected', function (e) {
      if (e.detail && e.detail.files) {
        stems = stems.concat(e.detail.files);
        draw();
        updateCount();
      }
    });

    // Globals
    window.ubStemHandleDrop = function (e) {
      e.preventDefault();
      var zone = document.getElementById('ubStemDropZone');
      if (zone) zone.classList.remove('dragging');
      var files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) {
        stems = stems.concat(files);
        draw();
        updateCount();
      }
    };

    window.ubClearStems = function () {
      stems = [];
      draw();
      updateCount();
    };

    window.ubExportStemsZip = async function () {
      if (!stems.length) { if (typeof showToast === 'function') showToast('Add stems first.', 'error'); else alert('Add stems first.'); return; }
      if (!window.JSZip) { if (typeof showToast === 'function') showToast('ZIP engine not loaded yet. Refresh and try again.', 'error'); else alert('ZIP engine not loaded yet.'); return; }
      if (typeof showToast === 'function') showToast('📦 Building stems ZIP...');
      var zip = new JSZip();
      var folder = zip.folder('Stems');
      stems.forEach(function (file, index) {
        folder.file(String(index + 1).padStart(2, '0') + '_' + file.name.replace(/\s+/g, '_'), file);
      });
      var blob = await zip.generateAsync({ type: 'blob' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'UniBeatz_Stem_Pack.zip';
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
      if (typeof showToast === 'function') showToast('✅ Stems ZIP exported!', 'success');
    };

    // Expose stems array for mobile fix
    window._ubGetStems = function () { return stems; };
    window._ubAddStems = function (files) {
      stems = stems.concat(files);
      draw();
      updateCount();
    };

    draw();
  });
}

// ── Switch to Stems tab ──
function switchToStems() {
  document.querySelectorAll('.section-tab').forEach(function (t) { t.classList.remove('active'); });
  document.querySelectorAll('.section-panel').forEach(function (p) { p.classList.remove('active'); });
  var tab = document.getElementById('tab-stems');
  var panel = document.getElementById('panel-stems');
  if (tab) tab.classList.add('active');
  if (panel) panel.classList.add('active');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addStemStudio);
} else {
  addStemStudio();
}
setTimeout(addStemStudio, 1200);
setTimeout(addStemStudio, 2600);
