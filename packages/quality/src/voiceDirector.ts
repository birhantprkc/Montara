// @montara/quality — the voice director.
// Picks the best AVAILABLE voice for a scene and shapes its delivery from the scene's emotion,
// intensity, and the energy of the music under it — then sets dynamic per-line volume + a music
// duck so narration stays intelligible. Pure (no network): the system voice is the always-on floor,
// so a plan is always produced even with zero API keys.

export type Emotion =
  | "neutral" | "calm" | "warm" | "tense" | "urgent"
  | "somber" | "triumphant" | "playful" | "authoritative";

export interface SceneEmotion {
  /** Free-text or a known Emotion; unknown strings are inferred from keywords. */
  emotion?: string;
  /** 0..1 — how strong the beat is. */
  intensity?: number;
  /** 0..1 — energy of the music bed under this line (0 = none/silence). */
  musicEnergy?: number;
  /** The line being spoken (used for length/pace hints). */
  text?: string;
}

export interface VoiceDirection {
  provider: string;
  /** Speaking rate multiplier (1 = natural). */
  rate: number;
  /** Expressiveness 0..1 (maps to ElevenLabs style / OpenAI delivery). */
  style: number;
  /** Voice stability 0..1 (lower = more dynamic). */
  stability: number;
  /** Per-line loudness trim in dB applied at the mix (dynamic volume). */
  gainDb: number;
  /** How much to duck the music under this line, in dB (negative = quieter). */
  musicDuckDb: number;
  emotion: Emotion;
  reason: string;
}

interface Preset { rate: number; style: number; stability: number; gainDb: number; }

const PRESETS: Record<Emotion, Preset> = {
  neutral:       { rate: 1.00, style: 0.20, stability: 0.60, gainDb: 0.0 },
  calm:          { rate: 0.94, style: 0.15, stability: 0.75, gainDb: -1.0 },
  warm:          { rate: 0.97, style: 0.35, stability: 0.55, gainDb: 0.0 },
  tense:         { rate: 1.04, style: 0.50, stability: 0.40, gainDb: 1.0 },
  urgent:        { rate: 1.12, style: 0.70, stability: 0.30, gainDb: 2.0 },
  somber:        { rate: 0.88, style: 0.20, stability: 0.80, gainDb: -2.0 },
  triumphant:    { rate: 1.05, style: 0.60, stability: 0.45, gainDb: 1.5 },
  playful:       { rate: 1.06, style: 0.65, stability: 0.40, gainDb: 0.5 },
  authoritative: { rate: 0.96, style: 0.30, stability: 0.70, gainDb: 0.5 },
};

const KEYWORDS: [RegExp, Emotion][] = [
  [/urgent|breaking|now|alarm|danger|attack|crisis/i, "urgent"],
  [/tense|threat|risk|warn|escalat|confront/i, "tense"],
  [/calm|gentle|quiet|slow|breathe|ease/i, "calm"],
  [/warm|welcome|friend|love|home|cozy/i, "warm"],
  [/sad|loss|grief|somber|mourn|fell|died/i, "somber"],
  [/win|victory|triumph|achieve|success|rise/i, "triumphant"],
  [/fun|play|joke|silly|smile|laugh/i, "playful"],
  [/must|should|fact|data|evidence|report|official/i, "authoritative"],
];

/** Coerce a free-text mood into a known Emotion (keyword inference for unknown strings). */
export function resolveEmotion(scene: SceneEmotion): Emotion {
  const raw = (scene.emotion ?? "").trim().toLowerCase();
  if (raw in PRESETS) return raw as Emotion;
  const hay = `${raw} ${scene.text ?? ""}`;
  for (const [re, emo] of KEYWORDS) if (re.test(hay)) return emo;
  return "neutral";
}

/** Provider preference: expressive cloud first, then quality cloud, then local, system last. */
const PROVIDER_RANK = ["elevenlabs", "openai", "google_tts", "doubao", "piper", "system"];
const EXPRESSIVE = new Set(["elevenlabs", "openai"]);

/** Choose the best available provider for an emotion: expressive ones win when the beat needs it. */
export function chooseVoiceProvider(emotion: Emotion, intensity: number, available: string[]): string {
  const avail = available.length ? available : ["system"];
  const wantsExpressive = intensity > 0.45 || PRESETS[emotion].style >= 0.5;
  if (wantsExpressive) {
    const expr = PROVIDER_RANK.find((p) => EXPRESSIVE.has(p) && avail.includes(p));
    if (expr) return expr;
  }
  return PROVIDER_RANK.find((p) => avail.includes(p)) ?? "system";
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Direct one scene/line: pick the voice and shape delivery from emotion + intensity + music. */
export function directScene(scene: SceneEmotion, available: string[] = ["system"]): VoiceDirection {
  const emotion = resolveEmotion(scene);
  const intensity = clamp(scene.intensity ?? 0.5, 0, 1);
  const musicEnergy = clamp(scene.musicEnergy ?? 0, 0, 1);
  const p = PRESETS[emotion];
  const provider = chooseVoiceProvider(emotion, intensity, available);

  // intensity bends the preset; louder music pushes the voice up a touch and ducks the bed more.
  const rate = round2(clamp(p.rate + (intensity - 0.5) * 0.06, 0.8, 1.25));
  const style = round2(clamp(p.style + (intensity - 0.5) * 0.2, 0, 1));
  const stability = round2(clamp(p.stability - (intensity - 0.5) * 0.15, 0, 1));
  const gainDb = round2(clamp(p.gainDb + (intensity - 0.5) * 2 + musicEnergy * 1.5, -4, 4));
  const musicDuckDb = round2(clamp(-(musicEnergy * 7), -9, 0));

  const reason = `${emotion} @ intensity ${intensity.toFixed(2)}` +
    (musicEnergy > 0 ? `, music ${musicEnergy.toFixed(2)} → duck ${musicDuckDb}dB` : ", no bed") +
    ` → ${provider}` + (EXPRESSIVE.has(provider) ? " (expressive)" : "");

  return { provider, rate, style, stability, gainDb, musicDuckDb, emotion, reason };
}

/** Direct a whole script: a per-scene voice plan with dynamic volumes and music ducking. */
export function directScript(scenes: SceneEmotion[], available: string[] = ["system"]): VoiceDirection[] {
  return scenes.map((s) => directScene(s, available));
}
