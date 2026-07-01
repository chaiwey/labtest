// Voice input is now cloud STT: the browser records a short clip with
// MediaRecorder and posts it to /api/transcribe, which runs Groq's hosted
// Whisper. This replaces the on-device Web Speech API (Chrome/Edge only) with
// something that works in any browser that can record audio, and is far more
// accurate on rack slot ids. TTS (speak) stays on-device — see bottom.
//
// The startListening() signature is unchanged so callers (VoiceButton) keep
// working; the difference is that the transcript now arrives asynchronously
// after stop(), once Whisper responds.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** True if this browser can record audio (getUserMedia + MediaRecorder). */
export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface Listener {
  stop: () => void;
}

export interface ListenOptions {
  // Kept for source-compat with the old Web Speech API. No longer used —
  // recording always runs until stop() (or autoStop) fires.
  continuous?: boolean;
  // Live partial transcript while speaking. Whisper is batch-only (no streaming),
  // so this is a best-effort preview powered by the browser's on-device
  // SpeechRecognition when available; the authoritative text still comes from
  // Whisper via onResult. Silently absent in browsers without SpeechRecognition.
  onInterim?: (transcript: string) => void;
  // Lifecycle for UI: "recording" once the mic is live, "transcribing" once the
  // clip has been sent to Whisper and we're awaiting the text.
  onStatus?: (status: "recording" | "transcribing") => void;
  // Hands-free stop: end the recording automatically after the speaker falls
  // silent (silenceMs) or a hard cap (maxMs) is hit. Required for the yes/no
  // confirmation flow, where nobody is holding a key to release. Omit for
  // push-to-talk (the caller drives stop()).
  autoStop?: { silenceMs?: number; maxMs?: number };
}

// Prefer webm/opus (small, well supported by Whisper); fall back as needed.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

async function transcribe(blob: Blob): Promise<string> {
  const ext = extensionFor(blob.type || "audio/webm");
  const form = new FormData();
  form.append("audio", blob, `recording.${ext}`);

  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as
    | { text?: string; error?: string }
    | null;
  if (!res.ok) {
    throw new Error(data?.error || "Transcription failed.");
  }
  return (data?.text ?? "").trim();
}

function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it in your browser settings.";
  }
  if (name === "NotFoundError") return "No microphone was found.";
  return "Could not start the microphone.";
}

/**
 * Best-effort live preview using the browser's on-device SpeechRecognition,
 * running alongside the Whisper recording purely to show words as they're
 * spoken. Never throws; returns a stop() that's safe to call anytime. If the
 * browser has no SpeechRecognition it's a silent no-op.
 */
function startInterim(onInterim: (t: string) => void): { stop: () => void } {
  try {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return { stop: () => {} };
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += `${res[0].transcript} `;
        else interim += res[0].transcript;
      }
      onInterim(`${finalText}${interim}`.trim());
    };
    rec.onerror = () => {}; // preview only — swallow, Whisper is the real result
    rec.start();
    return {
      stop: () => {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  } catch {
    return { stop: () => {} };
  }
}

/**
 * Watch a live mic stream and invoke onSilence() once the speaker has spoken
 * and then gone quiet for silenceMs, or maxMs elapses regardless. Returns a
 * teardown that stops watching and frees the AudioContext.
 */
function watchForSilence(
  stream: MediaStream,
  silenceMs: number,
  maxMs: number,
  onSilence: () => void,
): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const teardown = () => {
    if (timer) clearInterval(timer);
    timer = null;
    ctx?.close().catch(() => {});
    ctx = null;
  };

  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctx();
    const source = ctx!.createMediaStreamSource(stream);
    const analyser = ctx!.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const start = Date.now();
    let hasSpoken = false;
    let lastLoud = start;
    const SPEECH_RMS = 0.025; // normalized RMS above ambient noise

    timer = setInterval(() => {
      if (stopped) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > SPEECH_RMS) {
        hasSpoken = true;
        lastLoud = now;
      }
      const silentLongEnough = hasSpoken && now - lastLoud > silenceMs;
      const cappedOut = now - start > maxMs;
      if (silentLongEnough || cappedOut) {
        stopped = true;
        teardown();
        onSilence();
      }
    }, 100);
  } catch {
    // No Web Audio — fall back to a plain max-duration cap.
    timer = setInterval(() => {
      if (stopped) return;
      stopped = true;
      teardown();
      onSilence();
    }, maxMs);
  }

  return () => {
    stopped = true;
    teardown();
  };
}

/**
 * Record audio until stop(), then transcribe it with Groq Whisper and deliver
 * the final text via onResult. onError fires for mic or network failures;
 * onEnd always fires once, after the result (or error) is settled. Returns a
 * handle whose stop() ends the recording and kicks off transcription.
 */
export function startListening(
  onResult: (transcript: string) => void,
  onError?: (message: string) => void,
  onEnd?: () => void,
  opts?: ListenOptions,
): Listener {
  if (!speechSupported()) {
    onError?.("Voice recording is not supported in this browser.");
    onEnd?.();
    return { stop: () => {} };
  }

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let stopRequested = false;
  let finished = false;
  const chunks: BlobPart[] = [];
  let interim: { stop: () => void } | null = null;
  let stopSilenceWatch: (() => void) | null = null;

  const stopRecording = () => {
    stopSilenceWatch?.();
    stopSilenceWatch = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };
  const releaseMic = () => {
    interim?.stop();
    interim = null;
    stopSilenceWatch?.();
    stopSilenceWatch = null;
    stream?.getTracks().forEach((t) => t.stop());
  };

  const finish = (fn: () => void) => {
    if (finished) return;
    finished = true;
    fn();
    onEnd?.();
  };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        releaseMic();
        const blob = new Blob(chunks, {
          type: recorder?.mimeType || "audio/webm",
        });
        if (blob.size === 0) {
          finish(() => onResult("")); // nothing captured (e.g. instant release)
          return;
        }
        opts?.onStatus?.("transcribing");
        try {
          const text = await transcribe(blob);
          finish(() => onResult(text));
        } catch (err) {
          finish(() => {
            onError?.(err instanceof Error ? err.message : "Transcription failed.");
            onResult("");
          });
        }
      };

      recorder.start();
      opts?.onStatus?.("recording");

      // Optional live preview alongside the Whisper recording.
      if (opts?.onInterim) interim = startInterim(opts.onInterim);

      // Hands-free auto-stop (confirmation flow). Push-to-talk omits this and
      // drives stop() from the returned handle instead.
      if (opts?.autoStop) {
        stopSilenceWatch = watchForSilence(
          stream,
          opts.autoStop.silenceMs ?? 1200,
          opts.autoStop.maxMs ?? 8000,
          stopRecording,
        );
      }

      // stop() may have been called while we were awaiting mic permission.
      if (stopRequested && recorder.state !== "inactive") recorder.stop();
    } catch (err) {
      releaseMic();
      finish(() => onError?.(micErrorMessage(err)));
    }
  })();

  return {
    stop: () => {
      stopRequested = true;
      stopRecording();
    },
  };
}

/** Speak text aloud, then call onDone when finished. Safe no-op if unsupported. */
export function speak(text: string, onDone?: () => void) {
  if (!ttsSupported()) {
    onDone?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel(); // stop anything in progress
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 1;
  if (onDone) {
    utter.onend = () => onDone();
    utter.onerror = () => onDone();
  }
  synth.speak(utter);
}
