import { useCallback, useEffect, useRef, useState } from "react";

interface AudioState {
  isActive: boolean;
  volume: number;
  frequency: number;
  isProcessing: boolean;
}

export function useAudioAnalyzer() {
  const [state, setState] = useState<AudioState>({
    isActive: false,
    volume: 0,
    frequency: 0,
    isProcessing: false,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const analyze = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    analyser.getByteFrequencyData(dataArray);

    let sum = 0, maxIndex = 0, maxValue = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
      if (dataArray[i] > maxValue) { maxValue = dataArray[i]; maxIndex = i; }
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const normalizedVolume = Math.min(rms / 128, 1);
    const normalizedFrequency = maxIndex / dataArray.length;

    setState((prev) => {
      if (normalizedVolume < 0.05 && prev.volume > 0.05) {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          setState((p) => ({ ...p, isProcessing: true }));
          setTimeout(() => { setState((p) => ({ ...p, isProcessing: false })); }, 2000);
        }, 800);
      }
      return { ...prev, volume: normalizedVolume, frequency: normalizedFrequency };
    });
    animFrameRef.current = requestAnimationFrame(analyze);
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      streamRef.current = stream;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      setState({ isActive: true, volume: 0, frequency: 0, isProcessing: false });
      animFrameRef.current = requestAnimationFrame(analyze);
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
    }
  }, [analyze]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    sourceRef.current?.disconnect();
    audioContextRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    dataArrayRef.current = null;
    setState({ isActive: false, volume: 0, frequency: 0, isProcessing: false });
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      audioContextRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { ...state, start, stop };
}
