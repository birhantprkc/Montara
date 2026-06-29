// @montara/quality - dynamic Reel treatment planner.
// It turns source understanding + transcript/tool availability into an edit plan the renderer can
// execute. No model is required: Montara still "watches first" and makes explicit tool decisions,
// then degrades honestly when STT, masking, music, or voice-ID backends are unavailable.

import type { Caption, ReelBeat, ReelTimingOptions, ReelVisualStyle } from "../../render-ffmpeg/src/index";
import type { MediaProvider } from "../../providers/src/index";
import { directScene, type VoiceDirection } from "./voiceDirector";

export interface ReelUnderstandingLike {
  durationSec: number;
  sceneCount: number;
  tags: string[];
  caption?: string;
  aspectBreakdown?: {
    subject?: string;
    subjectMotion?: string;
    scene?: string;
    spatialFraming?: string;
    camera?: string;
    motionType?: string;
    flowVariance?: number;
  }[];
}

export interface ReelSkillHit {
  id: string;
  title: string;
  summary?: string;
}

export interface ReelCapabilityStatus {
  localStt: boolean;
  voiceId: boolean;
  aiHumanMask: boolean;
  localBrain: boolean;
}

export interface ReelProviderChoice {
  id: string;
  name: string;
  tier: string;
  mode: "use" | "skip" | "fallback" | "unavailable";
  reason: string;
}

export type ReelStyleMode =
  | "auto"
  | "cinematic"
  | "warfront-documentary"
  | "kinetic-typography"
  | "smart-talking-head"
  | "minimal";

export type ReelInputKind =
  | "talking-head"
  | "game-footage"
  | "photos-and-clips"
  | "documentary-source"
  | "pure-prompt"
  | "mixed";

export interface ReelVisualDirective {
  kind:
    | "source-primary"
    | "topic-overlay"
    | "diagram"
    | "ui-mock"
    | "progression-graphic"
    | "comparison"
    | "map-or-data"
    | "kinetic-text";
  title: string;
  subtitle: string;
  reason: string;
  priority: number;
  accent?: string;
}

export interface ReelTreatmentPlan {
  sourceSummary: string;
  promptSummary: string;
  style: ReelStyleMode;
  inputKind: ReelInputKind;
  editIntent: string[];
  visualDirectives: ReelVisualDirective[];
  selectedSkills: ReelSkillHit[];
  selectedTools: string[];
  unavailableTools: string[];
  hook: string;
  cta: string;
  beats: ReelBeat[];
  renderStyle: ReelVisualStyle;
  timing: ReelTimingOptions;
  voiceDirection: VoiceDirection;
  ttsDecision: ReelProviderChoice;
  musicDecision: ReelProviderChoice;
  maskingDecision: ReelProviderChoice;
  captionDecision: ReelProviderChoice;
  renderOptions: {
    smart: boolean;
    keepOriginalAudio: boolean;
    addGeneratedNarration: boolean;
    addGeneratedMusic: boolean;
  };
}

export interface PlanReelTreatmentInput {
  understanding: ReelUnderstandingLike;
  captions: Caption[];
  skills: ReelSkillHit[];
  availableVoiceProviders: string[];
  ttsProviders: MediaProvider[];
  musicProviders: MediaProvider[];
  capabilities: ReelCapabilityStatus;
  requestedHook?: string;
  requestedCta?: string;
  prompt?: string;
  requestedStyle?: ReelStyleMode;
  inputKind?: ReelInputKind;
}

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "i", "if", "in",
  "is", "it", "its", "like", "of", "on", "or", "so", "that", "the", "this", "to", "uh",
  "um", "was", "we", "with", "you", "your",
]);

function cleanWords(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9\s']/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
}

function titleFromCaption(text: string, fallback: string): string {
  const words = cleanWords(text).slice(0, 4);
  if (!words.length) return fallback;
  return words.join(" ").toUpperCase();
}

