// Grabación de audio del micrófono con MediaRecorder, en un formato comprimido que el navegador soporte
// (Chrome/Firefox: webm/opus; Safari: mp4/aac). Opcionalmente se detiene sola tras un silencio (detección
// de voz sencilla por nivel de señal), para el asistente de chat por voz.

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export const canRecordAudio = () =>
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined";

export const pickAudioMimeType = () =>
    PREFERRED_TYPES.find((type) => {
        try {
            return MediaRecorder.isTypeSupported(type);
        } catch {
            return false;
        }
    }) ?? "";

export interface RecordingOptions {
    // se detiene sola tras este silencio (ms) después de haber oído voz; 0 = solo al llamar a stop()
    stopAfterSilenceMs?: number;
    // si no se oye voz en este tiempo se detiene y no devuelve audio
    noSpeechTimeoutMs?: number;
    maxDurationMs?: number;
    // nivel RMS (0..1) a partir del cual se considera voz
    speechThreshold?: number;
    // nivel actual de la señal (0..1), para un indicador
    onLevel?: (level: number) => void;
    // si es true (por defecto), una grabación en la que no se oyó voz no devuelve audio
    requireSpeech?: boolean;
    // una vez oída voz, cada 100 ms: milisegundos de silencio desde la última voz (0 mientras se habla), para
    // mostrar cuánto falta para que se detenga sola
    onSilence?: (silentMs: number) => void;
    // micrófono ya abierto (getUserMedia) para empezar sin esperas; no se cierra al terminar la grabación
    stream?: MediaStream;
}

// abre el micrófono con los ajustes de la grabación
export const openMicrophone = () =>
    navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

export interface Recording {
    // detiene y devuelve el audio (null si se detuvo sin oír voz o se canceló)
    stop(): Promise<Blob | null>;
    cancel(): void;
    // se resuelve cuando la grabación termina (sola o con stop)
    finished: Promise<Blob | null>;
    // el audio grabado hasta ahora (null si aún no hay nada), para transcribirlo mientras se habla
    snapshot(): Blob | null;
}

export const startRecording = async (options: RecordingOptions = {}): Promise<Recording> => {
    const {
        stopAfterSilenceMs = 0,
        noSpeechTimeoutMs = 0,
        maxDurationMs = 60_000,
        speechThreshold = 0.035,
        onLevel,
        requireSpeech = true,
        onSilence,
    } = options;

    const ownStream = !options.stream;
    const stream = options.stream ?? (await openMicrophone());
    const mimeType = pickAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
    };

    // nivel de la señal para la detección de voz
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = AudioCtx ? new AudioCtx() : null;
    const analyser = audioContext?.createAnalyser();
    if (audioContext && analyser) {
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(stream).connect(analyser);
    }
    const samples = new Float32Array(analyser?.fftSize ?? 0);

    let heardSpeech = false;
    let cancelled = false;
    let lastVoiceAt = performance.now();
    const startedAt = performance.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    let resolveFinished!: (blob: Blob | null) => void;
    const finished = new Promise<Blob | null>((resolve) => (resolveFinished = resolve));

    const cleanup = () => {
        if (timer) clearInterval(timer);
        timer = null;
        if (ownStream) stream.getTracks().forEach((track) => track.stop());
        audioContext?.close().catch(() => undefined);
    };

    recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        resolveFinished(cancelled || blob.size === 0 || (requireSpeech && !heardSpeech) ? null : blob);
    };

    const stopRecorder = () => {
        if (recorder.state !== "inactive") recorder.stop();
    };

    recorder.start(250);

    timer = setInterval(() => {
        const now = performance.now();
        if (analyser) {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) sum += sample * sample;
            const level = Math.sqrt(sum / samples.length);
            onLevel?.(Math.min(1, level * 6));
            if (level > speechThreshold) {
                heardSpeech = true;
                lastVoiceAt = now;
            }
        } else {
            // sin analizador no se puede detectar el silencio: se da por oída la voz
            heardSpeech = true;
        }
        if (heardSpeech) onSilence?.(now - lastVoiceAt);
        if (now - startedAt > maxDurationMs) stopRecorder();
        else if (stopAfterSilenceMs > 0 && heardSpeech && now - lastVoiceAt > stopAfterSilenceMs) stopRecorder();
        else if (noSpeechTimeoutMs > 0 && !heardSpeech && now - startedAt > noSpeechTimeoutMs) stopRecorder();
    }, 100);

    return {
        stop() {
            stopRecorder();
            return finished;
        },
        cancel() {
            cancelled = true;
            stopRecorder();
        },
        finished,
        snapshot() {
            return chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }) : null;
        },
    };
};