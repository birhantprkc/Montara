// @montara/quality — slideshow-risk scorer over a scene plan.
// Scores a video plan across 6 dimensions that reliably predict whether the
// output will feel like a slideshow rather than directed video. Each dimension
// is 0-5 (lower is better).
//
//   repetition: same layouts/backgrounds/scene grammar recurring
//   decorative_visuals: scenes decorate instead of communicate
//   weak_motion: motion exists but has no narrative purpose
//   weak_shot_intent: no explicit reason for framing or reveal rhythm
//   typography_overreliance: too much of the video is text-first
//   unsupported_cinematic_claims: cinematic label without structure
//
// Verdict:  < 2.0 strong · < 3.0 acceptable · < 4.0 revise · >= 4.0 fail

export type Scene = Record<string, unknown>;
export type SlideshowVerdict = "strong" | "acceptable" | "revise" | "fail";

export interface SlideshowDimension {
  score: number;
  reason: string;
}

export interface SlideshowRiskReport {
  average: number;
  verdict: SlideshowVerdict;
  dimensions: Record<string, SlideshowDimension>;
  render_runtime: string | null;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function getStr(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

function shotLanguage(scene: Scene): Record<string, unknown> {
  const sl = scene.shot_language;
  return sl !== null && typeof sl === "object" && !Array.isArray(sl) ? (sl as Record<string, unknown>) : {};
}

/** First (key, count) at the maximum count, ties broken by first-seen order. */
function counterMostCommon(items: string[]): [string, number] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let bestKey = "";
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestKey = k;
      bestCount = c;
    }
  }
  return [bestKey, bestCount];
}

function verdictFor(average: number): SlideshowVerdict {
  if (average < 2.0) return "strong";
  if (average < 3.0) return "acceptable";
  if (average < 4.0) return "revise";
  return "fail";
}

export function scoreSlideshowRisk(
  scenes: Scene[],
  opts: { editDecisions?: Record<string, unknown> | null; rendererFamily?: string | null; renderRuntime?: string | null } = {},
): SlideshowRiskReport {
  const renderRuntime = opts.renderRuntime ?? null;
  if (!scenes.length) {
    return { average: 5.0, verdict: "fail", dimensions: {}, render_runtime: renderRuntime };
  }

  const dimensions: Record<string, SlideshowDimension> = {
    repetition: scoreRepetition(scenes),
    decorative_visuals: scoreDecorative(scenes),
    weak_motion: scoreWeakMotion(scenes),
    weak_shot_intent: scoreWeakIntent(scenes),
    typography_overreliance: scoreTypography(scenes),
    unsupported_cinematic_claims: scoreCinematicClaims(scenes, opts.rendererFamily ?? null),
  };

  const scores = Object.values(dimensions).map((d) => d.score);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;

  return {
    average: round2(average),
    verdict: verdictFor(average),
    dimensions,
    render_runtime: renderRuntime,
  };
}

function scoreRepetition(scenes: Scene[]): SlideshowDimension {
  if (scenes.length < 3) {
    return { score: 0.0, reason: "Too few scenes to assess repetition" };
  }

  const types = scenes.map((s) => getStr(s, "type", "unknown"));
  const [mostCommonType, mostCommonCount] = counterMostCommon(types);
  const typeRatio = mostCommonCount / scenes.length;

  const descriptions = scenes.map((s) => getStr(s, "description", "").toLowerCase().slice(0, 50));
  const uniqueDescRatio = new Set(descriptions).size / descriptions.length;

  const sizes = scenes.map((s) => getStr(shotLanguage(s), "shot_size", "none"));
  const sizeRatio = counterMostCommon(sizes)[1] / scenes.length;

  let score = 0.0;
  const reasons: string[] = [];

  if (typeRatio > 0.7) {
    score += 2.0;
    reasons.push(`Scene type '${mostCommonType}' dominates at ${pct0(typeRatio)}`);
  }
  if (uniqueDescRatio < 0.6) {
    score += 1.5;
    reasons.push(`Only ${pct0(uniqueDescRatio)} unique descriptions`);
  }
  if (sizeRatio > 0.6) {
    score += 1.5;
    reasons.push(`Same shot size in ${pct0(sizeRatio)} of scenes`);
  }

  return { score: Math.min(5.0, score), reason: reasons.join("; ") || "Good variety" };
}

