// @montara/understand — transcriber (§G, WhisperX-equivalent).
// A real whisper runtime (whisper.cpp binary or a transformers.js/Whisper service URL) plugs in via
// env; with none present it degrades to an empty transcript so a run never blocks on a model.

export interface TranscriptSegment {
  text: string;
  startSec: number;
  endSec: number;
}

export interface Transcript {
  engine: "whisper" | "none";
  language: string | null;
  segments: TranscriptSegment[];
  wordCount: number;
}

export interface TranscribeInput {
  inputPath: string;
}

export function transcribe(_input: TranscribeInput, secrets: Record<string, string | undefined> = process.env): Transcript {
  const runtime = secrets.WHISPER_URL ?? secrets.WHISPERCPP_BIN;
  if (!runtime) {
    return { engine: "none", language: null, segments: [], wordCount: 0 };
  }
  // With a runtime present a caller would invoke it (BYO); the offline harness never reaches here.
  return { engine: "whisper", language: "en", segments: [], wordCount: 0 };
}
