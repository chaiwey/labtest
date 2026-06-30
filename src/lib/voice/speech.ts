// Thin wrappers over the browser Web Speech API. Client-only. No external service —
// recognition and synthesis run on-device (Chrome/Edge have the best support).

/* eslint-disable @typescript-eslint/no-explicit-any */

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
  );
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface Listener {
  stop: () => void;
}

export interface ListenOptions {
  // continuous keeps the mic open through pauses (used for hold-to-talk so a gap
  // between "slot B3" and the label doesn't cut the recording short).
  continuous?: boolean;
  // live partial transcript for display while speaking.
  onInterim?: (transcript: string) => void;
}

/**
 * Listen and return the accumulated final transcript via onResult when the
 * recognition ends (on stop() in continuous mode, or after the utterance in
 * single-shot mode). Returns a handle so the caller can stop early.
 */
export function startListening(
  onResult: (transcript: string) => void,
  onError?: (message: string) => void,
  onEnd?: () => void,
  opts?: ListenOptions,
): Listener {
  if (!speechSupported()) {
    onError?.("Voice input is not supported in this browser. Try Chrome or Edge.");
    onEnd?.();
    return { stop: () => {} };
  }
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = opts?.continuous ?? false;

  let finalText = "";
  recognition.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) finalText += `${res[0].transcript} `;
      else interim += res[0].transcript;
    }
    opts?.onInterim?.(`${finalText}${interim}`.trim());
  };
  recognition.onerror = (event: any) => {
    if (event?.error === "no-speech" || event?.error === "aborted") return;
    onError?.(event?.error ? `Microphone error: ${event.error}` : "Microphone error");
  };
  recognition.onend = () => {
    onResult(finalText.trim());
    onEnd?.();
  };

  recognition.start();
  return { stop: () => recognition.stop() };
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