function scoreDecorative(scenes: Scene[]): SlideshowDimension {
  let decorativeCount = 0;
  for (const scene of scenes) {
    const hasInfoRole = Boolean(scene.information_role);
    const hasNarrativeRole = Boolean(scene.narrative_role);
    const hasIntent = Boolean(scene.shot_intent);
    if (!hasInfoRole && !hasNarrativeRole && !hasIntent) decorativeCount += 1;
  }
  const ratio = decorativeCount / scenes.length;
  const score = Math.min(5.0, ratio * 5.0);

  let reason: string;
  if (ratio > 0.5) {
    reason = `${decorativeCount}/${scenes.length} scenes have no stated purpose (no information_role, narrative_role, or shot_intent)`;
  } else if (ratio > 0.2) {
    reason = `${decorativeCount}/${scenes.length} scenes lack stated purpose`;
  } else {
    reason = "Most scenes have clear communicative purpose";
  }
  return { score: round1(score), reason };
}

function scoreWeakMotion(scenes: Scene[]): SlideshowDimension {
  let totalMoving = 0;
  let purposelessMoving = 0;
  for (const scene of scenes) {
    const sl = shotLanguage(scene);
    const movement = "camera_movement" in sl ? sl.camera_movement : "static";
    if (movement !== "static" && movement !== "unspecified" && movement != null) {
      totalMoving += 1;
      if (!scene.shot_intent) purposelessMoving += 1;
    }
  }
  if (totalMoving === 0) {
    return { score: 1.5, reason: "No camera movement defined (may be intentional for static style)" };
  }
  const ratio = purposelessMoving / totalMoving;
  const score = Math.min(5.0, ratio * 4.0);
  const reason = ratio > 0.5
    ? `${purposelessMoving}/${totalMoving} moving shots lack shot_intent`
    : "Camera movement appears purposeful";
  return { score: round1(score), reason };
}

function scoreWeakIntent(scenes: Scene[]): SlideshowDimension {
  const withIntent = scenes.filter((s) => s.shot_intent).length;
  const ratio = withIntent / scenes.length;
  const score = Math.min(5.0, (1.0 - ratio) * 5.0);

  let reason: string;
  if (ratio < 0.3) {
    reason = `Only ${withIntent}/${scenes.length} scenes have shot_intent — most shots lack purpose`;
  } else if (ratio < 0.6) {
    reason = `${withIntent}/${scenes.length} scenes have shot_intent`;
  } else {
    reason = "Strong shot intent coverage";
  }
  return { score: round1(score), reason };
}

function scoreTypography(scenes: Scene[]): SlideshowDimension {
  const textTypes = new Set(["text_card", "stat_card", "kpi_grid"]);
  const textScenes = scenes.filter((s) => textTypes.has(getStr(s, "type", ""))).length;
  const ratio = textScenes / scenes.length;

  let score: number;
  let reason: string;
  if (ratio > 0.6) {
    score = 4.0;
    reason = `${textScenes}/${scenes.length} scenes are text/stat cards — video feels like animated slides`;
  } else if (ratio > 0.4) {
    score = 2.5;
    reason = `${textScenes}/${scenes.length} scenes are text-based — consider balancing with visual scenes`;
  } else if (ratio > 0.2) {
    score = 1.0;
    reason = "Balanced text and visual content";
  } else {
    score = 0.0;
    reason = "Visual-first approach";
  }
  return { score, reason };
}

function scoreCinematicClaims(scenes: Scene[], rendererFamily: string | null): SlideshowDimension {
  const isCinematic = Boolean(rendererFamily) && rendererFamily!.toLowerCase().includes("cinematic");
  if (!isCinematic) {
    return { score: 0.0, reason: "Not claiming cinematic treatment" };
  }

  const issues: string[] = [];

  const heroCount = scenes.filter((s) => s.hero_moment).length;
  if (heroCount === 0) {
    issues.push("Claims cinematic but has no hero_moment defined");
  }

  const hasMovement = scenes.filter((s) => getStr(shotLanguage(s), "camera_movement", "static") !== "static").length;
  if (hasMovement < scenes.length * 0.3) {
    issues.push(`Claims cinematic but only ${hasMovement}/${scenes.length} scenes have camera movement`);
  }

  const hasLighting = scenes.filter((s) => Boolean(shotLanguage(s).lighting_key)).length;
  if (hasLighting < scenes.length * 0.3) {
    issues.push(`Claims cinematic but only ${hasLighting}/${scenes.length} scenes define lighting`);
  }

  const score = Math.min(5.0, issues.length * 1.8);
  const reason = issues.length ? issues.join("; ") : "Cinematic claims supported by structure";
  return { score: round1(score), reason };
}

/** Format a 0-1 ratio as an integer percent, matching Python's `{x:.0%}`. */
function pct0(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
