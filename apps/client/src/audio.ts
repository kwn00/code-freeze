/**
 * 효과음과 배경음악. 소리 파일 없이 Web Audio 로 그 자리에서 만든다 (Friday Deploy 와 같은 칩튠 방식).
 * 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 내지 못하게 해서, 처음 누를 때 unlock() 으로 깨운다.
 */
type Wave = OscillatorType | 'noise';
interface Tone {
  wave: Wave;
  f: number;
  to?: number;
  at?: number;
  dur: number;
  vol: number;
}

export type SfxId = 'shoot' | 'hit' | 'kill' | 'leak' | 'build' | 'upgrade' | 'sell' | 'wave' | 'clear' | 'boss' | 'won' | 'lost' | 'deny';

const SFX: Record<SfxId, { tones: Tone[]; gap: number }> = {
  shoot: { tones: [{ wave: 'square', f: 880, to: 660, dur: 0.04, vol: 0.05 }], gap: 60 },
  hit: { tones: [{ wave: 'noise', f: 2400, dur: 0.05, vol: 0.08 }], gap: 50 },
  kill: { tones: [{ wave: 'square', f: 520, to: 1040, dur: 0.07, vol: 0.08 }], gap: 40 },
  leak: { tones: [{ wave: 'sawtooth', f: 200, to: 70, dur: 0.3, vol: 0.18 }], gap: 150 },
  build: { tones: [{ wave: 'square', f: 392, dur: 0.06, vol: 0.1 }, { wave: 'square', f: 587, at: 0.06, dur: 0.08, vol: 0.1 }], gap: 0 },
  upgrade: { tones: [392, 494, 587, 784].map((f, i) => ({ wave: 'square' as const, f, at: i * 0.05, dur: 0.06, vol: 0.09 })), gap: 0 },
  sell: { tones: [{ wave: 'triangle', f: 660, to: 330, dur: 0.12, vol: 0.14 }], gap: 0 },
  wave: { tones: [{ wave: 'square', f: 330, dur: 0.1, vol: 0.1 }, { wave: 'square', f: 440, at: 0.12, dur: 0.18, vol: 0.1 }], gap: 0 },
  clear: { tones: [523, 659, 784, 1047].map((f, i) => ({ wave: 'triangle' as const, f, at: i * 0.08, dur: 0.12, vol: 0.16 })), gap: 0 },
  boss: { tones: [{ wave: 'sawtooth', f: 110, dur: 0.4, vol: 0.14 }, { wave: 'sawtooth', f: 104, at: 0.45, dur: 0.5, vol: 0.14 }], gap: 500 },
  won: { tones: [523, 659, 784, 659, 784, 1047].map((f, i) => ({ wave: 'square' as const, f, at: i * 0.12, dur: 0.14, vol: 0.1 })), gap: 0 },
  lost: { tones: [392, 330, 262, 196].map((f, i) => ({ wave: 'sawtooth' as const, f, at: i * 0.18, dur: 0.2, vol: 0.12 })), gap: 0 },
  deny: { tones: [{ wave: 'square', f: 150, dur: 0.08, vol: 0.1 }], gap: 80 },
};

/** 짓는 동안의 배경음악: 느긋한 아르페지오 (A 단조). [음 이름, 8분음표 길이] */
const NOTES: Record<string, number> = { A2: 110, C3: 130.8, D3: 146.8, E3: 164.8, F2: 87.3, G2: 98, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B3: 246.9, C5: 523.3, E5: 659.3 };
const BASS = ['A2', 'F2', 'C3', 'G2'];
const ARPS = [
  ['A3', 'C4', 'E4', 'C4'],
  ['F4', 'A3', 'C4', 'A3'],
  ['C4', 'E4', 'G4', 'E4'],
  ['B3', 'D4', 'G4', 'D4'],
];

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxId, number>();
  private musicTimer = 0;
  private musicStep = 0;
  private nextNoteAt = 0;
  muted = false;
  /** 배경음악 빠르기: 짓는 중 1, 웨이브 중 1.4 */
  tempo = 1;

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  play(id: SfxId): void {
    if (!this.ctx || !this.master || this.muted) return;
    const def = SFX[id];
    const now = performance.now();
    if (now - (this.last.get(id) ?? -1e9) < def.gap) return;
    this.last.set(id, now);
    for (const t of def.tones) this.tone(t, this.ctx.currentTime + (t.at ?? 0));
  }

  private tone(t: Tone, at: number, out: AudioNode = this.master!): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(t.vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
    g.connect(out);
    let src: AudioScheduledSourceNode;
    if (t.wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = t.f;
      n.connect(f).connect(g);
      src = n;
    } else {
      const o = ctx.createOscillator();
      o.type = t.wave;
      o.frequency.setValueAtTime(t.f, at);
      if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, at + t.dur);
      o.connect(g);
      src = o;
    }
    src.start(at);
    src.stop(at + t.dur + 0.02);
  }

  private startMusic(): void {
    const ctx = this.ctx!;
    this.nextNoteAt = ctx.currentTime + 0.1;
    const tick = (): void => {
      if (ctx.state === 'running' && !this.muted) {
        const eighth = 60 / (96 * this.tempo) / 2;
        while (this.nextNoteAt < ctx.currentTime + 0.25) {
          const bar = Math.floor(this.musicStep / 8) % 4;
          const i = this.musicStep % 8;
          const lead = ARPS[bar]![i % 4]!;
          this.tone({ wave: 'triangle', f: NOTES[lead]!, dur: eighth * 0.9, vol: 0.05 }, this.nextNoteAt);
          if (i % 4 === 0) this.tone({ wave: 'square', f: NOTES[BASS[bar]!]!, dur: eighth * 3.5, vol: 0.035 }, this.nextNoteAt);
          if (this.tempo > 1 && i % 2 === 1) this.tone({ wave: 'noise', f: 6000, dur: 0.03, vol: 0.03 }, this.nextNoteAt);
          this.nextNoteAt += eighth;
          this.musicStep++;
        }
      } else {
        this.nextNoteAt = ctx.currentTime + 0.1;
      }
      this.musicTimer = window.setTimeout(tick, 100);
    };
    window.clearTimeout(this.musicTimer);
    tick();
  }
}
