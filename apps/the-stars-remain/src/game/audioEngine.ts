import { WORLD_CONFIG } from './gameTypes';

export class AmbientAudioEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private windGain: GainNode | null = null;
    private droneGain: GainNode | null = null;
    private proximityResonanceGain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private isMuted = false;
    private isInitialized = false;
    private inReflection = false;

    public initFromUserGesture(muted: boolean): void {
        this.isMuted = muted;
        if (this.isInitialized) {
            this.resumeIfNeeded();
            return;
        }

        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        try {
            const ctx = new AudioCtx();
            this.ctx = ctx;

            const masterGain = ctx.createGain();
            masterGain.gain.value = muted ? 0 : 0.92;
            masterGain.connect(ctx.destination);
            this.masterGain = masterGain;

            const sampleRate = ctx.sampleRate;
            const bufferLength = sampleRate * 3;
            const buffer = ctx.createBuffer(1, bufferLength, sampleRate);
            const data = buffer.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferLength; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
                b6 = white * 0.115926;
            }
            this.noiseBuffer = buffer;

            // 1. Desert Wind Layer
            const windSource = ctx.createBufferSource();
            windSource.buffer = buffer;
            windSource.loop = true;

            const windFilter = ctx.createBiquadFilter();
            windFilter.type = 'bandpass';
            windFilter.frequency.value = 305;
            windFilter.Q.value = 1.65;

            const windGain = ctx.createGain();
            windGain.gain.value = 0.34;
            this.windGain = windGain;

            windSource.connect(windFilter);
            windFilter.connect(windGain);
            windGain.connect(masterGain);
            windSource.start();

            // 2. Subtle Night Sky Harmonic Pad
            const droneGain = ctx.createGain();
            droneGain.gain.value = 0.16;
            this.droneGain = droneGain;

            const droneFilter = ctx.createBiquadFilter();
            droneFilter.type = 'lowpass';
            droneFilter.frequency.value = 230;

            const osc1 = ctx.createOscillator();
            osc1.type = 'sine';
            osc1.frequency.value = 65.41; // C2

            const osc2 = ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.value = 98.0; // G2

            osc1.connect(droneFilter);
            osc2.connect(droneFilter);
            droneFilter.connect(droneGain);
            droneGain.connect(masterGain);

            osc1.start();
            osc2.start();

            // 3. Continuous, Distance-Modulated Monolith Proximity Resonance (55Hz / 110Hz sub-harmonic)
            const proxGain = ctx.createGain();
            proxGain.gain.value = 0.0001;
            this.proximityResonanceGain = proxGain;

            const proxFilter = ctx.createBiquadFilter();
            proxFilter.type = 'lowpass';
            proxFilter.frequency.value = 160;

            const proxOsc1 = ctx.createOscillator();
            proxOsc1.type = 'sine';
            proxOsc1.frequency.value = 55.0; // A1

            const proxOsc2 = ctx.createOscillator();
            proxOsc2.type = 'sine';
            proxOsc2.frequency.value = 110.0; // A2

            proxOsc1.connect(proxFilter);
            proxOsc2.connect(proxFilter);
            proxFilter.connect(proxGain);
            proxGain.connect(masterGain);

            proxOsc1.start();
            proxOsc2.start();

            this.isInitialized = true;
        } catch {
            // Fail gracefully if Web Audio is unsupported
        }
    }

    public resumeIfNeeded(): void {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }

    public setMuted(muted: boolean): void {
        this.isMuted = muted;
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.92, now, 0.08);
    }

    /**
     * Smoothly adjusts wind quietness and low monolith resonance as the player approaches.
     */
    public updateProximity(distanceToMonolith: number): void {
        if (!this.ctx || !this.windGain || !this.proximityResonanceGain || this.inReflection) {
            return;
        }

        const now = this.ctx.currentTime;
        const proxFactor =
            1 -
            Math.min(
                1,
                Math.max(0, (distanceToMonolith - WORLD_CONFIG.INTERACTION_DISTANCE) / 32.0)
            );

        // Gently quiet the wind from 0.34 down to 0.22 near the monolith
        const targetWind = 0.34 - proxFactor * 0.12;
        // Barely audible, sacred low resonance emerging near the monolith
        const targetResonance = 0.0001 + proxFactor * proxFactor * 0.095;

        this.windGain.gain.setTargetAtTime(targetWind, now, 0.25);
        this.proximityResonanceGain.gain.setTargetAtTime(targetResonance, now, 0.25);
    }

    public setReflectionMode(isReflection: boolean): void {
        this.inReflection = isReflection;
        if (!this.ctx || !this.windGain || !this.droneGain || !this.proximityResonanceGain) return;
        const now = this.ctx.currentTime;

        if (isReflection) {
            // Fade wind down smoothly over ~1 second into quiet reflection
            this.windGain.gain.setTargetAtTime(0.045, now, 0.55);
            this.droneGain.gain.setTargetAtTime(0.11, now, 0.65);
            this.proximityResonanceGain.gain.setTargetAtTime(0.035, now, 0.75);
        } else {
            // Restore exploration ambience smoothly on REIMAGINE
            this.windGain.gain.setTargetAtTime(0.34, now, 0.7);
            this.droneGain.gain.setTargetAtTime(0.16, now, 0.7);
            this.proximityResonanceGain.gain.setTargetAtTime(0.0001, now, 0.5);
        }
    }

    public playFootstep(isLeft: boolean): void {
        if (this.isMuted || this.inReflection || !this.ctx || !this.masterGain || !this.noiseBuffer) {
            return;
        }
        this.resumeIfNeeded();

        const now = this.ctx.currentTime;

        // Slight amplitude & timbre variation so footsteps on dry sand sound organic
        const ampJitter = 0.88 + Math.random() * 0.24;
        const duration = 0.17 + Math.random() * 0.04;

        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const randomOffset = Math.random() * 2.2;

        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = (isLeft ? 610 : 675) + (Math.random() - 0.5) * 110;
        bandpass.Q.value = 1.25 + Math.random() * 0.3;

        const stepGain = this.ctx.createGain();
        stepGain.gain.setValueAtTime(0.001, now);
        stepGain.gain.linearRampToValueAtTime(0.23 * ampJitter, now + 0.024);
        stepGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noiseSrc.connect(bandpass);
        bandpass.connect(stepGain);
        stepGain.connect(this.masterGain);

        noiseSrc.start(now, randomOffset, duration + 0.02);

        const thudOsc = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thudOsc.type = 'sine';
        const baseThudFreq = (isLeft ? 90 : 96) + (Math.random() - 0.5) * 8;
        thudOsc.frequency.setValueAtTime(baseThudFreq, now);
        thudOsc.frequency.exponentialRampToValueAtTime(41, now + 0.085);

        thudGain.gain.setValueAtTime(0.001, now);
        thudGain.gain.linearRampToValueAtTime(0.08 * ampJitter, now + 0.012);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

        thudOsc.connect(thudGain);
        thudGain.connect(this.masterGain);
        thudOsc.start(now);
        thudOsc.stop(now + 0.105);
    }

    public playMonolithActivation(): void {
        if (this.isMuted || !this.ctx || !this.masterGain) return;
        this.resumeIfNeeded();

        const now = this.ctx.currentTime;
        // Restrained, warm harmonic fifths (C3, G3, D4, A4) that swell gently and decay into silence
        const freqs = [130.81, 196.0, 293.66, 440.0];

        freqs.forEach((f, idx) => {
            if (!this.ctx || !this.masterGain) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = f;

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.055 / (idx * 0.5 + 1), now + 0.38 + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.4);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 4.5);
        });
    }

    public dispose(): void {
        if (this.ctx) {
            this.ctx.close().catch(() => { });
            this.ctx = null;
        }
        this.isInitialized = false;
    }
}