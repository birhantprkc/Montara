// @montara/quality — scene-plan variation checker.
// Flags repetitive patterns that make videos feel like slideshows, before asset
// generation begins. Structural check, not a creative judgment — it flags concrete
// patterns that reliably produce generic-feeling output. Score 0-5 (lower is better).

import type { Scene, SlideshowVerdict } from "./slideshowRisk";

export interface VariationReport {
  score: number;
  verdict: SlideshowVerdict;
  violations: string[];
  suggestions: string[];
}

// Generic language patterns that signal lazy scene descriptions.
export const GENERIC_PHRASES: Set<string> = new Set([
  "a person", "a beautiful", "modern", "futuristic", "cutting-edge",
  "in today's world", "sleek design", "innovative", "state-of-the-art",
  "next-generation", "revolutionary", "a professional", "dynamic",
  "vibrant", "stunning", "breathtaking", "amazing", "incredible",
  "powerful", "seamless", "elegant solution",
]);

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function pct0(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function shotLanguage(scene: Scene): Record<string, unknown> {
  const sl = scene.shot_language;
  return sl !== null && typeof sl === "object" && !Array.isArray(sl) ? (sl as Record<string, unknown>) : {};
}

function getStr(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

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

function verdictFor(score: number): SlideshowVerdict {
  if (score < 2.0) return "strong";
  if (score < 3.0) return "acceptable";
  if (score < 4.0) return "revise";
  return "fail";
}

/** Analyze a scene plan for repetitive patterns. */
export function checkSceneVariation(scenes: Scene[]): VariationReport {
  if (!scenes.length) {
    return { score: 5.0, verdict: "fail", violations: ["No scenes to check"], suggestions: [] };
  }

  const violations: string[] = [];
  const suggestions: string[] = [];
  const n = scenes.length;

  // --- Check 1: Shot size variety ---
  const shotSizes = scenes.map((s) => getStr(shotLanguage(s), "shot_size", "unspecified"));
  if (n >= 4) {
    const [mostCommonSize, mostCommonCount] = counterMostCommon(shotSizes);
    if (mostCommonCount / n > 0.5) {
      violations.push(
        `Shot size '${mostCommonSize}' used in ${mostCommonCount}/${n} scenes ` +
        `(${pct0(mostCommonCount / n)}). Vary shot sizes for visual interest.`,
      );
      suggestions.push("Mix wide establishing shots with close-ups for visual rhythm.");
    }
  }

  // --- Check 2: Consecutive same-size shots ---
  let consecutiveSame = 0;
  for (let i = 1; i < shotSizes.length; i++) {
    if (shotSizes[i] === shotSizes[i - 1] && shotSizes[i] !== "unspecified") consecutiveSame += 1;
  }
  if (consecutiveSame >= 3) {
    violations.push(
      `${consecutiveSame} consecutive same-size shots. ` +
      `Vary shot sizes between scenes for editorial rhythm.`,
    );
  }

  // --- Check 3: Static shot overuse ---
  const movements = scenes.map((s) => getStr(shotLanguage(s), "camera_movement", "unspecified"));
  const staticCount = movements.filter((m) => m === "static" || m === "unspecified").length;
  if (n >= 4 && staticCount / n > 0.6) {
    violations.push(
      `${staticCount}/${n} scenes are static or unspecified movement. ` +
      `Add intentional camera movement to at least 40% of scenes.`,
    );
    suggestions.push("Consider dolly_in for emphasis, tracking for energy, or crane for scale.");
  }

  // --- Check 4: Lighting variety ---
  const lightings = new Set<string>();
  for (const s of scenes) {
    const key = shotLanguage(s).lighting_key;
    if (key) lightings.add(String(key));
  }
  if (n >= 4 && lightings.size <= 1) {
    violations.push(
      `Only ${lightings.size} unique lighting setup(s) across ${n} scenes. ` +
      `Vary lighting to create mood shifts.`,
    );
  }

  // --- Check 5: Hero moment exists and is visually distinct ---
  const heroScenes = scenes.filter((s) => s.hero_moment);
  if (n >= 4 && heroScenes.length === 0) {
    violations.push("No hero_moment flagged. Every video should have at least one visual peak.");
    suggestions.push("Mark the most impactful scene as hero_moment=true.");
  }

  for (const hero of heroScenes) {
    const heroIdx = scenes.indexOf(hero);
    const heroSize = shotLanguage(hero).shot_size;
    for (const offset of [-1, 1]) {
      const neighborIdx = heroIdx + offset;
      if (neighborIdx >= 0 && neighborIdx < n) {
        const neighborSize = shotLanguage(scenes[neighborIdx]!).shot_size;
        if (heroSize && neighborSize && heroSize === neighborSize) {
          violations.push(
            `Hero scene '${heroId(hero)}' has same shot size as neighbor. ` +
            `Hero moments should be visually distinct from surrounding scenes.`,
          );
        }
      }
    }
  }

  // --- Check 6: Description specificity ---
  let genericCount = 0;
  for (const scene of scenes) {
    const desc = getStr(scene, "description", "").toLowerCase();
    for (const phrase of GENERIC_PHRASES) {
      if (desc.includes(phrase)) {
        genericCount += 1;
        break;
      }
    }
  }
  if (genericCount >= n * 0.3) {
    violations.push(
      `${genericCount}/${n} scenes use generic language. ` +
      `Replace vague descriptions with specific visual details.`,
    );
    suggestions.push(
      "Instead of 'a beautiful cityscape', try 'rain-slicked Tokyo intersection " +
      "at night, neon reflections in puddles, pedestrians with translucent umbrellas'.",
    );
  }

  // --- Check 7: Texture keywords presence ---
  const textured = scenes.filter((s) => s.texture_keywords).length;
  if (n >= 4 && textured < n * 0.3) {
    violations.push(
      `Only ${textured}/${n} scenes have texture_keywords. ` +
      `Add texture descriptors to visual scenes for richer generation prompts.`,
    );
  }

  // --- Check 8: Shot intent completeness ---
  const intented = scenes.filter((s) => s.shot_intent).length;
  if (n >= 4 && intented < n * 0.5) {
    violations.push(
      `Only ${intented}/${n} scenes have shot_intent. ` +
      `Every scene should explain WHY it exists in the video.`,
    );
  }

  // --- Score: each violation category adds ~0.6 ---
  const score = Math.min(5.0, violations.length * 0.6);

  return {
    score: round1(score),
    verdict: verdictFor(score),
    violations,
    suggestions,
  };
}

function heroId(hero: Scene): string {
  const id = hero.id;
  return id == null ? "undefined" : String(id);
}