function shortLine(text: string, max = 42): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1).trim()}...`;
}

function sampleCaptions(captions: Caption[], durationSec: number, maxCount: number): Caption[] {
  if (captions.length <= maxCount) return captions;
  const slots = Math.max(1, maxCount);
  const targets = Array.from({ length: slots }, (_, i) => durationSec * ((i + 1) / (slots + 1)));
  const chosen: Caption[] = [];
  for (const t of targets) {
    const best = captions
      .filter((c) => !chosen.includes(c))
      .sort((a, b) => Math.abs((a.startSec + a.endSec) / 2 - t) - Math.abs((b.startSec + b.endSec) / 2 - t))[0];
    if (best) chosen.push(best);
  }
  return chosen.sort((a, b) => a.startSec - b.startSec);
}

function recommendedBeatCount(durationSec: number, directiveCount: number): number {
  if (directiveCount <= 0) return 0;
  const byDuration = Math.max(1, Math.round(Math.max(durationSec, 1) / 5));
  return Math.min(directiveCount, Math.max(1, Math.min(6, byDuration)));
}

function beatsFromCaptions(
  captions: Caption[],
  durationSec: number,
  directives: ReelVisualDirective[],
): ReelBeat[] {
  const maxCount = recommendedBeatCount(durationSec, Math.max(captions.length, directives.length));
  return sampleCaptions(captions, durationSec, maxCount).map((c, i) => {
    const directive = directives[i];
    const startSec = roundPlan(Math.max(0, c.startSec));
    const endSec = roundPlan(Math.min(durationSec, Math.max(c.endSec, c.startSec + 0.001)));
    return ({
    startSec,
    endSec,
    title: directive?.title ?? titleFromCaption(c.text, `POINT ${i + 1}`),
    subtitle: directive?.subtitle ?? shortLine(c.text, 48),
    accent: directive?.accent,
  });
  }).filter((b) => b.endSec > b.startSec);
}

function beatsFromDirectives(understanding: ReelUnderstandingLike, directives: ReelVisualDirective[]): ReelBeat[] {
  const d = Math.max(understanding.durationSec, 0.001);
  const count = recommendedBeatCount(d, directives.length);
  if (count <= 0) return [];
  const span = d / count;
  return directives.slice(0, count).map((directive, i) => {
    const start = roundPlan(i * span);
    return {
      startSec: start,
      endSec: roundPlan(Math.min(d, (i + 1) * span)),
      title: directive.title,
      subtitle: directive.subtitle,
      accent: directive.accent,
    };
  });
}

function roundPlan(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function defaultHook(understanding: ReelUnderstandingLike, captions: Caption[], prompt: string): string {
  const source = captions[0]?.text || prompt || understanding.caption || understanding.tags.join(" ");
  return titleFromCaption(source, "");
}

function detectStyle(prompt: string, requested: ReelStyleMode | undefined): ReelStyleMode {
  if (requested && requested !== "auto") return requested;
  const p = prompt.toLowerCase();
  if (/\bwarfront\b|\bdocumentary\b|\bgeo|conflict|history|evidence|map/.test(p)) return "warfront-documentary";
  if (/\bcinematic\b|\bfilm\b|\btrailer\b/.test(p)) return "cinematic";
  if (/\bminimal\b|\bclean\b|\bplain\b/.test(p)) return "minimal";
  if (/\bkinetic\b|\btypography\b|\blyric\b|\bwords\b/.test(p)) return "kinetic-typography";
  return "smart-talking-head";
}

function detectInputKind(prompt: string, understanding: ReelUnderstandingLike, explicit: ReelInputKind | undefined): ReelInputKind {
  if (explicit) return explicit;
  const p = prompt.toLowerCase();
  if (/\btalking[- ]?head\b|\bspeaker\b|\binterview\b/.test(p)) return "talking-head";
  if (/\bgameplay\b|\bgame footage\b|\bfable\b|\brpg\b|\bcombat\b/.test(p)) return "game-footage";
  if (/\bphoto\b|\bstills\b|\bimages\b/.test(p)) return "photos-and-clips";
  if (/\bdocumentary\b|\barchive\b|\bsource footage\b/.test(p)) return "documentary-source";
  if (understanding.aspectBreakdown?.some((shot) => /speech|speaker|talking/i.test(`${shot.subject ?? ""} ${shot.subjectMotion ?? ""}`))) return "talking-head";
  if (understanding.sceneCount <= 1 && understanding.tags.includes("slow-cut")) return "talking-head";
  return "mixed";
}

function styleVisuals(style: ReelStyleMode): ReelVisualStyle {
  switch (style) {
    case "cinematic":
      return { accent: "d8b15f", cardBackground: "101010", hookColor: "f5f0e6", endCardColor: "f5f0e6" };
    case "warfront-documentary":
      return { accent: "e6b44c", cardBackground: "111827", hookColor: "f8fafc", endCardColor: "f8fafc" };
    case "minimal":
      return { accent: "f4f4f5", cardBackground: "18181b", hookColor: "f4f4f5", endCardColor: "f4f4f5" };
    case "kinetic-typography":
      return { accent: "38bdf8", cardBackground: "0f172a", hookColor: "e0f2fe", endCardColor: "e0f2fe" };
    default:
      return { accent: "7dd3fc", cardBackground: "111827", hookColor: "ffffff", endCardColor: "ffffff" };
  }
}

function styleTiming(style: ReelStyleMode, captions: Caption[]): ReelTimingOptions {
  const timing: ReelTimingOptions = {};
  const firstCaption = captions.find((caption) => caption.endSec > caption.startSec);
  if (firstCaption) {
    timing.hookStartSec = roundPlan(Math.max(0, firstCaption.startSec));
    timing.hookDurationSec = roundPlan(Math.max(0.001, firstCaption.endSec - firstCaption.startSec));
  }
  if (style === "minimal") timing.endCardDurationSec = 0;
  return timing;
}

function hasGameDesignTopic(prompt: string, captions: Caption[]): boolean {
  const text = `${prompt} ${captions.map((c) => c.text).join(" ")}`.toLowerCase();
  return /\bfable\b|\brpg\b|\bgame design\b|\bcombat\b|\bquest\b|\bprogression\b|\bplayer choice\b|\bopen world\b/.test(text);
}

function buildVisualDirectives(
  prompt: string,
  captions: Caption[],
  style: ReelStyleMode,
  inputKind: ReelInputKind,
  understanding: ReelUnderstandingLike,
): ReelVisualDirective[] {
  const directives: ReelVisualDirective[] = [];
  if (inputKind === "talking-head" || understanding.sceneCount <= 1) {
    directives.push({
      kind: "source-primary",
      title: "KEEP THE SPEAKER",
      subtitle: "overlays support the point, not replace the footage",
      reason: "talking-head footage should stay primary unless a concept needs visual help",
      priority: 100,
    });
  }

  if (hasGameDesignTopic(prompt, captions)) {
    directives.push(
      {
        kind: "progression-graphic",
        title: "PROGRESSION LOOP",
        subtitle: "quest -> skill -> gear -> new choice",
        reason: "game-design explanations need systems diagrams the viewer can inspect",
        priority: 95,
        accent: "7dd3fc",
      },
      {
        kind: "ui-mock",
        title: "UI MOCKUP",
        subtitle: "show the player-facing rule, not abstract filler",
        reason: "a Fable-style design topic benefits from concrete interface/progression examples",
        priority: 90,
        accent: "a7f3d0",
      },
      {
        kind: "diagram",
        title: "CHOICE TREE",
        subtitle: "promise, consequence, long-tail payoff",
        reason: "branching consequences are easier to understand as animated structure",
        priority: 88,
        accent: "f9a8d4",
      },
      {
        kind: "comparison",
        title: "COMBAT READABILITY",
        subtitle: "input, feedback, risk, reward",
        reason: "design critique should connect mechanics to player comprehension",
        priority: 82,
        accent: "fde68a",
      },
    );
  } else if (style === "warfront-documentary") {
    directives.push(
      {
        kind: "map-or-data",
        title: "EVIDENCE BEAT",
        subtitle: "fact card with source confidence",
        reason: "documentary style requires traceable assertions and honest visual confidence",
        priority: 92,
        accent: "e6b44c",
      },
      {
        kind: "comparison",
        title: "CAUSE / EFFECT",
        subtitle: "make the argument visible",
        reason: "documentary edits should clarify the causal chain",
        priority: 84,
        accent: "93c5fd",
      },
    );
  } else if (style === "kinetic-typography") {
    directives.push({
      kind: "kinetic-text",
      title: "KEY PHRASE",
      subtitle: "animate the strongest words from the transcript",
      reason: "kinetic style should use transcript rhythm as the visual system",
      priority: 90,
      accent: "38bdf8",
    });
  }

  if (!directives.some((d) => d.kind !== "source-primary")) {
    const topic = cleanWords(prompt || captions.map((c) => c.text).join(" ")).slice(0, 3).join(" ");
    directives.push({
      kind: "topic-overlay",
      title: topic ? topic.toUpperCase() : "MAIN POINT",
      subtitle: "only add graphics where they clarify the spoken idea",
      reason: "fallback directive remains topic-derived and source-aware",
      priority: 60,
    });
  }

  return directives.sort((a, b) => b.priority - a.priority);
}

function pickProvider(providers: MediaProvider[], fallbackId: string): MediaProvider | null {
  return providers.find((p) => p.tier !== "local-free") ?? providers.find((p) => p.id === fallbackId) ?? providers[0] ?? null;
}

function providerChoice(provider: MediaProvider | null, mode: ReelProviderChoice["mode"], reason: string): ReelProviderChoice {
  if (!provider) return { id: "none", name: "None", tier: "none", mode: "unavailable", reason };
  return { id: provider.id, name: provider.name, tier: provider.tier, mode, reason };
}

export function planReelTreatment(input: PlanReelTreatmentInput): ReelTreatmentPlan {
  const { understanding, captions, capabilities } = input;
  const prompt = (input.prompt ?? understanding.caption ?? "").trim();
  const style = detectStyle(prompt, input.requestedStyle);
  const inputKind = detectInputKind(prompt, understanding, input.inputKind);
  const visualDirectives = buildVisualDirectives(prompt, captions, style, inputKind, understanding);
  const renderStyle = styleVisuals(style);
  const timing = styleTiming(style, captions);
  const hasSpeech = captions.length > 0;
  const slowCut = understanding.sceneCount <= 1 || understanding.tags.includes("slow-cut");
  const voiceDirection = directScene({
    text: captions.map((c) => c.text).join(" ").slice(0, 400),
    emotion: slowCut ? "authoritative" : "urgent",
    intensity: slowCut ? 0.58 : 0.72,
    musicEnergy: 0,
  }, input.availableVoiceProviders);

  const ttsProvider = pickProvider(input.ttsProviders, "local.silent-voice");
  const musicProvider = pickProvider(input.musicProviders, "local.tone-score");
  const maskingDecision: ReelProviderChoice = capabilities.aiHumanMask
    ? {
        id: "ai-human-mask",
        name: "AI Human Mask",
        tier: "local-runtime",
        mode: "use",
        reason: "AI human mask is available for text-behind-person or foreground sandwich effects",
      }
    : {
        id: "safe-zone-overlays",
        name: "Safe-zone overlays",
        tier: "local-free",
        mode: "fallback",
        reason: "AI human masking is unavailable, so use safe-zone overlays instead of pretending to segment the subject",
      };
  const captionDecision: ReelProviderChoice = capabilities.localStt
    ? {
        id: "faster-whisper",
        name: "Local faster-whisper",
        tier: "local-runtime",
        mode: "use",
        reason: "local faster-whisper captions available",
      }
    : {
        id: "no-local-stt",
        name: "No local STT",
        tier: "unavailable",
        mode: "unavailable",
        reason: "local faster-whisper unavailable; do not fake captions",
      };

  const editIntent = [
    "inspect source before editing",
    `${style} treatment for ${inputKind} input`,
    slowCut ? "add structure to slow-cut talking footage without hiding the speaker" : "preserve source pacing and add support layers",
    visualDirectives.some((d) => d.kind === "progression-graphic" || d.kind === "ui-mock")
      ? "add topic-specific game-design visualizations instead of generic explainer cards"
      : "use support graphics only where they clarify the prompt",
    "keep original voice and existing speech as the primary audio",
    inputKind === "talking-head" ? "place overlays in safe zones so face and lower captions stay clear" : "let visuals lead when source footage is not the anchor",
    "master once and QA playback",
  ];

  const selectedTools = [
    "montara analyze / understandVideo",
    "montara qa / qaPlayback",
    capabilities.localStt ? "localTranscribe (faster-whisper)" : "caption fallback: no local STT",
    "planReelTreatment",
    "scene_plan/edit_decisions Timeline IR bridge",
    "buildReel",
    "loudnorm master",
  ];
  const unavailableTools = [
    ...(!capabilities.localStt ? ["faster-whisper local STT"] : []),
    ...(!capabilities.voiceId ? ["voice-ID speaker similarity (Resemblyzer)"] : []),
    ...(!capabilities.aiHumanMask ? ["AI human segmentation / rembg masking"] : []),
    ...(!capabilities.localBrain ? ["local LLM brain"] : []),
  ];

  const beats = captions.length
    ? beatsFromCaptions(captions, understanding.durationSec, visualDirectives)
    : beatsFromDirectives(understanding, visualDirectives);

  return {
    sourceSummary: `${understanding.durationSec.toFixed(1)}s, ${understanding.sceneCount} scene(s), ${understanding.tags.join(", ")}`,
    promptSummary: prompt || "(no prompt supplied)",
    style,
    inputKind,
    editIntent,
    visualDirectives,
    selectedSkills: input.skills.slice(0, 8),
    selectedTools,
    unavailableTools,
    hook: input.requestedHook ?? defaultHook(understanding, captions, prompt),
    cta: input.requestedCta ?? "",
    beats,
    renderStyle,
    timing,
    voiceDirection,
    ttsDecision: providerChoice(
      ttsProvider,
      hasSpeech ? "skip" : (ttsProvider?.tier === "local-free" ? "fallback" : "use"),
      hasSpeech ? "source already has speech; preserve it instead of replacing with generated narration" : "no source speech/captions detected; use best available narration path",
    ),
    musicDecision: providerChoice(
      musicProvider,
      "skip",
      "speech-led reel: do not add a generated bed unless a real music provider or user-selected track is available; avoid drowning dialogue",
    ),
    maskingDecision,
    captionDecision,
    renderOptions: {
      smart: true,
      keepOriginalAudio: true,
      addGeneratedNarration: !hasSpeech && ttsProvider?.tier !== "local-free",
      addGeneratedMusic: false,
    },
  };
}
