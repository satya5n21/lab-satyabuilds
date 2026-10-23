import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Volume1,
  VolumeX,
  RefreshCw,
  Trash2,
  Sparkles,
  Music,
  AlertCircle,
  Eye,
  EyeOff,
  Disc
} from 'lucide-react';

/**
 * ============================================================================
 * PROCEDURAL COSMIC AUDIO GENERATOR (FALLBACK / DEMO TRACK SYNTHESIZER)
 * Generates a rich, 80-second stereo WAV file locally in the browser with:
 * - Deep sub-bass & rhythmic kick pulses (triggers Bass / Cosmic Pulse)
 * - Lush evolving space pad chords & arpeggios (triggers Midrange / Nebula Flow)
 * - Crystalline high-frequency chimes & shimmer (triggers Highs / Star Sparks)
 * - Dynamic quiet and energetic sections (triggers Overall Galactic Atmosphere)
 * ============================================================================
 */
function generateCosmicDemoWavBlob() {
  const sampleRate = 44100;
  const durationSeconds = 72;
  const numSamples = sampleRate * durationSeconds;
  const numChannels = 2;
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Musical progression in D Minor9 / Bb Maj7 / G Min7 / A7sus4 (Cosmic Odyssey)
  const chords = [
    [146.83, 220.0, 261.63, 329.63, 440.0], // Dm9
    [116.54, 174.61, 220.0, 293.66, 349.23], // BbMaj7
    [98.0, 146.83, 174.61, 220.0, 293.66],   // Gm9
    [110.0, 164.81, 196.0, 246.94, 329.63]   // A7sus4/9
  ];
  const bassNotes = [36.71, 58.27, 49.0, 55.0]; // Deep sub fundamentals
  const arpScale = [587.33, 659.25, 698.46, 880.0, 1046.5, 1174.66, 1318.5, 1760.0];

  const bpm = 100;
  const beatDuration = 60 / bpm; // 0.6s per beat
  let offset = 44;

  // Deterministic pseudo-random for crystalline noise bursts
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1073741823.5) / 1073741823.5;
  };

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Macro structure envelope:
    // 0-6s: Ethereal intro
    // 6-30s: Full cosmic groove with bass pulse & arpeggios
    // 30-42s: Deep nebula breakdown (mids & highs, calm bass)
    // 42-66s: Climax supernova (strong bass, shimmering highs, rich mids)
    // 66-72s: Fade out into deep space
    let fadeEnv = 1.0;
    if (t < 2.5) fadeEnv = t / 2.5;
    else if (t > durationSeconds - 5.0) fadeEnv = Math.max(0, (durationSeconds - t) / 5.0);

    const isBeatSection = (t >= 4.8 && t < 30.0) || (t >= 40.8 && t < 66.0);
    const isClimax = t >= 40.8 && t < 66.0;

    const barIndex = Math.floor(t / (beatDuration * 8)) % chords.length;
    const chord = chords[barIndex];
    const bassFreq = bassNotes[barIndex];

    const beatPos = (t % beatDuration) / beatDuration; // 0..1 every 0.6s
    const sixteenthPos = (t % (beatDuration / 4)) / (beatDuration / 4);
    const sixteenthStep = Math.floor(t / (beatDuration / 4));

    // 1. BASS: Deep Kick + Sub Bass Pulse (20 - 130 Hz)
    let bassSignal: number;
    if (isBeatSection) {
      // Punchy cosmic kick on every beat
      const kickEnv = Math.exp(-beatPos * 9.5);
      const pitchDrop = 115 * Math.exp(-beatPos * 28) + 42;
      const kick = Math.sin(2 * Math.PI * pitchDrop * (t % beatDuration)) * kickEnv * 0.68;

      // Warm rolling sub-bass swells between beats
      const subEnv = Math.sin(beatPos * Math.PI);
      const sub = (
        Math.sin(2 * Math.PI * bassFreq * t) * 0.42 +
        Math.sin(2 * Math.PI * bassFreq * 2 * t) * 0.18
      ) * subEnv;

      bassSignal = kick + sub;
    } else {
      // Gentle atmospheric sub drone during quiet passages
      bassSignal = Math.sin(2 * Math.PI * bassFreq * t) * (0.22 + 0.08 * Math.sin(t * 0.8));
    }

    // 2. MIDRANGE: Lush Volumetric Pad Chords + Flowing Arpeggio (150 - 1800 Hz)
    let padL = 0;
    let padR = 0;
    const padSwell = 0.55 + 0.35 * Math.sin(t * 0.65);
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      const detuneL = f * (1 - 0.0025 * (c + 1));
      const detuneR = f * (1 + 0.0025 * (c + 1));
      padL += Math.sin(2 * Math.PI * detuneL * t + Math.sin(t * 1.2 + c)) * 0.09;
      padR += Math.sin(2 * Math.PI * detuneR * t + Math.cos(t * 1.1 + c)) * 0.09;
    }
    padL *= padSwell;
    padR *= padSwell;

    // Melodic Mid-High Arpeggio
    const arpNote = arpScale[(sixteenthStep * 3 + barIndex) % arpScale.length];
    const arpEnv = Math.exp(-sixteenthPos * 5.5) * (isClimax ? 0.22 : 0.13);
    const arpPan = 0.5 + 0.4 * Math.sin(sixteenthStep * 0.9);
    const arpWave = (
      Math.sin(2 * Math.PI * arpNote * t) +
      0.4 * Math.sin(2 * Math.PI * arpNote * 2 * t)
    ) * arpEnv;

    // 3. HIGH FREQUENCIES: Starlight Chimes & Shimmering Hi-Hat Sparks (2500 - 12000 Hz)
    let highL = 0;
    let highR = 0;
    // Every 2nd 16th note or on beat transients, emit crystalline high-frequency harmonics
    if (t > 2.4) {
      const shimmerEnv = Math.exp(-sixteenthPos * 14.0) * (isClimax ? 0.24 : 0.12);
      const chimeFreq = arpNote * 4.0; // 2400Hz - 7000Hz
      const metallic = (
        Math.sin(2 * Math.PI * chimeFreq * t) * 0.6 +
        Math.sin(2 * Math.PI * (chimeFreq * 1.414) * t) * 0.4 +
        rand() * 0.35
      ) * shimmerEnv;

      // Occasional sparkling bell burst every 2 beats
      const twoBeatPos = (t % (beatDuration * 2)) / (beatDuration * 2);
      const bellEnv = Math.exp(-twoBeatPos * 8.0) * 0.16;
      const bell = Math.sin(2 * Math.PI * 3520 * t) * Math.cos(2 * Math.PI * 5280 * t) * bellEnv;

      highL = metallic * (1 - arpPan * 0.5) + bell;
      highR = metallic * (0.5 + arpPan * 0.5) + bell;
    }

    // Combine and soft-clip
    const rawL = (bassSignal + padL + arpWave * arpPan + highL) * fadeEnv;
    const rawR = (bassSignal + padR + arpWave * (1 - arpPan) + highR) * fadeEnv;

    const outL = Math.tanh(rawL * 1.15);
    const outR = Math.tanh(rawR * 1.15);

    view.setInt16(offset, Math.max(-32767, Math.min(32767, Math.floor(outL * 32767))), true);
    view.setInt16(offset + 2, Math.max(-32767, Math.min(32767, Math.floor(outR * 32767))), true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * ============================================================================
 * HELPER UTILITIES
 * ============================================================================
 */
interface TrackMetadata {
  title: string;
  format: string;
  sizeMB: string;
}

interface Shockwave {
  radius: number;
  maxRadius: number;
  alpha: number;
  lineWidth: number;
  hue: number;
}

interface StarSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  hue: number;
}

type AppState = 'initial' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function extractTrackMetadata(file: File): TrackMetadata {
  const rawName = file.name || 'Untitled Cosmic Track';
  const lastDot = rawName.lastIndexOf('.');
  const title = lastDot > 0 ? rawName.substring(0, lastDot) : rawName;
  const ext = lastDot > 0 ? rawName.substring(lastDot + 1).toUpperCase() : 'AUDIO';
  return {
    title: title.replace(/[_-]+/g, ' ').trim() || rawName,
    format: ext.slice(0, 5),
    sizeMB: (file.size / (1024 * 1024)).toFixed(1)
  };
}

