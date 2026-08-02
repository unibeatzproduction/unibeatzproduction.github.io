// radio-talk-recording.js
// Records DJ music + all mics into one master mix

let _recorder = null;
let _chunks = [];
let _startTime = null;
let _timerInterval = null;
let _destNode = null;
let _ctx = null;

export function initRecordingBus(audioCtx){
  _ctx = audioCtx;
  _destNode = audioCtx.createMediaStreamDestination();
  return _destNode;
}

export function getRecordingDestination(){
  return _destNode;
}

export function startRecording(onTick){
  if(!_destNode){ console.error('[recording] No destination node'); return; }
  _chunks = [];
  _recorder = new MediaRecorder(_destNode.stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'
  });
  _recorder.ondataavailable = e => { if(e.data.size > 0) _chunks.push(e.data); };
  _recorder.start(1000);
  _startTime = Date.now();

  if(onTick){
    _timerInterval = setInterval(() => {
      const secs = Math.floor((Date.now() - _startTime) / 1000);
      const m = Math.floor(secs / 60), s = secs % 60;
      onTick(`${m}:${s < 10 ? '0' : ''}${s}`);
    }, 1000);
  }
}

export function stopRecording(){
  return new Promise(resolve => {
    clearInterval(_timerInterval);
    if(!_recorder || _recorder.state === 'inactive'){ resolve(null); return; }
    _recorder.onstop = () => {
      const blob = new Blob(_chunks, { type: 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      const name = 'UniBeatz-TalkStudio-' + new Date().toISOString().slice(0,19).replace(/[T:]/g,'-') + '.webm';
      resolve({ blob, url, name });
    };
    _recorder.stop();
  });
}

export function isRecording(){
  return _recorder && _recorder.state === 'recording';
}

// Connect an audio source node to the recording bus
export function connectToRecording(sourceNode){
  if(_destNode && sourceNode) sourceNode.connect(_destNode);
}
