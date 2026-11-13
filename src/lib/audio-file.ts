import type { Config } from './types';

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
});

/** Some browsers record Opus in an MP4 container even when asked for audio/mp4. */
export function needsCompatibleAudio(url: string): boolean {
  if (/^data:audio\/(webm|ogg)/i.test(url)) return true;
  if (!/^data:audio\/(mp4|x-m4a)/i.test(url)) return false;
  try { return atob(url.split(',')[1]).includes('Opus'); } catch { return false; }
}

/** PCM WAV is understood by mobile media players, including older embedded browsers. */
export function waveFile(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const word = (at: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const value = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); });
  return new Blob([bytes], { type: 'audio/wav' });
}

export async function audioDetails(blob: Blob) {
  let url = await dataUrl(blob);
  const Context = window.AudioContext || (window as any).webkitAudioContext;
  const context: AudioContext = new Context();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 120.5) throw new Error('Keep a voice recording under 2 minutes.');
    let audio = decoded;
    if (needsCompatibleAudio(url)) {
      const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 24000), 24000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      audio = await offline.startRendering();
      url = await dataUrl(waveFile(audio.getChannelData(0), audio.sampleRate));
    }
    const channel = audio.getChannelData(0), size = Math.max(1, Math.floor(channel.length / 40));
    const raw = Array.from({ length: 40 }, (_, i) => {
      let peak = 0; for (let j = i * size; j < Math.min((i + 1) * size, channel.length); j += 16) peak = Math.max(peak, Math.abs(channel[j]));
      return peak;
    });
    const top = Math.max(...raw, .01);
    return { url: url.replace(/;codecs=[^;,]+/g, ''), duration: audio.duration, peaks: raw.map((v) => Math.round(v / top * 100) / 100) };
  } finally { void context.close(); }
}

/** Upgrades recordings already in a draft when its creator next publishes it. */
export async function prepareVoiceAudio(config: Config): Promise<boolean> {
  let updated = false;
  for (const block of config.blocks) {
    const original = block.audio;
    if (block.type !== 'voice' || !original || !needsCompatibleAudio(original)) continue;
    const binary = atob(original.split(',')[1]), bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const info = await audioDetails(new Blob([bytes], { type: original.slice(5, original.indexOf(';')) }));
    if (block.audio !== original) continue;
    block.audio = info.url; block.duration = Math.round(info.duration * 10) / 10; block.peaks = info.peaks; updated = true;
  }
  return updated;
}
