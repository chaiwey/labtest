// Server-side speech-to-text via Groq's hosted Whisper. The browser records a
// short audio clip and POSTs it here as multipart form-data; we forward it to
// Groq and return the plain transcript. The GROQ_API_KEY never leaves the
// server. See src/lib/voice/speech.ts for the client half.

import { NextResponse } from "next/server";

export const runtime = "nodejs"; // needs Node's fetch/FormData/Blob, not edge

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
// Fast, accurate, cheap. Override with GROQ_STT_MODEL if desired.
const MODEL = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";

// Domain prompt biases Whisper toward the rack vocabulary (slot ids, commands),
// which measurably improves letter/digit recognition for our use case.
const PROMPT =
  "Lab rack slot dictation. Slots are a letter and a number like A3, B12, Z9. " +
  "Commands include: slot, label, what is in, clear.";

// Cap upload size so a stuck recorder can't post a huge blob. ~25 MB is well
// above any hold-to-talk clip.
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is not configured (missing GROQ_API_KEY)." },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No audio provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Audio clip too large." }, { status: 413 });
  }

  const groqForm = new FormData();
  groqForm.append("file", file, file.name || "audio.webm");
  groqForm.append("model", MODEL);
  groqForm.append("language", "en");
  groqForm.append("temperature", "0");
  groqForm.append("response_format", "json");
  groqForm.append("prompt", PROMPT);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the transcription service." },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Don't leak Groq internals to the client; log for the operator.
    console.error(`Groq transcription failed (${res.status}): ${detail}`);
    return NextResponse.json(
      { error: "Transcription failed." },
      { status: 502 },
    );
  }

  const data = (await res.json().catch(() => null)) as { text?: string } | null;
  return NextResponse.json({ text: (data?.text ?? "").trim() });
}
