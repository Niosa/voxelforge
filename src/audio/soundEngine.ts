/**
 * soundEngine.ts — Web Audio API procedural synthesizer for Voxelforge.
 * Generates retro/fantasy sound effects and ambient soundscapes offline.
 */

/** Only referenced samples are fingerprinted into the production build. */
const SAMPLE_LIBRARY = {
  grass: [
    new URL('../../resources/sfx/step/grass1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/grass2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/grass3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/grass4.ogg', import.meta.url).href,
  ],
  stone: [
    new URL('../../resources/sfx/step/stone1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/stone2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/stone3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/stone4.ogg', import.meta.url).href,
  ],
  wood: [
    new URL('../../resources/sfx/step/wood1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/wood2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/wood3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/wood4.ogg', import.meta.url).href,
  ],
  gravel: [
    new URL('../../resources/sfx/step/gravel1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/gravel2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/gravel3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/gravel4.ogg', import.meta.url).href,
  ],
  sand: [
    new URL('../../resources/sfx/step/sand1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/sand2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/sand3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/sand4.ogg', import.meta.url).href,
  ],
  snow: [
    new URL('../../resources/sfx/step/snow1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/snow2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/snow3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/snow4.ogg', import.meta.url).href,
  ],
  cloth: [
    new URL('../../resources/sfx/step/cloth1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/cloth2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/cloth3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/step/cloth4.ogg', import.meta.url).href,
  ],
  digGrass: [
    new URL('../../resources/sfx/dig/grass1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/grass2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/grass3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/grass4.ogg', import.meta.url).href,
  ],
  digStone: [
    new URL('../../resources/sfx/dig/stone1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/stone2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/stone3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/stone4.ogg', import.meta.url).href,
  ],
  digWood: [
    new URL('../../resources/sfx/dig/wood1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/wood2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/wood3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/wood4.ogg', import.meta.url).href,
  ],
  digGravel: [
    new URL('../../resources/sfx/dig/gravel1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/gravel2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/gravel3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/gravel4.ogg', import.meta.url).href,
  ],
  digSand: [
    new URL('../../resources/sfx/dig/sand1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/sand2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/sand3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/sand4.ogg', import.meta.url).href,
  ],
  digSnow: [
    new URL('../../resources/sfx/dig/snow1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/snow2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/snow3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/snow4.ogg', import.meta.url).href,
  ],
  digCloth: [
    new URL('../../resources/sfx/dig/cloth1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/cloth2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/cloth3.ogg', import.meta.url).href,
    new URL('../../resources/sfx/dig/cloth4.ogg', import.meta.url).href,
  ],
  door: [
    new URL('../../resources/sfx/random/door_open.ogg', import.meta.url).href,
    new URL('../../resources/sfx/random/door_close.ogg', import.meta.url).href,
  ],
  villager: [
    new URL('../../resources/sfx/mob/villager/idle1.ogg', import.meta.url).href,
    new URL('../../resources/sfx/mob/villager/idle2.ogg', import.meta.url).href,
    new URL('../../resources/sfx/mob/villager/idle3.ogg', import.meta.url).href,
  ],
  click: [new URL('../../resources/sfx/random/click.ogg', import.meta.url).href],
  land: [new URL('../../resources/sfx/damage/fallsmall.ogg', import.meta.url).href],
  levelUp: [new URL('../../resources/sfx/random/levelup.ogg', import.meta.url).href],
} as const;

type SampleMaterial = 'grass' | 'stone' | 'wood' | 'gravel' | 'sand' | 'snow' | 'cloth';

const DIG_SAMPLES: Record<SampleMaterial, readonly string[]> = {
  grass: SAMPLE_LIBRARY.digGrass,
  stone: SAMPLE_LIBRARY.digStone,
  wood: SAMPLE_LIBRARY.digWood,
  gravel: SAMPLE_LIBRARY.digGravel,
  sand: SAMPLE_LIBRARY.digSand,
  snow: SAMPLE_LIBRARY.digSnow,
  cloth: SAMPLE_LIBRARY.digCloth,
};

