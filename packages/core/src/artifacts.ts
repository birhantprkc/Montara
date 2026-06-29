import {
  normalizeHex,
  round3,
  type AudioClip,
  type ClipTransition,
  type MediaClip,
  type SolidClip,
  type TextClip,
  type Timeline,
  type Track,
  type Transform,
} from "./types";

export type RenderRuntime = "remotion" | "hyperframes" | "ffmpeg";

export type RendererFamily =
  | "explainer-data"
  | "explainer-teacher"
  | "cinematic-trailer"
  | "documentary-montage"
  | "product-reveal"
  | "screen-demo"
  | "presenter"
  | "animation-first";

export interface ScenePlanArtifact {
  version: "1.0";
  style_playbook?: string;
  scenes: ScenePlanArtifactScene[];
  metadata?: Record<string, unknown>;
}

export interface ScenePlanArtifactScene {
  id: string;
  type:
    | "talking_head"
    | "broll"
    | "animation"
    | "character_scene"
    | "diagram"
    | "text_card"
    | "transition"
    | "generated"
    | "screen_recording";
  description: string;
  start_seconds: number;
  end_seconds: number;
  script_section_id?: string;
  framing?: string;
  movement?: string;
  transition_in?: string;
  transition_out?: string;
  overlay_notes?: string;
  shot_intent?: string;
  narrative_role?: string;
  information_role?: string;
  hero_moment?: boolean;
  texture_keywords?: string[];
  required_assets?: { type: string; description: string; source: "generate" | "source" | "provided" | "record" }[];
}

export interface EditDecisionsArtifact {
  version: "1.0";
  cuts: EditDecisionCut[];
  overlays?: EditDecisionOverlay[];
  audio?: EditDecisionAudio;
  subtitles?: EditDecisionSubtitles;
  music?: EditDecisionMusic;
  transitions?: EditDecisionTransition[];
  renderer_family?: RendererFamily;
  render_runtime: RenderRuntime;
  slideshow_risk_score?: { average?: number; verdict?: "strong" | "acceptable" | "revise" | "fail" };
  metadata?: Record<string, unknown>;
}

export interface EditDecisionCut {
  id: string;
  source: string;
  in_seconds: number;
  out_seconds: number;
  speed?: number;
  layer?: "primary" | "overlay" | "background";
  type?: string;
  text?: string;
  title?: string;
  subtitle?: string;
  transform?: {
    scale?: number;
    position?: string;
    animation?: string;
    crop?: { x?: number; y?: number; width?: number; height?: number };
  };
  transition_in?: string;
  transition_out?: string;
  transition_duration?: number;
  reason?: string;
}

export interface EditDecisionOverlay {
  asset_id: string;
  start_seconds: number;
  end_seconds: number;
  position: { x: number; y: number; width?: number; height?: number };
  animation?: string;
  opacity?: number;
}

export interface EditDecisionAudio {
  narration?: { segments?: { asset_id: string; start_seconds: number; end_seconds?: number }[] };
  music?: EditDecisionMusic;
  sfx?: { asset_id?: string; start_seconds?: number; volume?: number }[];
}

export interface EditDecisionMusic {
  asset_id?: string;
  volume?: number;
  fade_in_seconds?: number;
  fade_out_seconds?: number;
  ducking?: boolean | Record<string, unknown>;
}

export interface EditDecisionSubtitles {
  enabled?: boolean;
  style?: string | Record<string, unknown>;
  source?: string;
  font?: string;
  font_size?: number;
  color?: string;
  outline_color?: string;
  background?: string;
  position?: "top-center" | "bottom-center" | "center";
  max_words_per_line?: number;
}

export interface EditDecisionTransition {
  type: string;
  at_seconds: number;
  duration_seconds: number;
}

export interface AssetManifestLike {
  assets?: { id?: string; path?: string; type?: string }[];
}

