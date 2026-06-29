import {
  timelineToEditDecisions,
  type EditDecisionsArtifact,
  type Timeline,
  type Track,
} from "../../core/src/index";
import type { Caption } from "../../render-ffmpeg/src/index";
import type { ReelTreatmentPlan, ReelUnderstandingLike } from "./reelPlanner";

export interface ReelArtifactInput {
  inputPath: string;
  understanding: ReelUnderstandingLike;
  plan: ReelTreatmentPlan;
  captions?: Caption[];
}

export interface ReelArtifacts {
  timeline: Timeline;
  editDecisions: EditDecisionsArtifact;
}

function hex(input: string | undefined, fallback: string): string {
  const raw = (input || fallback).replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : fallback;
}

function durationFromWindow(startSec: number, endSec: number, durationSec: number): number {
  return Math.max(0.001, Math.min(durationSec, endSec) - Math.max(0, startSec));
}

function hookDuration(plan: ReelTreatmentPlan, durationSec: number): number {
  const startSec = plan.timing.hookStartSec ?? 0;
  if (plan.timing.hookDurationSec != null) return Math.min(durationSec - startSec, plan.timing.hookDurationSec);
  const firstBeat = plan.beats[0];
  if (firstBeat) return durationFromWindow(firstBeat.startSec, firstBeat.endSec, durationSec);
  return Math.max(0.001, durationSec - startSec);
}

export function createReelArtifacts(input: ReelArtifactInput): ReelArtifacts {
  const { inputPath, understanding, plan } = input;
  const width = understanding.tags.includes("horizontal") ? 1920 : 1080;
  const height = understanding.tags.includes("horizontal") ? 1080 : 1920;
  const durationSec = Math.max(0.001, understanding.durationSec);
  const accent = hex(plan.renderStyle.accent, "ffffff");
  const textColor = hex(plan.renderStyle.captionColor, "ffffff");

  const video: Track = {
    id: "video-source",
    type: "video",
    clips: [
      {
        id: "source-footage",
        type: "video",
        source: { kind: "video", path: inputPath },
        startSec: 0,
        durationSec,
        sourceInSec: 0,
        fit: "cover",
        label: plan.inputKind,
        z: 0,
      },
    ],
  };

  const text: Track = { id: "text-overlays", type: "text", clips: [] };
  if (plan.hook) {
    text.clips.push({
      id: "hook",
      type: "text",
      startSec: plan.timing.hookStartSec ?? 0,
      durationSec: hookDuration(plan, durationSec),
      text: plan.hook,
      style: { color: accent, align: "center", maxWidthPct: 86, shadow: true },
      z: 30,
    });
  }

  for (const [index, beat] of plan.beats.entries()) {
    text.clips.push({
      id: `beat-${index + 1}`,
      type: "text",
      startSec: beat.startSec,
      durationSec: Math.max(0.001, beat.endSec - beat.startSec),
      text: beat.subtitle ? `${beat.title}: ${beat.subtitle}` : beat.title,
      style: { color: hex(beat.accent, accent), align: "left", maxWidthPct: 82, shadow: true },
      z: 35,
    });
  }

  for (const [index, caption] of (input.captions ?? []).entries()) {
    text.clips.push({
      id: `caption-${index + 1}`,
      type: "text",
      startSec: caption.startSec,
      durationSec: Math.max(0.001, caption.endSec - caption.startSec),
      text: caption.text,
      style: { color: textColor, align: "center", maxWidthPct: 86, shadow: true },
      z: 40,
    });
  }

  const audio: Track = {
    id: "audio-source",
    type: "audio",
    clips: [
      {
        id: "source-audio",
        type: "audio",
        source: { kind: "file", path: inputPath },
        startSec: 0,
        durationSec,
        volume: 1,
      },
    ],
  };

  const timeline: Timeline = {
    version: "1.1",
    composition: {
      width,
      height,
      fps: 30,
      durationSec,
      background: "000000",
    },
    tracks: [video, text, audio].filter((track) => track.clips.length > 0),
    metadata: {
      source: "reel_treatment",
      reel_style: plan.style,
      input_kind: plan.inputKind,
      prompt: plan.promptSummary,
      render_runtime: "ffmpeg",
      renderer_family: plan.style === "warfront-documentary" ? "documentary-montage" : "presenter",
      visual_directives: plan.visualDirectives,
      edit_intent: plan.editIntent,
      timing_policy: "content-derived",
    },
  };

  const editDecisions = timelineToEditDecisions(timeline, {
    renderRuntime: "ffmpeg",
    rendererFamily: plan.style === "warfront-documentary" ? "documentary-montage" : "presenter",
  });
  editDecisions.metadata = {
    ...(editDecisions.metadata ?? {}),
    reel_style: plan.style,
    input_kind: plan.inputKind,
    visual_directives: plan.visualDirectives,
  };

  return { timeline, editDecisions };
}
