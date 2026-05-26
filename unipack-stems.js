// unipack-stems.js
// Adds Stem Studio to UniBeatz Pack Studio without touching the main app file.

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
    if (el || count >= tries) {
      clearInterval(timer);
      done(el);
    }
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
  if (document.getElementById('ub-stem-studio')) return;

  updateLandingCopy();

  waitFor('.section-tabs', 40, function (tabs) {
    if (!tabs || document.getElementById('ub-stem-studio')) return;

    var box = document.createElement('div');
    box.id = 'ub-stem-studio';
    box.style.cssText = 'margin:14px 0;padding:16px;border:1px solid rgba(0,170,255,.38);border-radius:14px;background:linear-gradient(135deg,rgba(0,170,255,.10),rgba(201,168,76,.07));color:#fff';
    box.innerHTML = [
      '<div style="font-family:Orbitron,sans-serif;font-size:.62rem;letter-spacing:2px;color:#40D0FF;margin-bottom:7px">STEM STUDIO</div>',
      '<div style="font-family:Bebas Neue,sans-serif;font-size:2rem;color:#F0C040;letter-spacing:2px">Upload Stems Into The Pack</div>',
      '<p style="opacity:.78;line-height:1.45;margin:6px 0 12px">Add drums, bass, melody, vocals, FX, or full-song stems. Stem Studio organizes them into a /Stems folder inside a ZIP. This is stem packaging, not AI stem separation.</p>',
      '<input id="ubStemInput" type="file" multiple accept="audio/*" style="display:none">',
      '<div style="display:flex;gap:8px;flex-wrap:wrap">',
      '<button class="tool-btn primary" id="ubStemPick">🎚️ Add Stems</button>',
      '<button class="tool-btn" id="ubStemZip">📦 Export Stems ZIP</button>',
      '<button class="tool-btn danger" id="ubStemClear">🗑️ Clear Stems</button>',
      '</div>',
      '<div id="ubStemList" style="margin-top:12px;display:grid;gap:8px"></div>'
    ].join('');

    tabs.parentNode.insertBefore(box, tabs.nextSibling);

    var stems = [];
    var input = box.querySelector('#ubStemInput');
    var list = box.querySelector('#ubStemList');

    function draw() {
      if (!stems.length) {
        list.innerHTML = '<div style="opacity:.62">No stems added yet.</div>';
        return;
      }
      list.innerHTML = stems.map(function (file, index) {
        var mb = Math.round(file.size / 1024 / 1024 * 10) / 10;
        return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 11px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(0,0,0,.25)"><span>🎧 ' + cleanText(file.name) + ' <small style="opacity:.6">' + mb + 'MB</small></span><button class="tool-btn danger" data-stem-remove="' + index + '">Remove</button></div>';
      }).join('');
      list.querySelectorAll('[data-stem-remove]').forEach(function (btn) {
        btn.onclick = function () {
          stems.splice(Number(btn.getAttribute('data-stem-remove')), 1);
          draw();
        };
      });
    }

    box.querySelector('#ubStemPick').onclick = function () { input.click(); };
    input.onchange = function () {
      stems = stems.concat(Array.from(input.files || []));
      input.value = '';
      draw();
    };
    box.querySelector('#ubStemClear').onclick = function () {
      stems = [];
      draw();
    };
    box.querySelector('#ubStemZip').onclick = async function () {
      if (!stems.length) return alert('Add stems first.');
      if (!window.JSZip) return alert('ZIP engine not loaded yet. Refresh and try again.');
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
    };

    draw();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addStemStudio);
} else {
  addStemStudio();
}
setTimeout(addStemStudio, 1200);
setTimeout(addStemStudio, 2600);