/**
 * Generate a fallback symmetrical waveform if decodeAudioData fails on huge files
 */
function createFallbackWaveform(barsCount = 96): number[] {
  const bars: number[] = [];
  for (let i = 0; i < barsCount; i++) {
    const norm = i / barsCount;
    const envelope = Math.sin(norm * Math.PI);
    const detail = 0.4 + 0.45 * Math.abs(Math.sin(i * 0.43) * Math.cos(i * 0.19));
    bars.push(Math.max(0.14, Math.min(1, envelope * detail + 0.15)));
  }
  return bars;
}

/**
 * ============================================================================
 * MAIN APPLICATION COMPONENT: COSMOS
 * ============================================================================
 */
export default function App() {
  // Application Lifecycle State:
  // 'initial' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error'
  const [appState, setAppState] = useState<AppState>('initial');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [trackMeta, setTrackMeta] = useState<TrackMetadata | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(() => createFallbackWaveform(96));

  // Playback UI state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [hoverSeekRatio, setHoverSeekRatio] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [zenMode, setZenMode] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  // Refs for Web Audio API & Persistent Elements
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const waveformContainerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const timeDataRef = useRef<Uint8Array | null>(null);

  // Live reactive metrics ref (shared with canvas loop without triggering React re-renders)
  const audioMetricsRef = useRef({
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    rawBass: 0,
    rawHigh: 0,
    bassAvg: 0.08,
    highAvg: 0.05,
    lastBassBeatTime: 0,
    lastHighSparkTime: 0,
    beatPulse: 0,
    isPlaying: false
  });

  // UI micro-meter refs for zero-overhead DOM style updates in the control dock
  const bassBarRef = useRef<HTMLSpanElement | null>(null);
  const midBarRef = useRef<HTMLSpanElement | null>(null);
  const highBarRef = useRef<HTMLSpanElement | null>(null);

  // Pointer parallax tracking ref
  const pointerRef = useRef({
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0
  });

  // Check OS reduced-motion preference on mount
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Sync appState to audioMetricsRef so the requestAnimationFrame loop knows playback state immediately
  useEffect(() => {
    audioMetricsRef.current.isPlaying = appState === 'playing';
  }, [appState]);

  /**
   * Initialize or resume the Web Audio API pipeline connected to our persistent <audio> element
   */
  const ensureAudioGraph = useCallback(() => {
    if (!audioRef.current) return null;

    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDataRef.current = new Uint8Array(analyser.fftSize);
    }

    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => { });
    }

    return audioCtxRef.current;
  }, []);

  /**
   * Compute real multi-bar waveform from the selected audio file
   */
  const extractWaveformFromFile = useCallback(async (file: File, barsCount = 96): Promise<number[]> => {
    try {
      // Avoid decoding extraordinarily large files (>80MB) into memory just for the preview bar
      if (file.size > 85 * 1024 * 1024) {
        return createFallbackWaveform(barsCount);
      }
      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      const rawData = audioBuffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(rawData.length / barsCount));
      const peaks: number[] = [];
      let maxPeak = 0.001;

      for (let i = 0; i < barsCount; i++) {
        const start = i * blockSize;
        let sum = 0;
        // Sample stride for fast computation
        const stride = Math.max(1, Math.floor(blockSize / 64));
        let count = 0;
        for (let j = 0; j < blockSize && start + j < rawData.length; j += stride) {
          sum += Math.abs(rawData[start + j]);
          count++;
        }
        const avg = count > 0 ? sum / count : 0;
        if (avg > maxPeak) maxPeak = avg;
        peaks.push(avg);
      }

      await tempCtx.close().catch(() => { });

      return peaks.map((p) => Math.max(0.14, Math.min(1, Math.pow(p / maxPeak, 0.75))));
    } catch {
      return createFallbackWaveform(barsCount);
    }
  }, []);

  /**
   * Clean up current object URL and reset audio element safely
   */
  const cleanupCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
  }, []);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cleanupCurrentAudio();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => { });
      }
    };
  }, [cleanupCurrentAudio]);

  /**
   * Process an uploaded or dropped audio File
   */
  const processAudioFile = useCallback(
    async (file: File) => {
      if (!file) return;

      // Validate audio MIME type or file extension
      const validExtensions = /\.(mp3|wav|ogg|flac|m4a|aac|webm|opus|mp4)$/i;
      const isAudioMime = file.type.startsWith('audio/') || file.type === 'video/mp4' || file.type === 'video/webm';

      if (!isAudioMime && !validExtensions.test(file.name)) {
        setErrorMessage(
          'Unsupported file format. Please choose an audio file such as MP3, WAV, OGG, FLAC, or M4A.'
        );
        setAppState('error');
        return;
      }

      setErrorMessage('');
      setAppState('loading');

      // Stop and release any previous track
      cleanupCurrentAudio();

      const meta = extractTrackMetadata(file);
      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;

      try {
        // Load metadata into persistent <audio> element and compute waveform in parallel
        const audioEl = audioRef.current;
        if (!audioEl) return;

        const metadataPromise = new Promise<number>((resolve, reject) => {
          const onLoaded = () => {
            cleanupListeners();
            resolve(audioEl.duration);
          };
          const onError = () => {
            cleanupListeners();
            reject(new Error('Browser could not decode or play this audio file.'));
          };
          const cleanupListeners = () => {
            audioEl.removeEventListener('loadedmetadata', onLoaded);
            audioEl.removeEventListener('error', onError);
          };

          audioEl.addEventListener('loadedmetadata', onLoaded, { once: true });
          audioEl.addEventListener('error', onError, { once: true });
          audioEl.src = objectUrl;
          audioEl.load();
        });

        const [loadedDuration, computedWaveform] = await Promise.all([
          metadataPromise,
          extractWaveformFromFile(file, 96)
        ]);

        audioEl.volume = isMuted ? 0 : volume;
        audioEl.currentTime = 0;

        setTrackMeta(meta);
        setDuration(Number.isFinite(loadedDuration) ? loadedDuration : 0);
        setCurrentTime(0);
        setWaveformBars(computedWaveform);
        // Transition to Ready state — wait for user to press Play!
        setAppState('ready');
      } catch (err: unknown) {
        cleanupCurrentAudio();
        setTrackMeta(null);
        const msg = err instanceof Error ? err.message : 'Unable to decode this audio file. Please try another MP3, WAV, OGG, or FLAC track.';
        setErrorMessage(msg);
        setAppState('error');
      }
    },
    [cleanupCurrentAudio, extractWaveformFromFile, isMuted, volume]
  );

  /**
   * Generate and load the built-in procedural Cosmic Odyssey track
   */
  const handleLoadSynthesizedDemo = useCallback(async () => {
    setErrorMessage('');
    setAppState('loading');
    // Allow loading UI to render before synthesizing PCM buffer
    setTimeout(() => {
      const wavBlob = generateCosmicDemoWavBlob();
      const demoFile = new File([wavBlob], 'Supernova Horizon (Synthesized Odyssey).wav', {
        type: 'audio/wav'
      });
      processAudioFile(demoFile);
    }, 60);
  }, [processAudioFile]);

  /**
   * Play / Pause / Replay Handler
   */
  const handleTogglePlay = useCallback(async () => {
    const audioEl = audioRef.current;
    if (!audioEl || !objectUrlRef.current) return;

    try {
      ensureAudioGraph();

      if (appState === 'playing') {
        audioEl.pause();
        setAppState('paused');
      } else {
        if (appState === 'ended' || audioEl.ended) {
          audioEl.currentTime = 0;
          setCurrentTime(0);
        }
        await audioEl.play();
        setAppState('playing');
      }
    } catch {
      setErrorMessage('Playback could not be started. Please interact with the controls and try again.');
      setAppState('error');
    }
  }, [appState, ensureAudioGraph]);

  /**
   * Discard Track & Return to Initial Upload Portal
   */
  const handleDiscardTrack = useCallback(() => {
    cleanupCurrentAudio();
    setTrackMeta(null);
    setErrorMessage('');
    setZenMode(false);
    setAppState('initial');
  }, [cleanupCurrentAudio]);

  /**
   * Trigger file dialog for upload or reupload
   */
  const handleOpenFileDialog = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }, []);

  /**
   * Seek to a normalized position [0..1]
   */
  const seekToRatio = useCallback(
    (ratio: number) => {
      const audioEl = audioRef.current;
      if (!audioEl || !duration) return;
      const clamped = Math.max(0, Math.min(1, ratio));
      const newTime = clamped * duration;
      audioEl.currentTime = newTime;
      setCurrentTime(newTime);
      if (appState === 'ended') {
        setAppState('paused');
      }
    },
    [duration, appState]
  );

  /**
   * Volume & Mute Handlers
   */
  const handleVolumeChange = useCallback((newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    if (clamped > 0) setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = false;
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  /**
   * Keyboard shortcuts for accessibility & smooth control
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      const hasTrack = ['ready', 'playing', 'paused', 'ended'].includes(appState);
      if (!hasTrack) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowRight' && duration > 0) {
        e.preventDefault();
        seekToRatio((currentTime + 5) / duration);
      } else if (e.code === 'ArrowLeft' && duration > 0) {
        e.preventDefault();
        seekToRatio((currentTime - 5) / duration);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        setZenMode((z) => !z);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appState, currentTime, duration, handleToggleMute, handleTogglePlay, seekToRatio]);

  /**
   * Scrubbing pointer events on the waveform progress bar
   */
  const calculateRatioFromClientX = useCallback((clientX: number) => {
    if (!waveformContainerRef.current) return 0;
    const rect = waveformContainerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!isScrubbing) return;
    const onPointerMove = (e: PointerEvent) => {
      const ratio = calculateRatioFromClientX(e.clientX);
      setHoverSeekRatio(ratio);
      seekToRatio(ratio);
    };
    const onPointerUp = () => {
      setIsScrubbing(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isScrubbing, calculateRatioFromClientX, seekToRatio]);

  /**
   * Global Drag-and-Drop Handlers
   */
  useEffect(() => {
    let dragDepth = 0;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragDepth++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsDraggingFile(true);
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setIsDraggingFile(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth = 0;
      setIsDraggingFile(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        processAudioFile(file);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [processAudioFile]);

  /**
   * ============================================================================
   * THE COSMOS SPACE & AUDIO-REACTIVE CANVAS ENGINE
   * Multi-layered parallax starfield, distant spiral galaxies, volumetric nebulae,
   * beat shockwaves, star sparks, and the 3D-projected central COSMOS singularity core.
   * ============================================================================
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Adaptive particle density based on screen size and reduced-motion preference
    const isCompactDevice = width < 768;
    const starCount = reducedMotion ? 350 : isCompactDevice ? 550 : 1050;
    const coreOrbitalCount = reducedMotion ? 90 : isCompactDevice ? 140 : 240;

    // 1. Generate Parallax Starfield (3 distinct depth layers)
    // Layer 0: Deep background tiny stars
    // Layer 1: Midground colorful stars
    // Layer 2: Foreground bright twinkling stars
    const starPalettes = [
      { r: 215, g: 230, b: 255 }, // Ice blue-white
      { r: 255, g: 248, b: 238 }, // Warm stellar white
      { r: 170, g: 210, b: 255 }, // Cyan-blue giant
      { r: 210, g: 180, b: 255 }, // Violet-indigo star
      { r: 255, g: 205, b: 235 }  // Faint magenta-rose star
    ];

    const stars = Array.from({ length: starCount }, (_, i) => {
      const layerRoll = Math.random();
      const layer = layerRoll < 0.58 ? 0 : layerRoll < 0.88 ? 1 : 2;
      const color = starPalettes[i % starPalettes.length];
      return {
        x: Math.random(),
        y: Math.random(),
        layer,
        baseRadius:
          layer === 0
            ? 0.45 + Math.random() * 0.55
            : layer === 1
              ? 0.85 + Math.random() * 0.8
              : 1.35 + Math.random() * 1.15,
        baseAlpha:
          layer === 0
            ? 0.25 + Math.random() * 0.45
            : layer === 1
              ? 0.45 + Math.random() * 0.45
              : 0.65 + Math.random() * 0.35,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.6 + Math.random() * 2.4,
        color
      };
    });

    // 2. Distant Galaxies & Cosmic Dust Clouds
    const distantGalaxies = [
      {
        xRatio: 0.17,
        yRatio: 0.22,
        radius: 130,
        tilt: 0.42,
        angle: 0.55,
        hue: 255,
        spinSpeed: 0.00018
      },
      {
        xRatio: 0.83,
        yRatio: 0.27,
        radius: 105,
        tilt: 0.35,
        angle: -0.48,
        hue: 195,
        spinSpeed: -0.00022
      },
      {
        xRatio: 0.22,
        yRatio: 0.78,
        radius: 95,
        tilt: 0.5,
        angle: 1.1,
        hue: 295,
        spinSpeed: 0.00015
      }
    ];

    // 3. Volumetric Nebula Clouds (Rich violet, indigo, cyan, and subtle magenta)
    const nebulaClouds = [
      {
        angleOffset: 0,
        orbitRadius: 0.16,
        sizeRatio: 0.48,
        r: 76,
        g: 29,
        b: 149, // Deep Cosmic Violet
        speed: 0.09,
        band: 'bass'
      },
      {
        angleOffset: 1.6,
        orbitRadius: 0.2,
        sizeRatio: 0.44,
        r: 30,
        g: 64,
        b: 175, // Midnight Indigo
        speed: -0.07,
        band: 'mid'
      },
      {
        angleOffset: 3.1,
        orbitRadius: 0.18,
        sizeRatio: 0.4,
        r: 6,
        g: 148,
        b: 192, // Luminous Cyan
        speed: 0.11,
        band: 'mid'
      },
      {
        angleOffset: 4.7,
        orbitRadius: 0.15,
        sizeRatio: 0.38,
        r: 157,
        g: 23,
        b: 115, // Subtle Magenta
        speed: -0.08,
        band: 'high'
      },
      {
        angleOffset: 2.3,
        orbitRadius: 0.07,
        sizeRatio: 0.34,
        r: 99,
        g: 102,
        b: 241, // Core Indigo-Blue
        speed: 0.13,
        band: 'bass'
      }
    ];

    // 4. Signature Central Formation: 3D Tilted Orbital Particles
    // Distributed across 3 intersecting orbital planes around the central core
    const orbitalParticles = Array.from({ length: coreOrbitalCount }, (_, i) => {
      const ringIndex = i % 3;
      const baseOrbitRadius =
        ringIndex === 0
          ? 74 + Math.random() * 44
          : ringIndex === 1
            ? 112 + Math.random() * 58
            : 155 + Math.random() * 75;

      return {
        ringIndex,
        theta: Math.random() * Math.PI * 2,
        baseSpeed: (0.0022 + Math.random() * 0.0045) * (ringIndex === 1 ? -1 : 1),
        baseOrbitRadius,
        radiusOffset: (Math.random() - 0.5) * 14,
        size: 0.9 + Math.random() * 1.9,
        hueOffset: (Math.random() - 0.5) * 40,
        alpha: 0.35 + Math.random() * 0.65
      };
    });

    // 5. Dynamic Transient Pools: Bass Shockwave Rings & High-Frequency Star Sparks
    const shockwaves: Shockwave[] = [];
    const starSparks: StarSpark[] = [];

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Subtle pointer parallax listener
    const handlePointerMove = (e: PointerEvent) => {
      const normX = (e.clientX / Math.max(1, width) - 0.5) * 2;
      const normY = (e.clientY / Math.max(1, height) - 0.5) * 2;
      pointerRef.current.targetX = normX;
      pointerRef.current.targetY = normY;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    let animationFrameId: number;
    let lastTime = performance.now();
    let elapsed = 0;

    const renderLoop = (now: number) => {
      animationFrameId = requestAnimationFrame(renderLoop);

      // Pause heavy GPU work if browser tab is hidden
      if (document.hidden) {
        lastTime = now;
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const motionScale = reducedMotion ? 0.25 : 1.0;
      elapsed += dt * motionScale;

      // Smooth pointer parallax interpolation
      const ptr = pointerRef.current;
      ptr.currentX += (ptr.targetX - ptr.currentX) * 0.04;
      ptr.currentY += (ptr.targetY - ptr.currentY) * 0.04;

      // ======================================================================
      // AUDIO ANALYSIS & FREQUENCY BAND EXTRACTION
      // ======================================================================
      const metrics = audioMetricsRef.current;
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;

      if (metrics.isPlaying && analyser && freqData) {
        analyser.getByteFrequencyData(freqData as unknown as Uint8Array<ArrayBuffer>);
        const sampleRate = audioCtxRef.current?.sampleRate || 44100;
        const binCount = analyser.frequencyBinCount; // 1024 bins
        const nyquist = sampleRate / 2;
        const hzPerBin = nyquist / binCount; // ~21.5 Hz per bin

        const bassEndBin = Math.max(2, Math.min(binCount - 1, Math.round(145 / hzPerBin)));
        const midEndBin = Math.max(bassEndBin + 1, Math.min(binCount - 1, Math.round(2200 / hzPerBin)));
        const highEndBin = Math.max(midEndBin + 1, Math.min(binCount - 1, Math.round(14000 / hzPerBin)));

        let bassSum = 0;
        for (let i = 1; i <= bassEndBin; i++) bassSum += freqData[i];
        const rawBass = bassSum / (bassEndBin * 255);

        let midSum = 0;
        for (let i = bassEndBin + 1; i <= midEndBin; i++) midSum += freqData[i];
        const rawMid = midSum / ((midEndBin - bassEndBin) * 255);

        let highSum = 0;
        for (let i = midEndBin + 1; i <= highEndBin; i++) highSum += freqData[i];
        const rawHigh = highSum / ((highEndBin - midEndBin) * 255);

        // Apply slight non-linear curve for expressive dynamic range
        const shapedBass = Math.pow(rawBass, 1.25);
        const shapedMid = Math.pow(rawMid, 1.15);
        const shapedHigh = Math.min(1, Math.pow(rawHigh * 1.45, 1.1));
        const rawEnergy = shapedBass * 0.45 + shapedMid * 0.35 + shapedHigh * 0.2;

        // Asymmetric smoothing: fast attack, graceful organic release
        const smoothBand = (current: number, target: number, attack = 0.28, release = 0.08) =>
          target > current
            ? current + (target - current) * attack
            : current + (target - current) * release;

        metrics.bass = smoothBand(metrics.bass, shapedBass, 0.34, 0.09);
        metrics.mid = smoothBand(metrics.mid, shapedMid, 0.22, 0.07);
        metrics.high = smoothBand(metrics.high, shapedHigh, 0.38, 0.11);
        metrics.energy = smoothBand(metrics.energy, rawEnergy, 0.25, 0.06);

        // Beat-Onset / Transient Detection for Bass (Cosmic Pulse Shockwaves)
        metrics.bassAvg = metrics.bassAvg * 0.94 + shapedBass * 0.06;
        const bassFlux = shapedBass - metrics.bassAvg;
        if (
          shapedBass > 0.22 &&
          bassFlux > 0.095 &&
          now - metrics.lastBassBeatTime > 230
        ) {
          metrics.lastBassBeatTime = now;
          metrics.beatPulse = Math.min(1.0, 0.55 + bassFlux * 2.2);

          if (!reducedMotion && shockwaves.length < 7) {
            shockwaves.push({
              radius: 36 + metrics.bass * 30,
              maxRadius: Math.min(width, height) * (0.44 + metrics.energy * 0.22),
              alpha: Math.min(0.65, 0.28 + bassFlux * 1.4),
              lineWidth: 1.5 + shapedBass * 2.5,
              hue: 220 + metrics.mid * 75
            });
          }
        }

        // High-Frequency Transient Detection (Star Sparks & Micro-Bursts)
        metrics.highAvg = metrics.highAvg * 0.92 + shapedHigh * 0.08;
        const highFlux = shapedHigh - metrics.highAvg;
        if (
          shapedHigh > 0.14 &&
          highFlux > 0.055 &&
          now - metrics.lastHighSparkTime > 110
        ) {
          metrics.lastHighSparkTime = now;
          const burstCount = reducedMotion ? 2 : Math.min(8, Math.floor(2 + shapedHigh * 7));
          for (let s = 0; s < burstCount; s++) {
            if (starSparks.length < 85) {
              const angle = Math.random() * Math.PI * 2;
              const spawnDist = 25 + Math.random() * Math.min(width, height) * 0.36;
              const speed = (22 + Math.random() * 85) * (0.6 + shapedHigh);
              starSparks.push({
                x: Math.cos(angle) * spawnDist,
                y: Math.sin(angle) * spawnDist,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1.2 + Math.random() * 2.4,
                life: 1.0,
                decay: 0.75 + Math.random() * 0.95,
                hue: Math.random() < 0.5 ? 190 + Math.random() * 35 : 275 + Math.random() * 50
              });
            }
          }
        }
      } else {
        // Idle / Paused / Ready state: decay audio reactivity smoothly to zero
        metrics.bass *= 0.93;
        metrics.mid *= 0.93;
        metrics.high *= 0.93;
        metrics.energy *= 0.93;
      }

      metrics.beatPulse *= 0.9;

      // Update live micro-meter bars in the control dock via refs (zero React re-renders)
      if (bassBarRef.current) {
        bassBarRef.current.style.transform = `scaleY(${Math.max(0.18, Math.min(1, metrics.bass * 1.15))})`;
      }
      if (midBarRef.current) {
        midBarRef.current.style.transform = `scaleY(${Math.max(0.18, Math.min(1, metrics.mid * 1.25))})`;
      }
      if (highBarRef.current) {
        highBarRef.current.style.transform = `scaleY(${Math.max(0.18, Math.min(1, metrics.high * 1.35))})`;
      }

      const bass = metrics.bass;
      const mid = metrics.mid;
      const high = metrics.high;
      const energy = metrics.energy;
      const beatPulse = metrics.beatPulse;

      // Center of the universe (shifted slightly above vertical center when dock is visible)
      const centerX = width * 0.5 + ptr.currentX * 14;
      const centerY = height * 0.46 + ptr.currentY * 14;
      const minDim = Math.min(width, height);

      // ======================================================================
      // LAYER 1: DEEP SPACE BACKGROUND GRADIENT
      // ======================================================================
      ctx.globalCompositeOperation = 'source-over';
      const bgGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        minDim * 0.04,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      const bgBrightness = Math.floor(energy * 16);
      bgGrad.addColorStop(0, `rgb(${10 + bgBrightness}, ${14 + bgBrightness}, ${32 + bgBrightness * 2})`);
      bgGrad.addColorStop(0.55, `rgb(${5 + Math.floor(bgBrightness * 0.4)}, ${8 + Math.floor(bgBrightness * 0.5)}, ${18 + bgBrightness})`);
      bgGrad.addColorStop(1, '#020308');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // ======================================================================
      // LAYER 2: DISTANT SPIRAL GALAXIES & COSMIC DUST
      // ======================================================================
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let g = 0; g < distantGalaxies.length; g++) {
        const gal = distantGalaxies[g];
        gal.angle += gal.spinSpeed * (1 + energy * 2.5) * motionScale;
        const gx = gal.xRatio * width - ptr.currentX * 12;
        const gy = gal.yRatio * height - ptr.currentY * 12;
        const gRadius = gal.radius * (minDim / 900) * (1 + bass * 0.12);

        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(gal.angle);
        ctx.scale(1, gal.tilt);

        const galGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, gRadius);
        const alphaBoost = 0.09 + energy * 0.1;
        galGrad.addColorStop(0, `hsla(${gal.hue}, 90%, 82%, ${alphaBoost * 1.8})`);
        galGrad.addColorStop(0.35, `hsla(${gal.hue + 20}, 80%, 55%, ${alphaBoost})`);
        galGrad.addColorStop(0.7, `hsla(${gal.hue - 25}, 75%, 35%, ${alphaBoost * 0.4})`);
        galGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = galGrad;
        ctx.beginPath();
        ctx.arc(0, 0, gRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // ======================================================================
      // LAYER 3: VOLUMETRIC NEBULA CLOUDS (BASS PULSE + MIDRANGE FLOW)
      // ======================================================================
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Midrange frequencies accelerate nebula flow and color vibrancy
      const nebulaFlowTime = elapsed * (1 + mid * 2.2);

      for (let n = 0; n < nebulaClouds.length; n++) {
        const cloud = nebulaClouds[n];
        const angle = cloud.angleOffset + nebulaFlowTime * cloud.speed;
        const orbitDist = minDim * cloud.orbitRadius * (1 + Math.sin(nebulaFlowTime * 0.4 + n) * 0.15);

        const nx = centerX + Math.cos(angle) * orbitDist - ptr.currentX * (18 + n * 4);
        const ny = centerY + Math.sin(angle * 0.85) * orbitDist - ptr.currentY * (18 + n * 4);

        // Bass expands the nebula clouds; Midrange enriches their intensity
        const bandLevel =
          cloud.band === 'bass' ? bass : cloud.band === 'mid' ? mid : high;
        const cloudRadius =
          minDim *
          cloud.sizeRatio *
          (1 + bass * 0.28 + beatPulse * 0.14 + bandLevel * 0.18);

        const baseOpacity = 0.11 + energy * 0.14 + bandLevel * 0.16;

        // Subtle midrange color shift
        const rShift = Math.min(255, Math.floor(cloud.r + mid * 45 + beatPulse * 30));
        const gShift = Math.min(255, Math.floor(cloud.g + high * 40 + mid * 25));
        const bShift = Math.min(255, Math.floor(cloud.b + bass * 35));

        const nebGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, cloudRadius);
        nebGrad.addColorStop(0, `rgba(${rShift}, ${gShift}, ${bShift}, ${Math.min(0.48, baseOpacity)})`);
        nebGrad.addColorStop(0.45, `rgba(${rShift}, ${gShift}, ${bShift}, ${Math.min(0.28, baseOpacity * 0.55)})`);
        nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = nebGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, cloudRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ======================================================================
      // LAYER 4: MULTI-LAYER PARALLAX STARFIELD (HIGH FREQUENCIES -> TWINKLE)
      // ======================================================================
      ctx.save();
      const driftSpeedX = 0.0022 * (1 + energy * 1.8) * motionScale;
      const driftSpeedY = 0.0009 * (1 + energy * 1.4) * motionScale;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const depthFactor = star.layer === 0 ? 0.35 : star.layer === 1 ? 0.7 : 1.25;

        // Continuous slow cosmic drift + pointer parallax
        const sx =
          ((star.x * width +
            elapsed * 12 * depthFactor * (1 + driftSpeedX * 40) -
            ptr.currentX * 26 * depthFactor) %
            width +
            width) %
          width;
        const sy =
          ((star.y * height +
            elapsed * 5 * depthFactor * (1 + driftSpeedY * 40) -
            ptr.currentY * 26 * depthFactor) %
            height +
            height) %
          height;

        // High frequencies accelerate star twinkle and luminous sparkle
        const twinkleRate = star.twinkleSpeed * (1 + high * 5.5);
        const twinkleWave = 0.5 + 0.5 * Math.sin(elapsed * twinkleRate + star.twinklePhase);
        const alpha = Math.min(
          1,
          star.baseAlpha * (0.55 + 0.45 * twinkleWave) + high * (star.layer * 0.25)
        );
        const radius = star.baseRadius * (1 + high * (star.layer === 2 ? 0.55 : 0.22));

        ctx.fillStyle = `rgba(${star.color.r}, ${star.color.g}, ${star.color.b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();

        // Foreground bright stars get delicate 4-point celestial cross-flares on high-frequency energy
        if (star.layer === 2 && (high > 0.22 || twinkleWave > 0.92)) {
          const flareLen = radius * (2.6 + high * 5.5);
          ctx.strokeStyle = `rgba(${star.color.r}, ${star.color.g}, 255, ${alpha * 0.45})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(sx - flareLen, sy);
          ctx.lineTo(sx + flareLen, sy);
          ctx.moveTo(sx, sy - flareLen);
          ctx.lineTo(sx, sy + flareLen);
          ctx.stroke();
        }
      }
      ctx.restore();

      // ======================================================================
      // LAYER 5: SIGNATURE VISUAL ELEMENT — THE COSMOS CORE
      // A luminous spherical nebula & cosmic core surrounded by 3D orbital particles,
      // harmonic corona filaments, and expanding bass-transient shockwave rings.
      // ======================================================================
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.globalCompositeOperation = 'lighter';

      //Gentle breathing when idle/paused + rhythmic expansion on Bass
      const idleBreath = Math.sin(elapsed * 1.35) * 0.06;
      const coreScale =
        (minDim / 900) *
        (0.95 + idleBreath + bass * 0.48 + beatPulse * 0.22);
      const baseCoreRadius = Math.max(48, Math.min(115, 78 * coreScale));

      // 5A. Expanding Bass Shockwave Rings (Cosmic Pulse Transients)
      for (let w = shockwaves.length - 1; w >= 0; w--) {
        const wave = shockwaves[w];
        wave.radius += (180 + bass * 220) * dt;
        const progress = wave.radius / wave.maxRadius;
        const currentAlpha = wave.alpha * (1 - progress);

        if (progress >= 1 || currentAlpha <= 0.005) {
          shockwaves.splice(w, 1);
          continue;
        }

        ctx.save();
        ctx.strokeStyle = `hsla(${wave.hue}, 90%, 75%, ${currentAlpha})`;
        ctx.lineWidth = wave.lineWidth * (1 - progress * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, wave.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 5B. Outer Atmospheric Corona Glow
      const coreHue = 235 + mid * 45 - bass * 20; // Evolves between deep indigo, cyan, and violet-magenta
      const secondaryHue = 190 + high * 70;
      const outerHaloRadius = baseCoreRadius * (3.1 + energy * 1.4);

      const outerHalo = ctx.createRadialGradient(0, 0, baseCoreRadius * 0.2, 0, 0, outerHaloRadius);
      outerHalo.addColorStop(0, `hsla(${secondaryHue}, 95%, 85%, ${0.28 + energy * 0.32})`);
      outerHalo.addColorStop(0.32, `hsla(${coreHue}, 88%, 62%, ${0.18 + bass * 0.24})`);
      outerHalo.addColorStop(0.68, `hsla(${coreHue + 35}, 82%, 45%, ${0.06 + mid * 0.12})`);
      outerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = outerHalo;
      ctx.beginPath();
      ctx.arc(0, 0, outerHaloRadius, 0, Math.PI * 2);
      ctx.fill();

      // 5C. Silky Harmonic Filaments / Nebula Ribbons around the Core
      const ribbonCount = 3;
      for (let r = 0; r < ribbonCount; r++) {
        ctx.save();
        const ribbonAngle = elapsed * (0.22 + r * 0.09) * (r % 2 === 0 ? 1 : -1);
        ctx.rotate(ribbonAngle);

        ctx.beginPath();
        const points = 72;
        const ringBase = baseCoreRadius * (1.18 + r * 0.26);
        for (let p = 0; p <= points; p++) {
          const a = (p / points) * Math.PI * 2;
          const waveOffset =
            Math.sin(a * (3 + r) + elapsed * 2.2) * (6 + mid * 24) +
            Math.cos(a * (5 - r) - elapsed * 1.7) * (4 + bass * 18);
          const rad = ringBase + waveOffset;
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad * (0.68 + 0.14 * r);
          if (p === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${coreHue + r * 28}, 90%, 72%, ${0.14 + mid * 0.28 + beatPulse * 0.15})`;
        ctx.lineWidth = 1.2 + mid * 1.8;
        ctx.stroke();
        ctx.restore();
      }

      // 5D. 3D-Projected Orbital Particle Rings around the Core
      const ringTilts = [
        { rotZ: 0.38 + elapsed * 0.05, tiltX: 0.34 },
        { rotZ: -0.52 - elapsed * 0.04, tiltX: 0.48 },
        { rotZ: 1.15 + elapsed * 0.03, tiltX: 0.28 }
      ];

      for (let i = 0; i < orbitalParticles.length; i++) {
        const pt = orbitalParticles[i];
        // Orbital speed increases with overall musical energy and midrange flow
        pt.theta += pt.baseSpeed * (1 + energy * 3.4 + mid * 2.2) * motionScale;

        const tiltInfo = ringTilts[pt.ringIndex];
        const orbitR =
          (pt.baseOrbitRadius * (minDim / 900) + pt.radiusOffset) *
          (1 + bass * 0.22 + beatPulse * 0.1);

        const localX = Math.cos(pt.theta) * orbitR;
        const localY = Math.sin(pt.theta) * orbitR * tiltInfo.tiltX;
        const zDepth = Math.sin(pt.theta); // -1 (back) to +1 (front)

        const cosR = Math.cos(tiltInfo.rotZ);
        const sinR = Math.sin(tiltInfo.rotZ);
        const rx = localX * cosR - localY * sinR;
        const ry = localX * sinR + localY * cosR;

        const perspectiveScale = 0.75 + 0.35 * (zDepth * 0.5 + 0.5);
        const pRadius = pt.size * perspectiveScale * (1 + high * 0.65);
        const pAlpha = Math.min(
          1,
          pt.alpha * (0.5 + 0.5 * (zDepth * 0.5 + 0.5)) * (0.65 + energy * 0.7 + high * 0.4)
        );
        const pHue = coreHue + pt.hueOffset + high * 35;

        ctx.fillStyle = `hsla(${pHue}, 95%, 78%, ${pAlpha})`;
        ctx.beginPath();
        ctx.arc(rx, ry, pRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5E. High-Frequency Transient Star Sparks
      for (let s = starSparks.length - 1; s >= 0; s--) {
        const sp = starSparks[s];
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.life -= sp.decay * dt;

        if (sp.life <= 0) {
          starSparks.splice(s, 1);
          continue;
        }

        ctx.fillStyle = `hsla(${sp.hue}, 100%, 86%, ${sp.life * 0.85})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5F. Luminous Inner Singularity Sphere
      const innerCoreGrad = ctx.createRadialGradient(
        -baseCoreRadius * 0.15,
        -baseCoreRadius * 0.15,
        baseCoreRadius * 0.05,
        0,
        0,
        baseCoreRadius
      );
      innerCoreGrad.addColorStop(0, `rgba(255, 255, 255, ${0.75 + beatPulse * 0.25})`);
      innerCoreGrad.addColorStop(0.28, `hsla(${secondaryHue}, 95%, 80%, ${0.55 + energy * 0.3})`);
      innerCoreGrad.addColorStop(0.65, `hsla(${coreHue}, 88%, 58%, ${0.28 + bass * 0.3})`);
      innerCoreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = innerCoreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, baseCoreRadius, 0, Math.PI * 2);
      ctx.fill();

      // Delicate crisp rim around the core horizon
      ctx.strokeStyle = `hsla(${secondaryHue}, 95%, 88%, ${0.22 + beatPulse * 0.35 + high * 0.25})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, baseCoreRadius * 0.56, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      // ======================================================================
      // LAYER 6: CINEMATIC EDGE VIGNETTE
      // ======================================================================
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const vignette = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        minDim * 0.32,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(2, 3, 8, 0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    };

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [reducedMotion]);

  // Derived states for clean UI rendering
  const isTrackActive = ['ready', 'playing', 'paused', 'ended'].includes(appState);
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const activeRatio = isScrubbing && hoverSeekRatio !== null ? hoverSeekRatio : progressRatio;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#03040a] text-slate-100 select-none font-sans">
      {/* Inject Google Fonts & Custom Keyframe Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');

        .font-display {
          font-family: 'Syne', 'Inter', sans-serif;
        }
        .font-mono-tabular {
          font-family: 'JetBrains Mono', monospace;
          font-variant-numeric: tabular-nums;
        }

        @keyframes orbitSpinSlow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbitSpinReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes portalPulse {
          0%, 100% {
            box-shadow: 0 0 45px -5px rgba(99, 102, 241, 0.28),
                        0 0 90px -15px rgba(6, 182, 212, 0.18),
                        inset 0 0 28px rgba(255, 255, 255, 0.07);
          }
          50% {
            box-shadow: 0 0 65px 2px rgba(139, 92, 246, 0.42),
                        0 0 120px -10px rgba(6, 182, 212, 0.3),
                        inset 0 0 36px rgba(255, 255, 255, 0.14);
          }
        }
        @keyframes dockEntrance {
          from {
            opacity: 0;
            transform: translateY(28px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeScaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .orbit-ring-cw {
          animation: orbitSpinSlow 26s linear infinite;
        }
        .orbit-ring-ccw {
          animation: orbitSpinReverse 34s linear infinite;
        }
        .portal-glow {
          animation: portalPulse 5s ease-in-out infinite;
        }
        .dock-animate-in {
          animation: dockEntrance 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .fade-scale-in {
          animation: fadeScaleIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .orbit-ring-cw,
          .orbit-ring-ccw,
          .portal-glow {
            animation: none !important;
          }
        }
      `}</style>

      {/* Hidden File Input & Persistent HTML5 Audio Element */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm,.opus"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processAudioFile(file);
        }}
      />
      <audio
        ref={audioRef}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (!isScrubbing && audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setAppState('ended');
          if (audioRef.current) {
            setCurrentTime(audioRef.current.duration || duration);
          }
        }}
        onPause={() => {
          if (appState === 'playing' && audioRef.current && !audioRef.current.ended) {
            setAppState('paused');
          }
        }}
        onPlay={() => {
          setAppState('playing');
        }}
      />

      {/* Full-Viewport Interactive Space Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full block pointer-events-none z-0"
      />

      {/* ====================================================================
          TOP MINIMAL AMBIENT BAR (Wordmark when playing + subtle utility pills)
      ==================================================================== */}
      <header
        className={`fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5 sm:px-10 transition-opacity duration-500 ${zenMode ? 'opacity-20 hover:opacity-100' : 'opacity-100'
          }`}
      >
        <div className="flex items-center gap-3">
          {isTrackActive && (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.09] shadow-lg">
              <span
                className={`w-2 h-2 rounded-full transition-colors duration-500 ${appState === 'playing'
                  ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee] animate-pulse'
                  : appState === 'ready'
                    ? 'bg-indigo-400 shadow-[0_0_8px_#818cf8]'
                    : 'bg-slate-400'
                  }`}
              />
              <span className="font-display text-xs tracking-[0.34em] text-white/90 uppercase">
                COSMOS
              </span>
            </div>
          )}
        </div>

        {/* Right subtle atmospheric controls */}
        <div className="flex items-center gap-2.5">
          {isTrackActive && (
            <>
              {/* Live 3-Band Reactivity Pill (Bass / Mid / High) */}
              <div
                title="Live Frequency Reactivity (Bass · Mid · High)"
                className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] text-[11px] text-slate-300/80"
              >
                <div className="flex items-end gap-1 h-3.5">
                  <span
                    ref={bassBarRef}
                    className="w-1 h-full rounded-full bg-violet-400 origin-bottom transition-transform duration-75"
                    style={{ transform: 'scaleY(0.2)' }}
                  />
                  <span
                    ref={midBarRef}
                    className="w-1 h-full rounded-full bg-cyan-400 origin-bottom transition-transform duration-75"
                    style={{ transform: 'scaleY(0.2)' }}
                  />
                  <span
                    ref={highBarRef}
                    className="w-1 h-full rounded-full bg-fuchsia-300 origin-bottom transition-transform duration-75"
                    style={{ transform: 'scaleY(0.2)' }}
                  />
                </div>
                <span className="tracking-wider uppercase text-[10px] text-slate-300/75 font-medium">
                  {appState === 'playing'
                    ? 'Live Telemetry'
                    : appState === 'ready'
                      ? 'Ready for Launch'
                      : appState === 'ended'
                        ? 'Orbit Complete'
                        : 'Standby'}
                </span>
              </div>

              {/* Zen Stargazer Mode Toggle */}
              <button
                type="button"
                onClick={() => setZenMode((prev) => !prev)}
                aria-label={zenMode ? 'Show interface controls' : 'Hide interface controls'}
                title={zenMode ? 'Restore Controls (H)' : 'Pure Universe View (H)'}
                className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.1] backdrop-blur-xl border border-white/[0.09] text-slate-300 hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
              >
                {zenMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </>
          )}

          {/* Reduced Motion Toggle */}
          <button
            type="button"
            onClick={() => setReducedMotion((prev) => !prev)}
            aria-label="Toggle reduced motion"
            title={reducedMotion ? 'Reduced Motion: ON' : 'Reduced Motion: OFF'}
            className={`px-3 py-1.5 rounded-full text-[11px] tracking-wider uppercase backdrop-blur-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${reducedMotion
              ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
              : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-slate-400 hover:text-slate-200'
              }`}
          >
            {reducedMotion ? 'Calm Motion' : 'Full Motion'}
          </button>
        </div>
      </header>

      {/* ====================================================================
          STATE 1 & ERROR: INITIAL UPLOAD PORTAL ("Drop a track into the universe")
      ==================================================================== */}
      {(appState === 'initial' || appState === 'error') && (
        <main className="relative z-10 flex flex-col items-center justify-center w-full h-full px-6 text-center fade-scale-in">
          {/* COSMOS Wordmark & Tagline */}
          <div className="mb-8 sm:mb-10">
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-[0.44em] text-white/95 uppercase pl-[0.44em] drop-shadow-[0_0_24px_rgba(165,180,252,0.35)]">
              COSMOS
            </h1>
            <p className="mt-2.5 text-sm sm:text-base font-light tracking-[0.14em] text-slate-300/80">
              Your music. Your universe.
            </p>
          </div>

          {/* Mysterious Circular Glassmorphism Portal Button */}
          <div className="relative flex items-center justify-center my-2 group">
            {/* Outer Decorative Orbital SVG Ring 1 (Clockwise) */}
            <svg
              className="w-64 h-64 sm:w-72 sm:h-72 pointer-events-none text-indigo-400/30 group-hover:text-cyan-300/50 transition-colors duration-700 orbit-ring-cw"
              viewBox="0 0 260 260"
            >
              <circle
                cx="130"
                cy="130"
                r="122"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="6 14 28 14"
              />
              <circle
                cx="130"
                cy="8"
                r="3.5"
                className="fill-cyan-300 drop-shadow-[0_0_8px_#67e8f9]"
              />
              <circle
                cx="130"
                cy="252"
                r="2.5"
                className="fill-violet-400"
              />
            </svg>

            {/* Inner Decorative Orbital SVG Ring 2 (Counter-Clockwise) */}
            <svg
              className="absolute w-52 h-52 sm:w-60 sm:h-60 pointer-events-none text-violet-300/25 group-hover:text-indigo-300/50 transition-colors duration-700 orbit-ring-ccw"
              viewBox="0 0 220 220"
            >
              <circle
                cx="110"
                cy="110"
                r="102"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="40 20 8 20"
              />
              <circle
                cx="212"
                cy="110"
                r="3"
                className="fill-fuchsia-300"
              />
            </svg>

            {/* Interactive Circular Glassmorphism Upload Button */}
            <button
              type="button"
              onClick={handleOpenFileDialog}
              aria-label="Drop a track into the universe or choose an audio file from your device"
              className="absolute w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-slate-950/45 hover:bg-slate-900/55 backdrop-blur-2xl border border-white/15 hover:border-cyan-300/45 portal-glow flex flex-col items-center justify-center p-5 transition-all duration-500 ease-out group-hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:ring-offset-4 focus:ring-offset-[#03040a] cursor-pointer"
            >
              {/* Soft inner radial glow */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-b from-white/[0.07] via-indigo-500/[0.04] to-transparent pointer-events-none" />

              {/* Minimal Upload Icon with subtle hover lift */}
              <div className="relative z-10 w-12 h-12 rounded-full bg-white/[0.06] group-hover:bg-cyan-400/15 border border-white/10 group-hover:border-cyan-300/35 flex items-center justify-center mb-3 transition-all duration-500 group-hover:-translate-y-1 shadow-[0_0_20px_rgba(99,102,241,0.25)]">
                <Upload className="w-5 h-5 text-slate-200 group-hover:text-cyan-200 transition-colors" />
              </div>

              <span className="relative z-10 text-xs sm:text-[13px] font-medium text-white/95 tracking-wide leading-snug max-w-[130px]">
                Drop a track into the universe
              </span>
            </button>
          </div>

          {/* Secondary Hint */}
          <p className="mt-6 text-xs sm:text-sm text-slate-400/90 tracking-wide font-light">
            Choose an audio file from your device
          </p>
          <p className="mt-1.5 text-[11px] text-slate-500 tracking-wider uppercase">
            MP3 · WAV · FLAC · OGG · M4A — Processed 100% locally
          </p>

          {/* Error Banner if an unsupported or unreadable file was dropped */}
          {appState === 'error' && errorMessage && (
            <div
              role="alert"
              className="mt-6 max-w-md flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-950/50 backdrop-blur-xl border border-rose-400/30 text-rose-200 text-xs sm:text-sm shadow-2xl"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-left leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Optional Synthesized Cosmic Demo Track Launcher for instant exploration */}
          <div className="mt-8">
            <button
              type="button"
              onClick={handleLoadSynthesizedDemo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] hover:bg-white/[0.09] backdrop-blur-xl border border-white/[0.09] hover:border-indigo-400/35 text-xs text-slate-300 hover:text-white transition-all duration-300 shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Or experience a synthesized cosmic odyssey</span>
            </button>
          </div>
        </main>
      )}

      {/* ====================================================================
          STATE 2: LOADING STATE (While browser loads & decodes the audio file)
      ==================================================================== */}
      {appState === 'loading' && (
        <main className="relative z-10 flex flex-col items-center justify-center w-full h-full px-6 text-center fade-scale-in">
          <div className="relative w-28 h-28 flex items-center justify-center mb-6">
            <div className="absolute inset-0 rounded-full border border-white/10" />
            <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-cyan-400/80 animate-spin" />
            <div
              className="absolute inset-3 rounded-full border-b-2 border-l-2 border-violet-400/70 animate-spin"
              style={{ animationDirection: 'reverse', animationDuration: '1.8s' }}
            />
            <Disc className="w-6 h-6 text-cyan-200 animate-pulse" />
          </div>
          <p className="font-display text-sm tracking-[0.28em] uppercase text-white/90">
            Calibrating Harmonics
          </p>
          <p className="mt-2 text-xs text-slate-400 font-light tracking-wide">
            Mapping audio frequencies to your universe...
          </p>
        </main>
      )}

      {/* ====================================================================
          STATES 3, 4, 5, 6: FLOATING GLASSMORPHISM CONTROL DOCK
          (Ready, Playing, Paused, Ended)
      ==================================================================== */}
      {isTrackActive && (
        <div
          className={`fixed bottom-5 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 w-[94vw] max-w-3xl transition-all duration-500 ${zenMode
            ? 'opacity-0 translate-y-8 pointer-events-none'
            : 'opacity-100 translate-y-0 dock-animate-in'
            }`}
        >
          {/* Subtle "Ready for Launch" Prompt Pill when track is freshly uploaded & waiting for Play */}
          {appState === 'ready' && (
            <div className="flex justify-center mb-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-950/60 backdrop-blur-xl border border-indigo-400/30 text-indigo-200 text-xs tracking-wide shadow-lg">
                <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span>Track prepared in orbit — Press Play to awaken the universe</span>
              </div>
            </div>
          )}

          {/* Main Frosted Glass Control Dock */}
          <section
            aria-label="Music playback controls"
            className="relative rounded-3xl bg-slate-950/60 backdrop-blur-2xl border border-white/[0.13] shadow-[0_24px_80px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.14)] px-4 py-4 sm:px-7 sm:py-5"
          >
            {/* Top Row: Track Info Badge + Waveform Seek Bar + Timecode */}
            <div className="flex flex-col gap-3.5">
              {/* Track Metadata Header & Secondary Actions */}
              <div className="flex items-center justify-between gap-3">
                {/* Track Title & Audio File Indicator */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-cyan-500/15 to-violet-500/20 border border-white/15 flex items-center justify-center shrink-0 shadow-inner">
                    <Music className="w-4 h-4 text-cyan-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2
                        title={trackMeta?.title}
                        className="text-sm sm:text-[15px] font-medium text-white truncate tracking-wide"
                      >
                        {trackMeta?.title || 'Cosmic Audio Stream'}
                      </h2>
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-white/[0.07] border border-white/10 text-[10px] font-mono-tabular tracking-wider text-cyan-200/90 uppercase">
                        {trackMeta?.format || 'AUDIO'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400/90 tracking-wide truncate">
                      {appState === 'playing'
                        ? 'Synchronized with live spectral analysis'
                        : appState === 'ready'
                          ? 'Awaiting launch command'
                          : appState === 'ended'
                            ? 'Transmission complete — Ready to replay'
                            : 'Universe in gentle standby'}
                    </p>
                  </div>
                </div>

                {/* Timecode Display (Current / Total Duration) */}
                <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/[0.04] border border-white/[0.07] font-mono-tabular text-xs sm:text-[13px]">
                  <span className="text-cyan-200 font-medium">
                    {formatTime(
                      hoverSeekRatio !== null ? hoverSeekRatio * duration : currentTime
                    )}
                  </span>
                  <span className="text-slate-600">/</span>
                  <span className="text-slate-400">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Interactive Multi-Bar Waveform & Progress Scrubber */}
              <div
                ref={waveformContainerRef}
                role="slider"
                tabIndex={0}
                aria-label="Seek audio timeline"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                onPointerDown={(e) => {
                  const ratio = calculateRatioFromClientX(e.clientX);
                  setIsScrubbing(true);
                  setHoverSeekRatio(ratio);
                  seekToRatio(ratio);
                }}
                onPointerMove={(e) => {
                  const ratio = calculateRatioFromClientX(e.clientX);
                  setHoverSeekRatio(ratio);
                }}
                onPointerLeave={() => {
                  if (!isScrubbing) setHoverSeekRatio(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' && duration > 0) {
                    e.preventDefault();
                    seekToRatio((currentTime + 5) / duration);
                  } else if (e.key === 'ArrowLeft' && duration > 0) {
                    e.preventDefault();
                    seekToRatio((currentTime - 5) / duration);
                  }
                }}
                className="relative h-12 sm:h-14 flex items-center cursor-pointer group py-1.5 select-none focus:outline-none focus:ring-2 focus:ring-cyan-400/40 rounded-xl"
              >
                {/* Subtle horizontal baseline */}
                <div className="absolute inset-x-0 h-[1px] bg-white/[0.08] pointer-events-none" />

                {/* Waveform Bars */}
                <div className="relative w-full h-full flex items-center justify-between gap-[2px] sm:gap-[3px]">
                  {waveformBars.map((barPeak, idx) => {
                    const barRatio = idx / waveformBars.length;
                    const isPassed = barRatio <= activeRatio;
                    const isHovered =
                      hoverSeekRatio !== null && barRatio <= hoverSeekRatio;

                    return (
                      <div
                        key={idx}
                        className="flex-1 h-full flex items-center justify-center"
                      >
                        <div
                          className={`w-full rounded-full transition-colors duration-150 ${isPassed
                            ? 'bg-gradient-to-t from-indigo-400 via-cyan-300 to-white shadow-[0_0_8px_rgba(34,211,238,0.45)]'
                            : isHovered
                              ? 'bg-white/45'
                              : 'bg-white/15 group-hover:bg-white/25'
                            }`}
                          style={{
                            height: `${Math.max(14, Math.round(barPeak * 100))}%`
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Hover Timecode Pill Indicator */}
                {hoverSeekRatio !== null && duration > 0 && (
                  <div
                    className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900/95 border border-white/15 text-[10px] font-mono-tabular text-cyan-200 pointer-events-none shadow-lg"
                    style={{ left: `${Math.max(4, Math.min(96, hoverSeekRatio * 100))}%` }}
                  >
                    {formatTime(hoverSeekRatio * duration)}
                  </div>
                )}
              </div>

              {/* Bottom Controls Row: Volume (Left) · Primary Play/Pause/Replay (Center) · Reupload & Discard (Right) */}
              <div className="flex items-center justify-between gap-2 pt-1">
                {/* Left: Volume Control with Mute/Unmute & Slider */}
                <div className="flex items-center gap-2 sm:w-44">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    aria-label={isMuted || volume === 0 ? 'Unmute audio' : 'Mute audio'}
                    title={isMuted || volume === 0 ? 'Unmute (M)' : 'Mute (M)'}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-rose-300" />
                    ) : volume < 0.5 ? (
                      <Volume1 className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    aria-label="Volume level"
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-20 sm:w-28 h-1.5 rounded-lg appearance-none bg-white/15 accent-cyan-300 cursor-pointer focus:outline-none"
                  />
                </div>

                {/* Center: Prominent Play / Pause / Replay Orb Button */}
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    aria-label={
                      appState === 'playing'
                        ? 'Pause track'
                        : appState === 'ended'
                          ? 'Replay track'
                          : 'Play track'
                    }
                    className="relative group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-indigo-500/80 via-cyan-500/75 to-violet-600/80 hover:from-indigo-400 hover:via-cyan-400 hover:to-violet-500 text-white border border-white/30 shadow-[0_0_32px_rgba(34,211,238,0.38)] hover:shadow-[0_0_45px_rgba(34,211,238,0.65)] transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 cursor-pointer"
                  >
                    {appState === 'playing' ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : appState === 'ended' ? (
                      <RotateCcw className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Right: Reupload & Discard Track Actions with Unobtrusive Tooltips */}
                <div className="flex items-center justify-end gap-2 sm:w-44">
                  {/* Reupload Button */}
                  <button
                    type="button"
                    onClick={handleOpenFileDialog}
                    aria-label="Reupload a different track"
                    title="Reupload different track"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.09] hover:border-white/20 text-xs text-slate-200 hover:text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-300" />
                    <span className="hidden sm:inline">Reupload</span>
                  </button>

                  {/* Discard Button */}
                  <button
                    type="button"
                    onClick={handleDiscardTrack}
                    aria-label="Discard current track and return to upload portal"
                    title="Discard track"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.09] hover:border-rose-400/35 text-xs text-slate-300 hover:text-rose-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-400/50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Discard</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ====================================================================
          LUMINOUS FULL-SCREEN DRAG-AND-DROP PORTAL OVERLAY
      ==================================================================== */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-6 pointer-events-none fade-scale-in">
          <div className="w-full h-full max-w-5xl max-h-[82vh] rounded-[2.5rem] border-2 border-dashed border-cyan-300/60 bg-gradient-to-b from-indigo-500/10 via-cyan-500/10 to-violet-500/10 shadow-[0_0_120px_rgba(34,211,238,0.25),inset_0_0_80px_rgba(99,102,241,0.2)] flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-cyan-400/15 border border-cyan-300/40 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(34,211,238,0.4)] animate-bounce">
              <Upload className="w-8 h-8 text-cyan-200" />
            </div>
            <p className="font-display text-lg sm:text-2xl tracking-[0.28em] uppercase text-white">
              Release to Enter Orbit
            </p>
            <p className="mt-2 text-sm text-cyan-200/80 font-light tracking-wide">
              Drop your audio file anywhere into the COSMOS portal
            </p>
          </div>
        </div>
      )}
    </div>
  );
}