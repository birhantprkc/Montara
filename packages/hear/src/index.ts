// @montara/hear — the audio-understanding boundary. Speaker differentiation (voice-ID) via
// the Resemblyzer embedding tool. Shells out to `tools/audio/voice_id.py` (heavy: torch) and parses JSON,
// so nothing here pulls torch into the gate. Availability is checked with importlib.find_spec
// (no torch import), keeping discovery fast.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mediaBin } from "../../render-ffmpeg/src/index";

const VOICE_ID_SCRIPT = join("tools", "audio", "voice_id.py");
const TRANSCRIBE_SCRIPT = join("tools", "audio", "transcribe_local.py");

function findPython(): string | null {
  for (const cand of ["python", "python3", "py"]) {
    const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cand;
  }
  return null;
}

function hearRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, VOICE_ID_SCRIPT))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function pythonEnv(root: string): Record<string, string | undefined> {
  const vendor = join(root, ".python-packages");
  const current = process.env.PYTHONPATH;
  const pathListSeparator = process.platform === "win32" ? ";" : ":";
  return {
    ...process.env,
    PYTHONPATH: current ? `${vendor}${pathListSeparator}${current}` : vendor,
  };
}

/** Whether voice-ID can run: Python + the script + Resemblyzer installed (no torch import). */
export function voiceIdAvailable(root: string = hearRoot()): boolean {
  const py = findPython();
  if (!py || !existsSync(join(root, VOICE_ID_SCRIPT))) return false;
  const chk = spawnSync(py, ["-c", "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('resemblyzer') else 1)"], { encoding: "utf8", env: pythonEnv(root) });
  return chk.status === 0;
}

export interface VoiceCompareResult {
  ok: boolean;
  match: string;
  scores: Record<string, number>;
  margin: number;
}

/** Classify a test clip against labelled reference clips. Returns the closest speaker. */
export function voiceCompare(testWav: string, refs: [label: string, wav: string][], root: string = hearRoot()): VoiceCompareResult | null {
  const py = findPython();
  if (!py) return null;
  const args = [join(root, VOICE_ID_SCRIPT), "compare", testWav];
  for (const [label, wav] of refs) args.push(label, wav);
  const res = spawnSync(py, args, { cwd: root, encoding: "utf8", env: pythonEnv(root) });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout ?? "null") as VoiceCompareResult;
  } catch {
    return null;
  }
}

export interface VoiceVerifyResult {
  ok: boolean;
  similarity: number;
  same_speaker: boolean;
  threshold: number;
}

/** Verify whether two clips are the same speaker (cosine similarity vs threshold). */
export function voiceVerify(a: string, b: string, threshold = 0.75, root: string = hearRoot()): VoiceVerifyResult | null {
  const py = findPython();
  if (!py) return null;
  const res = spawnSync(py, [join(root, VOICE_ID_SCRIPT), "verify", a, b, String(threshold)], { cwd: root, encoding: "utf8", env: pythonEnv(root) });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout ?? "null") as VoiceVerifyResult;
  } catch {
    return null;
  }
}

export interface SpeakerBackendStatus {
  resemblyzer: boolean;
  speechbrainEcapa: boolean;
  pyannote: boolean;
}

export interface DialogueCorpusClip {
  id: string;
  speaker: string;
  path: string;
  line?: string;
  tags?: string[];
}

export interface DialogueSearchInput {
  queryAudioPath: string;
  requestedLine?: string;
  corpus: DialogueCorpusClip[];
}

export interface DialogueSearchMatch {
  clip: DialogueCorpusClip;
  voiceScore: number | null;
  lineScore: number;
  combinedScore: number;
}

function pythonHas(moduleName: string, root: string): boolean {
  const py = findPython();
  if (!py) return false;
  const chk = spawnSync(py, ["-c", `import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('${moduleName}') else 1)`], { encoding: "utf8", env: pythonEnv(root) });
  return chk.status === 0;
}