export interface ArtifactTimelineOptions {
  width?: number;
  height?: number;
  fps?: number;
  background?: string;
  renderRuntime?: RenderRuntime;
  rendererFamily?: RendererFamily;
  assetManifest?: AssetManifestLike;
}

function maxSceneEnd(scenes: { end_seconds: number }[]): number {
  return round3(Math.max(0.001, ...scenes.map((s) => Math.max(0, s.end_seconds))));
}

function resolveAsset(source: string | undefined, manifest?: AssetManifestLike): string {
  const raw = source ?? "";
  const hit = manifest?.assets?.find((a) => a.id === raw);
  return hit?.path || raw;
}

function sourceKind(path: string): "image" | "video" {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(path) ? "image" : "video";
}

function transition(kind?: string, durationSec?: number): ClipTransition | undefined {
  if (!kind) return undefined;
  const normalized = kind.toLowerCase();
  if (normalized === "fade") return { kind: "fade", durationSec: Math.max(0, durationSec ?? 0.25) };
  if (normalized === "crossfade" || normalized === "dissolve") {
    return { kind: "crossfade", durationSec: Math.max(0, durationSec ?? 0.35) };
  }
  return { kind: "cut", durationSec: 0 };
}

function positionToTransform(position: string | undefined, width: number, height: number): Partial<Transform> {
  switch ((position || "center").toLowerCase()) {
    case "top-left": return { x: width * 0.25, y: height * 0.25 };
    case "top-right": return { x: width * 0.75, y: height * 0.25 };
    case "bottom-left": return { x: width * 0.25, y: height * 0.75 };
    case "bottom-right": return { x: width * 0.75, y: height * 0.75 };
    case "top-center": return { x: width * 0.5, y: height * 0.2 };
    case "bottom-center": return { x: width * 0.5, y: height * 0.82 };
    default: return { x: width * 0.5, y: height * 0.5 };
  }
}

function textForScene(scene: ScenePlanArtifactScene): string {
  return scene.information_role || scene.shot_intent || scene.description || scene.id;
}

export function scenePlanArtifactToTimeline(plan: ScenePlanArtifact, opts: ArtifactTimelineOptions = {}): Timeline {
  const width = Math.max(16, Math.round(opts.width ?? 1920));
  const height = Math.max(16, Math.round(opts.height ?? 1080));
  const fps = Math.max(1, Math.round(opts.fps ?? 30));
  const durationSec = maxSceneEnd(plan.scenes);
  const video: Track = { id: "video-1", type: "video", clips: [] };
  const text: Track = { id: "text-1", type: "text", clips: [] };

  for (const scene of plan.scenes) {
    const startSec = round3(Math.max(0, scene.start_seconds));
    const duration = round3(Math.max(0.001, scene.end_seconds - scene.start_seconds));
    const clip: SolidClip = {
      id: `${scene.id}-solid`,
      type: "video",
      startSec,
      durationSec: duration,
      source: { kind: "solid", color: normalizeHex(opts.background, "0a0a0a") },
      label: scene.description,
      transitionIn: transition(scene.transition_in),
      transitionOut: transition(scene.transition_out),
    };
    video.clips.push(clip);
    text.clips.push({
      id: `${scene.id}-text`,
      type: "text",
      startSec,
      durationSec: duration,
      text: textForScene(scene),
      style: {
        fontSize: Math.max(24, Math.round(height * 0.052)),
        color: "ffffff",
        align: "center",
        maxWidthPct: 76,
        shadow: true,
      },
      transform: { x: width / 2, y: height / 2, opacity: 1 },
    });
  }

  return {
    version: "1.1",
    composition: { width, height, fps, durationSec, background: normalizeHex(opts.background, "0a0a0a") },
    tracks: [video, text],
    metadata: {
      source: "scene_plan_artifact",
      style_playbook: plan.style_playbook ?? "",
      scene_count: plan.scenes.length,
    },
  };
}

