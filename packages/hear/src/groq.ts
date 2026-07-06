// Groq Whisper cloud STT when GROQ_API_KEY is set (free tier friendly).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
export interface GroqTranscriptSegment { start: number; end: number; text: string }
export interface GroqTranscript { language: string; duration: number; segments: GroqTranscriptSegment[] }

export function groqTranscribeAvailable(secrets: Record<string, string | undefined> = process.env): boolean {
  return Boolean(secrets.GROQ_API_KEY?.trim());
}

/** Transcribe via Groq OpenAI-compatible Whisper endpoint (sync curl, no extra deps). */
export function groqTranscribe(
  media: string,
  secrets: Record<string, string | undefined> = process.env,
): GroqTranscript | null {
  const apiKey = secrets.GROQ_API_KEY?.trim();
  if (!apiKey || !existsSync(media)) return null;

  const model = secrets.GROQ_WHISPER_MODEL?.trim() || "whisper-large-v3-turbo";
  const args = [
    "-sS",
    "https://api.groq.com/openai/v1/audio/transcriptions",
    "-H",
    `Authorization: Bearer ${apiKey}`,
    "-F",
    `file=@${media}`,
    "-F",
    `model=${model}`,
    "-F",
    "response_format=verbose_json",
    "-F",
    "temperature=0",
  ];

  const r = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 1 << 26, timeout: 300_000 });
  if (r.status !== 0) return null;

  try {
    const j = JSON.parse(r.stdout || "{}") as {
      language?: string;
      duration?: number;
      segments?: { start: number; end: number; text: string }[];
      text?: string;
    };
    const segments: GroqTranscriptSegment[] = Array.isArray(j.segments)
      ? j.segments
          .filter((s) => s.text?.trim())
          .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
      : j.text?.trim()
        ? [{ start: 0, end: j.duration ?? 0, text: j.text.trim() }]
        : [];
    if (!segments.length) return null;
    return {
      language: j.language ?? "en",
      duration: j.duration ?? segments[segments.length - 1]!.end,
      segments,
    };
  } catch {
    return null;
  }
}

/** Extract audio to wav for Groq if input is video (ffmpeg). */
export function mediaForGroq(media: string, workDir: string): string {
  if (/\.(wav|mp3|m4a|flac|ogg)$/i.test(media)) return media;
  const out = `${workDir}/groq-audio.wav`;
  const ff = spawnSync("ffmpeg", ["-y", "-i", media, "-vn", "-ac", "1", "-ar", "16000", out], { encoding: "utf8" });
  return ff.status === 0 && existsSync(out) ? out : media;
}