export function soundMaterialForBlock(blockType: string): SampleMaterial {
  const value = blockType.toLowerCase();
  if (/wood|log|plank|door|thatch/.test(value)) return 'wood';
  if (/sand/.test(value)) return 'sand';
  if (/snow|ice/.test(value)) return 'snow';
  if (/gravel|dirt|mud|clay/.test(value)) return 'gravel';
  if (/leaves|flower|grass/.test(value)) return 'grass';
  if (/cloth|wool/.test(value)) return 'cloth';
  return 'stone';
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private ambientGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private isAmbientPlaying: boolean = false;
  private readonly samplePools = new Map<string, HTMLAudioElement[]>();
  private readonly activeSamples = new Set<HTMLAudioElement>();

  private playSample(urls: readonly string[], volume: number, minimumRate = 0.94, maximumRate = 1.06): boolean {
    if (this.isMuted || typeof Audio === 'undefined' || urls.length === 0) return false;
    const url = urls[Math.floor(Math.random() * urls.length)]!;
    const pool = this.samplePools.get(url) ?? [];
    let audio = pool.find((candidate) => candidate.paused || candidate.ended);
    if (!audio && pool.length < 4) {
      audio = new Audio(url);
      audio.preload = 'auto';
      pool.push(audio);
      this.samplePools.set(url, pool);
    }
    if (!audio) audio = pool[0];
    if (!audio) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.playbackRate = minimumRate + Math.random() * (maximumRate - minimumRate);
      this.activeSamples.add(audio);
      audio.onended = () => this.activeSamples.delete(audio!);
      void audio.play().catch(() => this.activeSamples.delete(audio!));
      return true;
    } catch (_) {
      this.activeSamples.delete(audio);
      return false;
    }
  }

  private initCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      for (const sample of this.activeSamples) sample.pause();
      this.activeSamples.clear();
    }
    if (muted && this.ambientGain) {
      this.ambientGain.gain.value = 0;
    } else if (!muted && this.ambientGain) {
      this.ambientGain.gain.value = 0.08;
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /** Satisfying block placement pop/thud sound */
  public playBlockPlace(blockType: string = 'wood'): void {
    if (this.isMuted) return;
    const material = soundMaterialForBlock(blockType);
    if (this.playSample(SAMPLE_LIBRARY[material], 0.25, 0.82, 0.94)) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const isStone = blockType.includes('stone') || blockType.includes('brick') || blockType.includes('castle') || blockType.includes('obsidian');
      const startFreq = isStone ? 280 + Math.random() * 40 : 180 + Math.random() * 30;

      osc.type = isStone ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (_) {
      /* ignore audio context restrictions before interaction */
    }
  }

  /** Crunchy block break disintegrate noise sound */
  public playBlockBreak(blockType: string = 'stone'): void {
    if (this.isMuted) return;
    const material = soundMaterialForBlock(blockType);
    if (this.playSample(DIG_SAMPLES[material], 0.34, 0.92, 1.08)) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.06;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600 + Math.random() * 400, now);
      filter.Q.value = 1.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.06);
    } catch (_) {}
  }

  /** Jump physics whoosh */
  public playJump(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (_) {}
  }

  /** Landing ground thud */
  public playLand(): void {
    if (this.isMuted) return;
    if (this.playSample(SAMPLE_LIBRARY.land, 0.3, 0.95, 1.02)) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch (_) {}
  }

  /** Short material-aware footstep used by the voxel walk controller. */
  public playFootstep(blockType: string = 'grass'): void {
    if (this.isMuted) return;
    const material = soundMaterialForBlock(blockType);
    if (this.playSample(SAMPLE_LIBRARY[material], 0.18, 0.9, 1.1)) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const hard = /stone|brick|ore|glass|obsidian|path/.test(blockType);
      osc.type = hard ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(hard ? 105 + Math.random() * 25 : 72 + Math.random() * 18, now);
      osc.frequency.exponentialRampToValueAtTime(hard ? 62 : 48, now + 0.045);
      gain.gain.setValueAtTime(hard ? 0.085 : 0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (_) {}
  }

  /** Wooden hinge/latch cue for opening and closing doors. */
  public playDoorToggle(opening: boolean): void {
    if (this.isMuted) return;
    const sample = SAMPLE_LIBRARY.door[opening ? 0 : 1];
    if (this.playSample([sample], 0.32, 0.96, 1.04)) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const frequencies = opening ? [105, 170] : [170, 105];
      for (const [index, frequency] of frequencies.entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.045;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequency, start);
        osc.frequency.exponentialRampToValueAtTime(70, start + 0.07);
        gain.gain.setValueAtTime(0.09, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.075);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.075);
      }
    } catch (_) {}
  }

  /** Friendly two-note vocal chirp when an NPC conversation begins. */
  public playNpcTalk(): void {
    if (this.isMuted) return;
    if (this.playSample(SAMPLE_LIBRARY.villager, 0.24, 0.96, 1.06)) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      for (const [index, frequency] of [260, 330].entries()) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.055;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency + Math.random() * 20, start);
        gain.gain.setValueAtTime(0.08, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.06);
      }
    } catch (_) {}
  }

  /** Crisp UI button click feedback */
  public playClick(): void {
    if (this.isMuted) return;
    if (this.playSample(SAMPLE_LIBRARY.click, 0.18, 0.98, 1.04)) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (_) {}
  }

  /** Cinematic camera descent fly-down transition whoosh */
  public playDescentWhoosh(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.8);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.8);
    } catch (_) {}
  }

  /** Discovery fan fare for discovering ancient relics */
  public playRelicDiscovered(): void {
    if (this.isMuted) return;
    if (this.playSample(SAMPLE_LIBRARY.levelUp, 0.4, 0.98, 1.02)) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteTime = now + idx * 0.1;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.2, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.3);
      });
    } catch (_) {}
  }

  /** Start ambient wind & fantasy drone soundscape */
  public startAmbient(): void {
    if (this.isAmbientPlaying) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      this.ambientOsc = ctx.createOscillator();
      this.ambientGain = ctx.createGain();

      this.ambientOsc.type = 'sine';
      this.ambientOsc.frequency.setValueAtTime(110, now); // Low harmonic A2

      this.ambientGain.gain.setValueAtTime(0.001, now);
      this.ambientGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : 0.06, now + 2);

      this.ambientOsc.connect(this.ambientGain);
      this.ambientGain.connect(ctx.destination);

      this.ambientOsc.start(now);
      this.isAmbientPlaying = true;
    } catch (_) {}
  }

  public stopAmbient(): void {
    if (!this.isAmbientPlaying || !this.ambientGain || !this.ambientOsc) return;
    try {
      const ctx = this.initCtx();
      const now = ctx ? ctx.currentTime : 0;
      this.ambientGain.gain.exponentialRampToValueAtTime(0.0001, now + 1);
      setTimeout(() => {
        this.ambientOsc?.stop();
        this.ambientOsc?.disconnect();
        this.ambientGain?.disconnect();
        this.ambientOsc = null;
        this.ambientGain = null;
        this.isAmbientPlaying = false;
      }, 1000);
    } catch (_) {
      this.isAmbientPlaying = false;
    }
  }
}

export const soundEngine = new SoundEngine();
