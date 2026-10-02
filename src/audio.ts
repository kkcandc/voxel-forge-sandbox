export class ForgeAudio {
  private ctx: AudioContext | null = null;
  private wind: GainNode | null = null;
  private started = false;

  unlock(): void {
    if (this.started) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    void this.ctx.resume();
    this.started = true;
    this.startWind();
  }

  dig(): void {
    if (!this.ctx) return;
    const length = Math.floor(this.ctx.sampleRate * 0.07);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 420 + Math.random() * 280;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start();
  }

  place(): void {
    this.tone(210, 0.045, "triangle", 0.08);
    this.tone(140, 0.06, "sine", 0.05);
  }

  jump(): void {
    this.tone(320, 0.05, "sine", 0.04);
  }

  land(): void {
    this.tone(90, 0.08, "triangle", 0.06);
  }

  private tone(freq: number, dur: number, type: OscillatorType, volume: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + dur);
  }

  private startWind(): void {
    if (!this.ctx || this.wind) return;
    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = last;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    this.wind = this.ctx.createGain();
    this.wind.gain.value = 0.035;
    src.connect(filter).connect(this.wind).connect(this.ctx.destination);
    src.start();
  }
}
