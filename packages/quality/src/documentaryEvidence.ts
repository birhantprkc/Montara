// @montara/quality - documentary evidence gates.
// These checks turn the documentary craft rules into deterministic blockers and warnings.

export type ClaimConfidence =
  | "source-backed"
  | "reported"
  | "estimated"
  | "disputed"
  | "illustrative";

export interface DocumentaryClaim {
  id?: string;
  text: string;
  sceneId?: string;
  sourceUrl?: string;
  confidence?: ClaimConfidence;
  visual?: "text" | "map" | "chart" | "caption" | "thumbnail";
  precision?: "exact" | "approximate" | "illustrative";
}

export interface DocumentaryMapCue {
  id?: string;
  sceneId?: string;
  label?: string;
  hasSourceData: boolean;
  precision: "exact" | "approximate" | "illustrative";
}

export interface DocumentaryMusicCue {
  sceneId: string;
  startSec: number;
  endSec: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  gainDb?: number;
  silenceBeforeSec?: number;
}

export interface DocumentaryEvidenceGateInput {
  claims?: DocumentaryClaim[];
  maps?: DocumentaryMapCue[];
  musicCues?: DocumentaryMusicCue[];
  coldOpenMoves?: boolean;
  transcriptCutVerified?: boolean;
}

export interface DocumentaryEvidenceCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface DocumentaryEvidenceGate {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  checks: DocumentaryEvidenceCheck[];
}

function claimLabel(claim: DocumentaryClaim, index: number): string {
  return claim.id ?? claim.sceneId ?? `claim-${index + 1}`;
}

function mapLabel(map: DocumentaryMapCue, index: number): string {
  return map.id ?? map.sceneId ?? map.label ?? `map-${index + 1}`;
}

export function documentaryEvidenceGate(input: DocumentaryEvidenceGateInput): DocumentaryEvidenceGate {
  const claims = input.claims ?? [];
  const maps = input.maps ?? [];
  const musicCues = input.musicCues ?? [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checks: DocumentaryEvidenceCheck[] = [];

  let sourcedClaims = true;
  claims.forEach((claim, index) => {
    const label = claimLabel(claim, index);
    const hasSource = Boolean(claim.sourceUrl?.trim());
    const hasHonestLabel = Boolean(claim.confidence && claim.confidence !== "source-backed");
    const ok = hasSource || hasHonestLabel;
    if (!ok) blockers.push(`${label}: claim needs a source URL or an explicit confidence label`);
    if (claim.confidence === "source-backed" && !hasSource) {
      blockers.push(`${label}: source-backed claim is missing sourceUrl`);
      sourcedClaims = false;
    }
    sourcedClaims = sourcedClaims && ok;
  });
  checks.push({
    id: "source-backed-claims",
    ok: sourcedClaims,
    detail: claims.length ? `${claims.length} claim(s) checked` : "no explicit claims supplied",
  });

  let honestMaps = true;
  maps.forEach((map, index) => {
    const label = mapLabel(map, index);
    if (map.precision !== "illustrative" && !map.hasSourceData) {
      blockers.push(`${label}: ${map.precision} map needs source data`);
      honestMaps = false;
    } else if (map.precision === "illustrative" && !map.hasSourceData) {
      warnings.push(`${label}: illustrative map is allowed, but must be labelled as illustrative on-screen`);
    }
  });
  checks.push({
    id: "honest-maps",
    ok: honestMaps,
    detail: maps.length ? `${maps.length} map cue(s) checked` : "no maps supplied",
  });

  const invalidMusic = musicCues.filter((cue) => {
    const duration = cue.endSec - cue.startSec;
    return duration <= 0 || cue.fadeInSec == null || cue.fadeOutSec == null || cue.gainDb == null;
  });
  if (musicCues.length === 0) {
    warnings.push("documentary score has no scene-mapped music cues");
  } else if (invalidMusic.length > 0) {
    warnings.push(`${invalidMusic.length} music cue(s) lack duration, fades, or gain`);
  }
  checks.push({
    id: "scene-mapped-score",
    ok: invalidMusic.length === 0,
    detail: musicCues.length ? `${musicCues.length} cue(s) checked` : "no cues supplied",
  });

  if (input.coldOpenMoves === false) warnings.push("cold open is marked static; frame 1 should move");
  checks.push({
    id: "moving-cold-open",
    ok: input.coldOpenMoves !== false,
    detail: input.coldOpenMoves === false ? "static cold open" : "moving or unspecified cold open",
  });

  if (input.transcriptCutVerified === false) warnings.push("short-form cuts were not verified against transcript boundaries");
  checks.push({
    id: "transcript-cut-proof",
    ok: input.transcriptCutVerified !== false,
    detail: input.transcriptCutVerified === false ? "not verified" : "verified or not applicable",
  });

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    checks,
  };
}
