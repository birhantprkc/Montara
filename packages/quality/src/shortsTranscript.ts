// @montara/quality - transcript-aware Shorts cut gates.

import type { Caption, ShortCut } from "../../render-ffmpeg/src/index";

export interface TranscriptShortCutCheck {
  index: number;
  ok: boolean;
  startDeltaSec: number;
  endDeltaSec: number;
  detail: string;
}

export interface TranscriptShortGate {
  ok: boolean;
  blockers: string[];
  cuts: TranscriptShortCutCheck[];
}

function nearestDelta(value: number, candidates: number[]): number {
  if (!candidates.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates.map((candidate) => Math.abs(candidate - value)));
}

function cleanCaption(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function verifyShortCutsAgainstTranscript(
  cuts: ShortCut[],
  transcript: Caption[],
  opts: { toleranceSec?: number } = {},
): TranscriptShortGate {
  const toleranceSec = Math.max(0, opts.toleranceSec ?? 0.18);
  const blockers: string[] = [];
  const starts = transcript.map((caption) => caption.startSec);
  const ends = transcript.map((caption) => caption.endSec);

  if (cuts.length > 0 && transcript.length === 0) {
    blockers.push("short cuts require transcript captions for boundary proof");
  }

  const cutChecks = cuts.map((cut, index) => {
    const duration = cut.endSec - cut.startSec;
    const startDeltaSec = nearestDelta(cut.startSec, starts);
    const endDeltaSec = nearestDelta(cut.endSec, ends);
    const ok = duration > 0 && startDeltaSec <= toleranceSec && endDeltaSec <= toleranceSec;
    if (!ok) {
      blockers.push(
        `cut-${index + 1}: start/end must land on transcript boundaries within ${toleranceSec.toFixed(2)}s`,
      );
    }
    return {
      index,
      ok,
      startDeltaSec: Number.isFinite(startDeltaSec) ? startDeltaSec : -1,
      endDeltaSec: Number.isFinite(endDeltaSec) ? endDeltaSec : -1,
      detail: ok ? "transcript boundary verified" : `duration=${duration.toFixed(2)}s`,
    };
  });

  return {
    ok: blockers.length === 0,
    blockers,
    cuts: cutChecks,
  };
}

export function suggestTranscriptShortCuts(
  transcript: Caption[],
  opts: { maxCuts?: number; minDurationSec?: number; maxDurationSec?: number } = {},
): ShortCut[] {
  const maxCuts = Math.max(1, opts.maxCuts ?? 3);
  const minDurationSec = Math.max(0.5, opts.minDurationSec ?? 1.0);
  const maxDurationSec = Math.max(minDurationSec, opts.maxDurationSec ?? 60);
  const cuts: ShortCut[] = [];
  for (const caption of transcript) {
    if (cuts.length >= maxCuts) break;
    const duration = caption.endSec - caption.startSec;
    if (duration < minDurationSec) continue;
    const endSec = Math.min(caption.endSec, caption.startSec + maxDurationSec);
    cuts.push({
      startSec: caption.startSec,
      endSec,
      caption: cleanCaption(caption.text).slice(0, 80),
    });
  }
  return cuts;
}