export function timelineToScenePlanArtifact(timeline: Timeline): ScenePlanArtifact {
  const textClips = timeline.tracks.flatMap((t) => t.clips).filter((c): c is TextClip => c.type === "text");
  const videoClips = timeline.tracks.flatMap((t) => t.clips).filter((c): c is SolidClip | MediaClip => c.type === "video");
  const scenes = videoClips
    .slice()
    .sort((a, b) => a.startSec - b.startSec)
    .map((clip, index): ScenePlanArtifactScene => {
      const title = textClips.find((t) => t.startSec < clip.startSec + clip.durationSec && t.startSec + t.durationSec > clip.startSec)?.text;
      return {
        id: clip.id.replace(/-(solid|media)$/, "") || `scene-${index + 1}`,
        type: clip.source.kind === "solid" ? "text_card" : "broll",
        description: title || clip.label || `Scene ${index + 1}`,
        start_seconds: round3(clip.startSec),
        end_seconds: round3(clip.startSec + clip.durationSec),
        shot_intent: clip.label,
      };
    });
  return { version: "1.0", scenes, metadata: { source: "timeline_ir" } };
}

export function editDecisionsToTimeline(edit: EditDecisionsArtifact, opts: ArtifactTimelineOptions = {}): Timeline {
  const width = Math.max(16, Math.round(opts.width ?? 1080));
  const height = Math.max(16, Math.round(opts.height ?? 1920));
  const fps = Math.max(1, Math.round(opts.fps ?? 30));
  const background = normalizeHex(opts.background, "0a0a0a");
  const primary: Track = { id: "video-primary", type: "video", clips: [] };
  const overlay: Track = { id: "video-overlays", type: "video", clips: [] };
  const text: Track = { id: "text-1", type: "text", clips: [] };
  const audio: Track = { id: "audio-1", type: "audio", clips: [] };
  let cursor = 0;

  edit.cuts.forEach((cut, index) => {
    const sourceInSec = Math.max(0, cut.in_seconds);
    const durationSec = round3(Math.max(0.001, cut.out_seconds - cut.in_seconds));
    const startSec = round3(cursor);
    const source = resolveAsset(cut.source, opts.assetManifest);
    const transform = {
      ...positionToTransform(cut.transform?.position, width, height),
      scale: cut.transform?.scale,
      opacity: 1,
    };
    const base = {
      id: cut.id || `cut-${index + 1}`,
      startSec,
      durationSec,
      transitionIn: transition(cut.transition_in, cut.transition_duration),
      transitionOut: transition(cut.transition_out, cut.transition_duration),
      transform,
      label: cut.reason || cut.title || cut.text,
    };

    if (source && !source.startsWith("solid:")) {
      const clip: MediaClip = {
        ...base,
        type: "video",
        source: { kind: sourceKind(source), path: source },
        sourceInSec,
        fit: "cover",
      };
      primary.clips.push(clip);
    } else {
      const color = source.startsWith("solid:") ? source.slice("solid:".length) : background;
      const clip: SolidClip = { ...base, type: "video", source: { kind: "solid", color: normalizeHex(color, background) } };
      primary.clips.push(clip);
    }

    const label = cut.text || cut.title || cut.subtitle;
    if (label) {
      text.clips.push({
        id: `${base.id}-text`,
        type: "text",
        startSec,
        durationSec,
        text: label,
        style: { fontSize: Math.round(height * 0.044), color: "ffffff", align: "center", maxWidthPct: 82, shadow: true },
        transform: { x: width / 2, y: height * 0.18, opacity: 1 },
      });
    }
    cursor = round3(cursor + durationSec);
  });

  for (const ov of edit.overlays ?? []) {
    const source = resolveAsset(ov.asset_id, opts.assetManifest);
    if (!source) continue;
    overlay.clips.push({
      id: `overlay-${ov.asset_id}-${overlay.clips.length + 1}`,
      type: "video",
      source: { kind: sourceKind(source), path: source },
      startSec: round3(ov.start_seconds),
      durationSec: round3(Math.max(0.001, ov.end_seconds - ov.start_seconds)),
      transform: { x: ov.position.x, y: ov.position.y, opacity: ov.opacity ?? 1 },
      box: ov.position.width && ov.position.height
        ? { wFrac: ov.position.width / width, hFrac: ov.position.height / height }
        : undefined,
      fit: "contain",
      z: 20,
    });
  }

  for (const segment of edit.audio?.narration?.segments ?? []) {
    const source = resolveAsset(segment.asset_id, opts.assetManifest);
    if (!source) continue;
    const startSec = round3(segment.start_seconds);
    const endSec = segment.end_seconds ?? startSec + 1;
    const clip: AudioClip = {
      id: `narration-${audio.clips.length + 1}`,
      type: "audio",
      source: { kind: "file", path: source },
      startSec,
      durationSec: round3(Math.max(0.001, endSec - startSec)),
      volume: 1,
    };
    audio.clips.push(clip);
  }

  const durationSec = round3(Math.max(0.001, cursor, ...overlay.clips.map((c) => c.startSec + c.durationSec), ...audio.clips.map((c) => c.startSec + c.durationSec)));
  const tracks = [primary, overlay, text, audio].filter((track) => track.clips.length > 0);
  return {
    version: "1.1",
    composition: { width, height, fps, durationSec, background },
    tracks,
    metadata: {
      source: "edit_decisions_artifact",
      render_runtime: edit.render_runtime,
      renderer_family: edit.renderer_family ?? "",
    },
  };
}

