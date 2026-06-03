(function () {
  'use strict';

  let midiAccess = null;

  async function initMidiMonitor() {
    if (!navigator.requestMIDIAccess) {
      console.log('Web MIDI not supported');
      return;
    }

    try {
      midiAccess = await navigator.requestMIDIAccess();

      midiAccess.inputs.forEach((input) => {
        input.onmidimessage = handleMidiMessage;
      });

      console.log('MIDI Monitor Ready');
    } catch (err) {
      console.error(err);
    }
  }

  function handleMidiMessage(event) {
    const [status, data1, data2] = event.data;

    console.log(
      'MIDI:',
      'Status:', status,
      'Data1:', data1,
      'Data2:', data2
    );

    const monitor = document.getElementById('ubMidiMonitor');

    if (monitor) {
      monitor.innerHTML = `
        <div>STATUS: ${status}</div>
        <div>DATA1: ${data1}</div>
        <div>DATA2: ${data2}</div>
      `;
    }
  }

  function createMonitorPanel() {
    if (document.getElementById('ubMidiMonitor')) return;

    const panel = document.createElement('div');

    panel.id = 'ubMidiMonitor';

    panel.style.cssText = `
      position:fixed;
      right:20px;
      top:120px;
      z-index:99999;
      background:#05070d;
      color:#40D0FF;
      border:1px solid #40D0FF;
      padding:12px;
      border-radius:10px;
      font-family:Orbitron,sans-serif;
      min-width:180px;
    `;

    panel.innerHTML = `
      <div>MIDI READY</div>
      <div>Press FLkey controls</div>
    `;

    document.body.appendChild(panel);
  }

  async function boot() {
    createMonitorPanel();
    await initMidiMonitor();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
