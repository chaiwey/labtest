"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speechSupported, startListening, type Listener } from "@/lib/voice/speech";

interface Props {
  onTranscript: (transcript: string) => void;
  message?: string | null;
}

export function VoiceButton({ onTranscript, message }: Props) {
  const [listening, setListening] = useState(false);
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
        listeningRef.current = false;
      },
      // continuous so a pause between "slot B3" and the label won't cut it off.
      { continuous: true, onInterim: (t) => setTranscript(t) },
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
              : "brand-gradient hover:scale-105 hover:opacity-90",
          ].join(" ")}
          title={listening ? "Stop" : "Click to toggle, or hold Space to talk"}
        >
          {listening && (
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400/60" />
          )}
          <MicIcon />
        </button>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            {listening ? "Listening…" : "Voice control"}
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
          Voice input isn’t supported here — use Chrome or Edge. You can still edit
          slots manually below.
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