function metadataString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asRenderRuntime(value: unknown, fallback: RenderRuntime = "ffmpeg"): RenderRuntime {
  return value === "remotion" || value === "hyperframes" || value === "ffmpeg" ? value : fallback;
}

function asRendererFamily(value: unknown, fallback: RendererFamily = "animation-first"): RendererFamily {
  const families: RendererFamily[] = [
    "explainer-data",
    "explainer-teacher",
    "cinematic-trailer",
    "documentary-montage",
    "product-reveal",
    "screen-demo",
    "presenter",
    "animation-first",
  ];
  return typeof value === "string" && families.includes(value as RendererFamily) ? value as RendererFamily : fallback;
}

export function timelineToEditDecisions(
  timeline: Timeline,
  opts: { renderRuntime?: RenderRuntime; rendererFamily?: RendererFamily } = {},
): EditDecisionsArtifact {
  const cuts = timeline.tracks
    .flatMap((track) => track.clips)
    .filter((clip): clip is SolidClip | MediaClip => clip.type === "video")
    .sort((a, b) => a.startSec - b.startSec)
    .map((clip): EditDecisionCut => {
      let source: string;
      let sourceIn = 0;
      if (clip.source.kind === "solid") {
        source = `solid:${clip.source.color}`;
      } else {
        source = clip.source.path;
        sourceIn = "sourceInSec" in clip ? clip.sourceInSec ?? 0 : 0;
      }
      return {
        id: clip.id,
        source,
        in_seconds: round3(sourceIn),
        out_seconds: round3(sourceIn + clip.durationSec),
        transform: {
          scale: clip.transform?.scale,
          position: "custom",
        },
        reason: clip.label,
      };
    });
  const runtime = opts.renderRuntime ?? asRenderRuntime(timeline.metadata?.render_runtime);
  return {
    version: "1.0",
    cuts,
    render_runtime: runtime,
    renderer_family: opts.rendererFamily ?? asRendererFamily(timeline.metadata?.renderer_family),
    metadata: {
      source: "timeline_ir",
      timeline_cut_starts: cuts.map((cut) => {
        const clip = timeline.tracks.flatMap((track) => track.clips).find((c) => c.id === cut.id);
        return clip?.startSec ?? 0;
      }),
    },
  };
}