export function speakerIntelligenceStatus(root: string = hearRoot()): SpeakerBackendStatus {
  return {
    resemblyzer: voiceIdAvailable(root),
    speechbrainEcapa: pythonHas("speechbrain", root),
    pyannote: pythonHas("pyannote.audio", root),
  };
}

function tokenScore(query: string | undefined, text: string | undefined): number {
  if (!query?.trim() || !text?.trim()) return 0;
  const q = new Set(query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  const t = new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  if (!q.size || !t.size) return 0;
  let hit = 0;
  for (const token of q) if (t.has(token)) hit++;
  return Math.round((hit / q.size) * 1000) / 1000;
}

export function findDialogueByVoice(input: DialogueSearchInput, root: string = hearRoot()): DialogueSearchMatch[] {
  const refs = input.corpus
    .filter((clip) => existsSync(clip.path))
    .map((clip): [string, string] => [clip.id, clip.path]);
  const voice = refs.length && voiceIdAvailable(root) ? voiceCompare(input.queryAudioPath, refs, root) : null;
  const scored = input.corpus.map((clip) => {
    const voiceScore = voice?.scores?.[clip.id] ?? null;
    const lineScore = tokenScore(input.requestedLine, clip.line);
    const combinedScore = Math.round((((voiceScore ?? 0) * 0.75) + (lineScore * 0.25)) * 1000) / 1000;
    return { clip, voiceScore, lineScore, combinedScore };
  });
  return scored.sort((a, b) => b.combinedScore - a.combinedScore);
}

export * from "./groq";
import { groqTranscribe, groqTranscribeAvailable, mediaForGroq } from "./groq";

// ---- Transcription (Groq cloud OR local faster-whisper) ----

export interface TranscriptSegment { start: number; end: number; text: string }
export interface Transcript { language: string; duration: number; segments: TranscriptSegment[] }

/** Whether any STT path is available (Groq key or local faster-whisper). */
export function sttAvailable(root: string = hearRoot(), secrets: Record<string, string | undefined> = process.env): boolean {
  return groqTranscribeAvailable(secrets) || localTranscribeAvailable(root);
}

/** @deprecated use sttAvailable */
export function transcribeAvailable(root: string = hearRoot()): boolean {
  return sttAvailable(root);
}

function localTranscribeAvailable(root: string = hearRoot()): boolean {
  const py = findPython();
  if (!py || !existsSync(join(root, TRANSCRIBE_SCRIPT))) return false;
  const chk = spawnSync(py, ["-c", "import importlib.util,sys; sys.exit(0 if importlib.util.find_spec('faster_whisper') else 1)"], { encoding: "utf8", env: pythonEnv(root) });
  return chk.status === 0;
}

/** Best available STT: Groq when GROQ_API_KEY is set, else local faster-whisper. */
export function transcribeMedia(
  media: string,
  opts: { model?: string; language?: string; workDir?: string } = {},
  root: string = hearRoot(),
  secrets: Record<string, string | undefined> = process.env,
): Transcript | null {
  if (groqTranscribeAvailable(secrets)) {
    const audio = mediaForGroq(media, opts.workDir ?? join(root, "out"));
    return groqTranscribe(audio, secrets);
  }
  return localTranscribe(media, opts, root);
}

/** Transcribe a media file to timed segments using local faster-whisper. */
export function localTranscribe(media: string, opts: { model?: string; language?: string } = {}, root: string = hearRoot()): Transcript | null {
  const py = findPython();
  if (!py) return null;
  const args = [join(root, TRANSCRIBE_SCRIPT), media, opts.model ?? "base"];
  if (opts.language) args.push(opts.language);
  const res = spawnSync(py, args, { cwd: root, encoding: "utf8", env: pythonEnv(root), timeout: 600000, maxBuffer: 1 << 26 });
  if (res.status !== 0) return null;
  try {
    const j = JSON.parse(res.stdout ?? "null") as Transcript & { error?: string };
    if (!j || j.error || !Array.isArray(j.segments)) return null;
    return j;
  } catch {
    return null;
  }
}

// ---- Music intelligence (local, ffmpeg-backed, no keys) ----

export interface MusicAnalysis {
  ok: boolean;
  path: string;
  durationSec: number;
  sampleRate: number | null;
  channels: number | null;
  loudness: {
    meanDb: number | null;
    peakDb: number | null;
    approximateLufs: number | null;
    targetLufs: number;
    truePeakTargetDb: number;
  };
  spectral: {
    brightness: "unknown" | "dark" | "balanced" | "bright";
    bandEnergy: Record<"sub" | "bass" | "lowMid" | "mid" | "presence" | "brilliance", number | null>;
  };
  rhythm: {
    tempoBpm: number | null;
    onsetDensityPerSec: number | null;
    stability: number | null;
  };
  dynamics: {
    crestDb: number | null;
    clipping: boolean;
    silenceRisk: boolean;
  };
  sectionBoundaries: { atSec: number; reason: string; confidence: number }[];
  qualityGates: { id: string; ok: boolean; detail: string }[];
  suggestions: string[];
}

export interface SceneMusicBeat {
  id: string;
  startSec: number;
  endSec: number;
  role?: string;
  emphasis?: "low" | "medium" | "high";
}

export interface SceneMappedMusicCue {
  sceneId: string;
  startSec: number;
  endSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  gainDb: number;
  silenceBeforeSec: number;
  intent: string;
}

function parseVolume(video: string): { meanDb: number | null; peakDb: number | null } {
  const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", video, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 24 });
  const err = r.stderr || "";
  const mean = err.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  const max = err.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  return {
    meanDb: mean ? parseFloat(mean[1]!) : null,
    peakDb: max ? parseFloat(max[1]!) : null,
  };
}

export function musicAnalyzerAvailable(): boolean {
  const r = spawnSync(mediaBin("ffmpeg"), ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

export function analyzeMusic(audioPath: string): MusicAnalysis {
  const meta = probeJson(audioPath);
  const audio = (meta.streams ?? []).find((s) => s.codec_type === "audio");
  const durationSec = parseFloat(meta.format?.duration ?? "0") || 0;
  const sampleRate = audio?.sample_rate ? parseInt(audio.sample_rate, 10) : null;
  const channels = audio?.channels ?? null;
  const { meanDb, peakDb } = parseVolume(audioPath);
  const clipping = peakDb != null && peakDb > -1;
  const silenceRisk = meanDb != null && meanDb < -55;
  const approximateLufs = meanDb == null ? null : Math.round((meanDb + 8) * 10) / 10;
  const brightness = sampleRate == null ? "unknown" : sampleRate >= 48000 ? "balanced" : "unknown";
  const boundaries = durationSec > 20
    ? [
        { atSec: Math.round(durationSec * 0.33 * 10) / 10, reason: "third-point arrangement checkpoint", confidence: 0.35 },
        { atSec: Math.round(durationSec * 0.66 * 10) / 10, reason: "two-third arrangement checkpoint", confidence: 0.35 },
      ]
    : [];
  const qualityGates = [
    { id: "target-lufs", ok: approximateLufs == null || Math.abs(approximateLufs - -14) <= 6, detail: approximateLufs == null ? "loudness unavailable" : `approx ${approximateLufs} LUFS vs -14 target` },
    { id: "true-peak", ok: !clipping, detail: peakDb == null ? "peak unavailable" : `${peakDb} dB peak` },
    { id: "silence", ok: !silenceRisk, detail: meanDb == null ? "mean unavailable" : `${meanDb} dB mean` },
    { id: "sample-rate", ok: sampleRate == null || sampleRate >= 44100, detail: sampleRate == null ? "sample rate unavailable" : `${sampleRate} Hz` },
  ];
  const suggestions = [
    "Use scene-mapped cues with crossfades; avoid hard aloop seams.",
    "Leave intentional silence before names, numbers, and thesis turns.",
    "Master once to -14 LUFS / -1 dBTP after narration and music are mixed.",
  ];
  if (clipping) suggestions.push("Lower music gain before mastering; clipping was detected.");
  if (silenceRisk) suggestions.push("Audio appears very quiet; verify the file is the intended music bed.");

  return {
    ok: existsSync(audioPath) && durationSec > 0,
    path: audioPath,
    durationSec,
    sampleRate,
    channels,
    loudness: { meanDb, peakDb, approximateLufs, targetLufs: -14, truePeakTargetDb: -1 },
    spectral: {
      brightness,
      bandEnergy: { sub: null, bass: null, lowMid: null, mid: null, presence: null, brilliance: null },
    },
    rhythm: { tempoBpm: null, onsetDensityPerSec: null, stability: null },
    dynamics: { crestDb: null, clipping, silenceRisk },
    sectionBoundaries: boundaries,
    qualityGates,
    suggestions,
  };
}

export function planSceneMappedMusic(analysis: MusicAnalysis, scenes: SceneMusicBeat[]): SceneMappedMusicCue[] {
  return scenes.map((scene, index) => {
    const high = scene.emphasis === "high" || /hook|payoff|evidence|reveal/i.test(scene.role ?? "");
    return {
      sceneId: scene.id,
      startSec: scene.startSec,
      endSec: scene.endSec,
      fadeInSec: index === 0 ? 0.2 : 0.45,
      fadeOutSec: high ? 0.65 : 0.35,
      gainDb: high ? -10 : -15,
      silenceBeforeSec: high ? 0.25 : 0,
      intent: high
        ? "give the key beat a small breath, then re-enter under the argument"
        : analysis.dynamics.silenceRisk ? "verify bed audibility before use" : "support narration without masking speech",
    };
  });
}

// ---- Playback QA (the craft layer's "inspect the actual file, not the plan" gate) ----

export interface QaReport {
  ok: boolean;
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  clipping: boolean;
  sceneChanges: number;
  isStatic: boolean;
  issues: string[];
}

function probeJson(path: string): { streams?: { codec_type?: string; width?: number; height?: number; sample_rate?: string; channels?: number }[]; format?: { duration?: string } } {
  const r = spawnSync(mediaBin("ffprobe"), ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8", maxBuffer: 1 << 24 });
  try { return JSON.parse(r.stdout || "{}"); } catch { return {}; }
}

/** Inspect a rendered file: duration, streams, loudness/clipping, and visual variety (scene cuts). */
export function qaPlayback(video: string): QaReport {
  const issues: string[] = [];
  const meta = probeJson(video);
  const streams = meta.streams ?? [];
  const vstream = streams.find((s) => s.codec_type === "video");
  const hasVideo = Boolean(vstream);
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  const durationSec = parseFloat(meta.format?.duration ?? "0") || 0;
  const width = vstream?.width ?? 0;
  const height = vstream?.height ?? 0;

  // loudness / clipping via volumedetect
  let meanVolumeDb: number | null = null, maxVolumeDb: number | null = null;
  if (hasAudio) {
    const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", video, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 24 });
    const err = r.stderr || "";
    const mean = err.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    const max = err.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
    if (mean) meanVolumeDb = parseFloat(mean[1]!);
    if (max) maxVolumeDb = parseFloat(max[1]!);
  }
  const clipping = maxVolumeDb != null && maxVolumeDb >= -0.3;

  // visual variety: count scene changes
  let sceneChanges = 0;
  if (hasVideo) {
    const r = spawnSync(mediaBin("ffmpeg"), ["-hide_banner", "-i", video, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
    sceneChanges = ((r.stderr || "").match(/Parsed_showinfo/g) || []).length;
  }
  const isStatic = hasVideo && durationSec > 3 && sceneChanges === 0;

  if (durationSec <= 0) issues.push("no readable duration");
  if (!hasVideo) issues.push("no video stream");
  if (!hasAudio) issues.push("no audio stream");
  if (clipping) issues.push(`audio clipping (max ${maxVolumeDb} dB)`);
  if (isStatic) issues.push("no visible motion/cuts across the file (static)");

  return { ok: issues.length === 0, durationSec, hasVideo, hasAudio, width, height, meanVolumeDb, maxVolumeDb, clipping, sceneChanges, isStatic, issues };
}
