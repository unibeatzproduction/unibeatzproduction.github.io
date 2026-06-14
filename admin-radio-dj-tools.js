function addDjTools(){
  const adminApp = document.getElementById('adminApp');
  if(!adminApp || document.getElementById('adminDjToolsPanel')) return;
  const hero = adminApp.querySelector('.hero');
  const panel = document.createElement('div');
  panel.id = 'adminDjToolsPanel';
  panel.className = 'panel';
  panel.style.marginTop = '14px';
  panel.innerHTML = `
    <div class="eyebrow">ADMIN DJ CONTROL ROOM</div>
    <h2>DJ Deck Tools</h2>
    <p class="small">The DJ Deck is now admin-side. Use this for MIDI equipment, Stream Deck pads, crossfader, queue management, mic toggle, station drops, voiceovers, podcasts, and live broadcast mode.</p>
    <div class="actions">
      <a class="btn btn-gold" href="radio-dj-deck.html">Open Admin DJ Deck</a>
      <a class="btn btn-blue" href="radio-dj-apply.html">DJ Application Page</a>
    </div>
  `;
  if(hero) hero.insertAdjacentElement('afterend', panel);
  else adminApp.prepend(panel);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addDjTools);
else addDjTools();
window.addEventListener('ub-firebase-ready', addDjTools);
setTimeout(addDjTools, 1000);
