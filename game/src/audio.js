// Sound and music, synthesized live with WebAudio: no audio files, nothing
// fetched. A laid-back synth groove (bass, chords, hats) loops under play, the
// engine hum follows the car's speed, and one-shot effects cover gunfire,
// sirens, pickups and mission jingles. Everything is guarded: if the browser
// blocks audio, the game plays on silently.

const MUSIC = {
  bpm: 96,
  bass: [55, 55, 65.41, 49],
  chords: [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
    [146.83, 220, 293.66],
  ],
};

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let stepIndex = 0;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function note(freq, time, duration, type, gainValue, destination) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  function hat(time) {
    const length = 0.05;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * length), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = 0.25;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    source.start(time);
  }

  function musicStep() {
    if (!context) return;
    const beat = 60 / MUSIC.bpm / 2;
    const now = context.currentTime + 0.05;
    const bar = Math.floor(stepIndex / 8) % 4;
    const inBar = stepIndex % 8;
    if (inBar === 0 || inBar === 3 || inBar === 6) {
      note(MUSIC.bass[bar], now, beat * 1.6, 'triangle', 0.5, musicGain);
    }
    if (inBar === 0) {
      for (const freq of MUSIC.chords[bar]) note(freq, now, beat * 7, 'sine', 0.08, musicGain);
    }
    if (inBar % 2 === 1) hat(now);
    stepIndex += 1;
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    const beat = 60 / MUSIC.bpm / 2;
    musicTimer = window.setInterval(musicStep, beat * 1000);
  }

  function blip(freq, duration, type, gainValue) {
    if (!ensure()) return;
    resume();
    note(freq, context.currentTime, duration, type, gainValue, master);
  }

  function noiseBurst(duration, gainValue, filterFreq) {
    if (!ensure()) return;
    resume();
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    unlock() {
      resume();
      startMusic();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      noiseBurst(0.12, 0.5, 2400);
    },
    punch() {
      noiseBurst(0.08, 0.35, 900);
    },
    hit() {
      blip(140, 0.18, 'square', 0.25);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.3);
      window.setTimeout(() => blip(1318, 0.18, 'sine', 0.3), 90);
    },
    mission() {
      [523, 659, 784, 1046].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.22, 'triangle', 0.3), i * 110);
      });
    },
    fail() {
      [392, 330, 262].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.25, 'sawtooth', 0.2), i * 140);
      });
    },
    engine(speed01) {
      if (!context || !engineOsc) return;
      const target = speed01 > 0.02 ? 46 + speed01 * 130 : 0;
      engineOsc.frequency.setTargetAtTime(46 + speed01 * 130, context.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 : 0, context.currentTime, 0.1);
      void target;
    },
    siren(on) {
      if (!context || !sirenOsc) return;
      const now = context.currentTime;
      if (on) {
        sirenGain.gain.setTargetAtTime(0.035, now, 0.2);
        sirenOsc.frequency.setTargetAtTime(660, now, 0.4);
        window.setTimeout(() => {
          if (sirenOsc) sirenOsc.frequency.setTargetAtTime(880, context.currentTime, 0.4);
        }, 420);
      } else {
        sirenGain.gain.setTargetAtTime(0, now, 0.2);
      }
    },
  };
}
