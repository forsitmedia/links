import type { MusicStyle } from './types';

export const MUSIC_LABELS: Record<MusicStyle, string> = { lounge: 'Lounge jazz', lofi: 'Lo-fi', ambient: 'Ambient', rock: 'Rock', bossa: 'Bossa nova', synthwave: 'Synthwave' };
export const MUSIC_NOTES: Record<MusicStyle, string> = {
  lounge: 'Soft piano chords, walking bass, brushes', lofi: 'Mellow keys, gentle beat, vinyl crackle', ambient: 'Slow, airy pads and chimes',
  rock: 'Driving power chords, bass and drums', bossa: 'Gentle guitar, soft bass and percussion', synthwave: '80s arpeggios, warm synths, big snare',
};

/** Music made in the visitor's browser with Web Audio: chords, bass and drums played from a few notes, so there is no
 * recording to license and the page stays one small file. Nothing plays until a button is tapped (browsers block sound
 * that starts by itself). `window.yourlinkiPlayer(style)` gives a player with start/stop; the ♪ button plays the page's
 * style and disco mode plays its own club track. A voice message playing turns everything down. */
export const MUSIC_SCRIPT = `<script>
(() => {
  const STYLES = {
    lounge: { bpm: 88, swing: .64, cutoff: 2600,
      chords: [[50,53,57,60,64],[43,53,57,59,64],[48,52,55,59,62],[45,49,55,58,64]],
      bass: [[38,41,45,47],[31,35,38,40],[36,40,43,44],[33,37,40,43]] },
    lofi: { bpm: 70, swing: .58, cutoff: 1300, beat: true, crackle: true,
      chords: [[48,55,59,62,64],[45,52,55,59,64],[41,48,52,57,60],[43,50,53,59,62]],
      bass: [[36,0,36,43],[33,0,33,40],[29,0,29,36],[31,0,31,38]] },
    ambient: { bpm: 56, cutoff: 900, pad: true,
      chords: [[48,55,60,64,67],[45,52,57,60,64],[41,48,53,57,60],[43,50,55,59,62]] },
    rock: { bpm: 126, cutoff: 3200, rock: true,
      chords: [40, 40, 36, 38], bass: [28, 28, 24, 26] },
    bossa: { bpm: 72, cutoff: 3000, bossa: true,
      chords: [[57,60,64,67],[50,54,57,60,64],[55,59,62,66],[48,52,55,59,62]],
      bass: [[45,52],[38,45],[43,50],[36,43]] },
    synthwave: { bpm: 100, cutoff: 2800, synth: true,
      chords: [[57,60,64],[53,57,60],[48,52,55],[55,59,62]],
      bass: [33, 29, 36, 31] },
    disco: { bpm: 122, cutoff: 6000, club: true,
      chords: [[57,60,64,67],[55,59,62,65],[53,57,60,64],[52,56,59,64]],
      bass: [33, 31, 29, 28] },
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let ctx, master, noise, output, ducked = false;
  const notify = () => window.dispatchEvent(new Event('yourlinki-audiochange'));
  function setup() {
    if (ctx) return;
    window.yourlinkiAudioSession && window.yourlinkiAudioSession();
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1;
    // Route the actual music through a media element, which mobile hosts treat as media playback.
    // Direct Web Audio output can otherwise follow the phone's silent/ringer audio session.
    if (ctx.createMediaStreamDestination && 'srcObject' in document.createElement('audio')) {
      const destination = ctx.createMediaStreamDestination(); master.connect(destination);
      output = document.createElement('audio'); output.className = 'music-output'; output.hidden = true;
      output.setAttribute('playsinline', ''); output.setAttribute('aria-hidden', 'true'); output.srcObject = destination.stream;
      document.body.append(output);
    } else master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running') (window.yourlinkiPlayers || []).forEach((player) => { if (player.on) player.stop(); });
    });
  }
  window.yourlinkiPlayer = (name) => {
    const style = STYLES[name] || STYLES.lounge;
    let out, tone, drive, crackle, timer, pending, serial = 0, bar = 0, beat = 0, next = 0, on = false;
    const level = () => (ducked ? .08 : style.club ? .38 : .32);
    const wire = () => {
      if (out) return;
      out = ctx.createGain(); out.gain.value = 0; out.connect(master);
      tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = style.cutoff; tone.connect(out);
      if (style.rock) { // guitar distortion
        drive = ctx.createWaveShaper(); const c = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); }
        drive.curve = c; drive.connect(tone);
      }
    };
    function note(m, t, len, gain, type, attack, dest) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = hz(m);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (attack || .01));
      g.gain.exponentialRampToValueAtTime(.0001, t + len);
      o.connect(g); g.connect(dest || tone); o.start(t); o.stop(t + len + .05);
    }
    function keys(m, t, len, gain) { note(m, t, len, gain, 'sine'); note(m + 12, t, len * .5, gain * .18, 'triangle'); }
    function hit(t, freq, len, gain, type) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; f.type = type || 'bandpass'; f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + len);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + len + .05);
    }
    function kick(t, gain) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + .16);
      g.gain.setValueAtTime(gain || .35, t); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + .36);
    }
    function snare(t, gain, len) { hit(t, 1900, len || .18, gain); note(50, t, .1, gain * .4, 'triangle', .002, out); }
    function play(t) {
      const spb = 60 / style.bpm, chord = style.chords[bar % style.chords.length];
      if (style.rock) { // eighth-note power chords through the distortion, bass with them, kick and snare backbeat
        const root = chord, low = style.bass[bar % style.bass.length];
        for (let i = 0; i < 2; i++) { const at = t + i * spb / 2; [root, root + 7, root + 12].forEach((m) => note(m, at, spb * .45, .07, 'sawtooth', .004, drive)); note(low, at, spb * .45, .22, 'sawtooth', .004); hit(at, 9000, .05, .05, 'highpass'); }
        if (beat === 0 || beat === 2) kick(t, .5); if (beat === 2) kick(t + spb / 2, .35);
        if (beat % 2 === 1) snare(t, .32, .2);
        if (beat === 0 && bar % 4 === 0) hit(t, 6000, .9, .07, 'highpass'); // crash
        return;
      }
      if (style.bossa) { // nylon-guitar chords on the syncopated bossa rhythm, root-fifth bass, rim clicks and shaker
        const [r, f] = style.bass[bar % style.bass.length];
        const pluck = (at) => chord.forEach((m, i) => note(m, at + i * .012, spb * .5, .035, 'triangle', .003));
        if (beat === 0) { pluck(t); note(r, t, spb * 1.4, .2, 'sine'); }
        if (beat === 1) { pluck(t + spb / 2); note(f, t + spb / 2, spb, .17, 'sine'); }
        if (beat === 2) { note(r, t, spb * 1.4, .2, 'sine'); }
        if (beat === 3) { pluck(t); pluck(t + spb / 2); note(f, t + spb / 2, spb, .17, 'sine'); }
        [0, .75].forEach((d) => hit(t + spb * d, 2600, .05, beat % 2 ? .07 : .04));
        for (let i = 0; i < 4; i++) hit(t + i * spb / 4, 7000, .04, i % 2 ? .015 : .025, 'highpass');
        return;
      }
      if (style.synth) { // sixteenth-note arpeggio, pulsing bass, warm pad, kick and a big snare
        const low = style.bass[bar % style.bass.length];
        for (let i = 0; i < 4; i++) { const m = chord[(beat * 4 + i) % chord.length] + 12 * (i % 2); note(m, t + i * spb / 4, spb * .22, .04, 'square', .003); }
        for (let i = 0; i < 2; i++) note(low, t + i * spb / 2, spb * .4, .22, 'sawtooth', .004);
        if (beat === 0) chord.forEach((m) => note(m - 12, t, spb * 4.2, .025, 'sawtooth', spb * .5));
        if (beat % 2 === 0) kick(t, .5); else snare(t, .35, .45);
        hit(t + spb / 2, 9000, .05, .04, 'highpass');
        return;
      }
      if (style.club) { // four on the floor: kick every beat, open hat on the offbeat, clap on 2 and 4, octave bass, chord stabs
        const root = style.bass[bar % style.bass.length];
        kick(t, .55);
        hit(t + spb / 2, 9000, .12, .09, 'highpass');
        hit(t + spb / 4, 11000, .03, .03, 'highpass'); hit(t + spb * .75, 11000, .03, .03, 'highpass');
        if (beat % 2 === 1) { hit(t, 1400, .16, .3); hit(t + .012, 2200, .12, .18); }
        note(root, t, spb * .42, .26, 'sawtooth', .005); note(root + 12, t + spb / 2, spb * .42, .22, 'sawtooth', .005);
        if (beat === 0 || beat === 2) chord.forEach((m) => note(m, t + spb / 2, spb * .35, .045, 'square', .005));
        if (beat === 3) chord.forEach((m) => note(m + 12, t + spb * .75, spb * .25, .03, 'square', .005));
        if (beat === 0 && bar % 2 === 0) chord.forEach((m) => note(m + 12, t, spb * 7.5, .018, 'sawtooth', spb));
        return;
      }
      if (style.pad) {
        if (beat === 0 && bar % 2 === 0) chord.forEach((m) => { note(m, t, spb * 8.5, .05, 'triangle', spb * 2); note(m + .08, t, spb * 8.5, .03, 'sawtooth', spb * 2.5); });
        if (Math.random() < .3) note(chord[Math.floor(Math.random() * chord.length)] + 24, t + spb * Math.random(), spb * 3, .035, 'sine');
        return;
      }
      const swing = spb * ((style.swing || .5) - .5) * 2;
      if (beat === 0) chord.forEach((m) => keys(m, t, spb * 2.6, .045));
      if (beat === 1 && Math.random() < .6) chord.slice(1).forEach((m) => keys(m, t + spb / 2 + swing / 2, spb * 1.2, .03));
      if (beat === 3 && Math.random() < .35) chord.slice(2).forEach((m) => keys(m + 12, t + spb / 2 + swing / 2, spb * .8, .02));
      const b = style.bass && style.bass[bar % style.bass.length][beat];
      if (b) note(b, t, spb * .9, .22, 'triangle');
      if (style.beat) { if (beat % 2 === 0) kick(t); else hit(t, 1800, .18, .12); hit(t + spb / 2 + swing / 2, 8000, .04, .03, 'highpass'); }
      else { if (beat % 2 === 1) hit(t, 3200, .22, .05); hit(t + spb / 2 + swing / 2, 6000, .08, .02, 'highpass'); }
    }
    function schedule() {
      if (ctx.state !== 'running') return;
      while (next < ctx.currentTime + .25) {
        play(next);
        next += 60 / style.bpm;
        if (++beat === 4) { beat = 0; bar++; }
      }
    }
    const player = {
      get on() { return on; },
      start() {
        if (on) return Promise.resolve(true);
        if (pending) return pending;
        (window.yourlinkiPlayers || []).forEach((other) => { if (other !== player) other.stop(); });
        window.yourlinkiAudioSession && window.yourlinkiAudioSession();
        setup(); wire();
        const attempt = ++serial;
        // Both calls happen synchronously in the visitor's tap, before awaiting either promise.
        const resume = ctx.resume(), play = output ? output.play() : Promise.resolve();
        let timeout;
        const task = Promise.race([
          Promise.all([resume, play]),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Audio did not start')), 6000); }),
        ]).then(() => {
          if (attempt !== serial) return false;
          if (ctx.state !== 'running' || (output && output.paused)) throw new Error('Audio is paused');
          on = true;
          if (style.crackle && !crackle) {
            crackle = ctx.createBufferSource(); crackle.buffer = noise; crackle.loop = true;
            const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
            const g = ctx.createGain(); g.gain.value = .012; crackle.connect(f); f.connect(g); g.connect(out); crackle.start();
          }
          next = ctx.currentTime + .1; beat = 0;
          out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(level(), ctx.currentTime, style.club ? .15 : .6);
          schedule(); timer = setInterval(schedule, 60); notify(); return true;
        }).catch((error) => { if (attempt === serial) player.stop(); throw error; })
          .finally(() => { clearTimeout(timeout); if (pending === task) pending = null; });
        pending = task; return task;
      },
      stop() {
        serial++; pending = null; on = false; clearInterval(timer);
        if (out) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, .25); }
        if (output && !(window.yourlinkiPlayers || []).some((p) => p.on)) output.pause();
        notify();
      },
      duck() { if (on) out.gain.setTargetAtTime(level(), ctx.currentTime, .3); },
    };
    (window.yourlinkiPlayers = window.yourlinkiPlayers || []).push(player);
    return player;
  };
  window.yourlinkiMusicDuck = (down) => { ducked = down; (window.yourlinkiPlayers || []).forEach((p) => p.duck()); };
  const button = document.querySelector('.music'); if (!button) return;
  const music = window.yourlinkiPlayer(button.dataset.music);
  const show = () => { button.setAttribute('aria-pressed', String(music.on)); button.classList.toggle('on', music.on); button.setAttribute('aria-label', music.on ? 'Pause music' : 'Play music'); };
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    if (music.on) { music.stop(); show(); return; }
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try { window.yourlinkiDiscoOff && window.yourlinkiDiscoOff(); await music.start(); }
    catch { window.yourlinkiAudioNotice && window.yourlinkiAudioNotice(); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); show(); }
  });
  window.addEventListener('yourlinki-audiochange', show);
  window.yourlinkiMusicStop = () => { music.stop(); show(); };
})();
</script>`;
