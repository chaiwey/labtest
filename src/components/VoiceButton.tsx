"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechSupported, startListening, type Listener } from "@/lib/voice/speech";

interface Props {
  onTranscript: (transcript: string) => void;
  message?: string | null;
  // Field names the voice command understands, in positional order (Label
  // first). Shown as a reference so the user knows the exact names to say.
  fields?: string[];
}

export function VoiceButton({ onTranscript, message, fields }: Props) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const handle = useRef<Listener | null>(null);
  const listeningRef = useRef(false);

  // Keep the latest callback reachable from event listeners without re-binding.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(speechSupported());
  }, []);

  // Stable across renders: only touches refs and stable state setters.
  const start = useCallback(() => {
    if (listeningRef.current || !speechSupported()) return;
    setError(null);
    setTranscript("");
    setListening(true);
    listeningRef.current = true;
    handle.current = startListening(
      (t) => {
        setTranscript(t);
        if (t) onTranscriptRef.current(t);
      },
      (msg) => setError(msg),
      () => {
        setListening(false);
        setTranscribing(false);
        listeningRef.current = false;
      },
      {
        // Live preview while speaking (best-effort; Whisper gives the final text).
        onInterim: (t) => setTranscript(t),
        // Whisper transcribes after the clip is sent; reflect that in the UI.
        // Once recording stops we're no longer "listening", we're waiting on text.
        onStatus: (s) => {
          if (s === "transcribing") {
            setListening(false);
            setTranscribing(true);
          }
        },
      },
    );
  }, []);

  const stop = useCallback(() => {
    handle.current?.stop();
  }, []);

  function toggle() {
    if (listeningRef.current) stop();
    else start();
  }

  // Push-to-talk: hold Space to record, release to process. Ignored while typing
  // in a field so labels can still contain spaces.
  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable
      );
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTyping(e.target)) return;
      e.preventDefault(); // stop page scroll
      if (e.repeat) return; // key auto-repeat while held
      start();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      stop();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [start, stop]);

  return (
    <div className="animate-fade-up rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          disabled={!supported}
          aria-pressed={listening}
          className={[
            "relative grid h-14 w-14 shrink-0 place-items-center rounded-full text-white shadow-soft transition active:scale-95 disabled:opacity-40 motion-reduce:transform-none",
            listening
              ? "bg-red-500 shadow-lg shadow-red-500/30"
              : transcribing
                ? "bg-accent-blue shadow-lg shadow-accent-blue/30"
                : "brand-gradient hover:scale-105 hover:opacity-90",
          ].join(" ")}
          title={listening ? "Stop" : "Click to toggle, or hold Space to talk"}
        >
          {listening && (
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400/60" />
          )}
          {transcribing && (
            <span className="absolute inset-0 animate-pulse rounded-full bg-accent-blue/50" />
          )}
          <MicIcon />
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            {listening
              ? "Listening…"
              : transcribing
                ? "Transcribing…"
                : "Voice control"}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            Hold{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
              Space
            </kbd>{" "}
            to talk (or click the mic). Say{" "}
            <span className="text-slate-700">“Slot A3, label control sample”</span> or{" "}
            <span className="text-slate-700">“what is in slot B3”</span>.
          </p>
        </div>
      </div>

      {fields && fields.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Your fields — say the name, any order (bare values fill in this order)
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fields.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
              >
                <span className="text-slate-400">{i + 1}</span>
                <span className="font-medium text-slate-700">{name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {transcript && (
        <p className="mt-3 animate-fade-up text-sm text-slate-400">
          Heard: <span className="text-slate-600">“{transcript}”</span>
        </p>
      )}
      {message && (
        <p className="mt-2 rounded-lg bg-accent-blue/10 px-3 py-2 text-sm text-accent-blue">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
      {!supported && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-600">
          Voice input needs microphone recording, which isn’t available in this
          browser. You can still edit slots manually below.
        </p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
