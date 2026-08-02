// radio-talk-audio.js
// Audio processing — echo cancellation, noise suppression, gain

export const AudioConfig = {
  constraints: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    },
    video: false
  }
};

let _audioCtx = null;
let _hostGains = {}; // identity -> GainNode
let _analyserNodes = {}; // identity -> AnalyserNode
let _speakingCallbacks = {}; // identity -> cb

function getCtx(){
  if(!_audioCtx || _audioCtx.state === 'closed'){
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if(_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

export function setHostVolume(identity, vol){ // vol 0-1
  if(_hostGains[identity]) _hostGains[identity].gain.value = vol;
}

export function muteHost(identity, muted){
  setHostVolume(identity, muted ? 0 : 1);
}

// Attach a MediaStreamTrack to Web Audio and monitor speaking
export function attachTrack(identity, track, onSpeaking){
  const ctx = getCtx();
  const stream = new MediaStream([track]);
  const src = ctx.createMediaStreamSource(stream);

  const gain = ctx.createGain();
  gain.gain.value = 1;
  _hostGains[identity] = gain;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  _analyserNodes[identity] = analyser;

  src.connect(gain);
  gain.connect(analyser);
  gain.connect(ctx.destination);

  if(onSpeaking){
    _speakingCallbacks[identity] = onSpeaking;
    monitorSpeaking(identity, analyser, onSpeaking);
  }
}

export function detachTrack(identity){
  delete _hostGains[identity];
  delete _analyserNodes[identity];
  delete _speakingCallbacks[identity];
}

function monitorSpeaking(identity, analyser, cb){
  const buf = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  function tick(){
    if(!_analyserNodes[identity]) return;
    analyser.getByteFrequencyData(buf);
    const avg = buf.reduce((a,b) => a+b, 0) / buf.length;
    const isSpeaking = avg > 12;
    if(isSpeaking !== speaking){
      speaking = isSpeaking;
      cb(identity, speaking);
    }
    requestAnimationFrame(tick);
  }
  tick();
}

export function getMicStream(){
  return navigator.mediaDevices.getUserMedia(AudioConfig.constraints);
}
