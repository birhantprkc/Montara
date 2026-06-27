// Delivery-promise classifier and cut validator.

export enum PromiseType {
  MOTION_LED = "motion_led",
  SOURCE_LED = "source_led",
  DATA_EXPLAINER = "data_explainer",
  TEACHER_EXPLAINER = "teacher_explainer",
  SCREEN_DEMO = "screen_demo",
  AVATAR_PRESENTER = "avatar_presenter",
  HYBRID = "hybrid",
  LOCALIZATION = "localization",
}

export interface PromiseRule {
  still_fallback_allowed: boolean;
  requires_video_generation: boolean;
  min_motion_ratio: number;
  description: string;
}

export const PROMISE_RULES: Record<string, PromiseRule> = {
  motion_led: {
    still_fallback_allowed: false,
    requires_video_generation: true,
    min_motion_ratio: 0.7,
    description: "Video's quality depends on real motion - generated video clips, footage, or animation.",
  },
  source_led: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.3,
    description: "User-provided footage is the primary medium. Generated assets fill gaps only.",
  },
  data_explainer: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.0,
    description: "Data visualization and explanation. Motion graphics preferred but images acceptable.",
  },
  teacher_explainer: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.0,
    description: "Educational content. Clarity and comprehension over spectacle.",
  },
  screen_demo: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.0,
    description: "Screen recording or product demo. Legibility over cinematic dressing.",
  },
  avatar_presenter: {
    still_fallback_allowed: false,
    requires_video_generation: true,
    min_motion_ratio: 0.3,
    description: "AI avatar or talking head presentation. Requires video generation for presenter.",
  },
  hybrid: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.2,
    description: "Mix of source footage, generated content, and graphics.",
  },
  localization: {
    still_fallback_allowed: true,
    requires_video_generation: false,
    min_motion_ratio: 0.0,
    description: "Translation/dubbing of existing video. Preserving source timing and clarity.",
  },
};

export type ToneMode = "cinematic" | "educational" | "corporate" | "playful" | "raw" | string;
export type QualityFloor = "draft" | "presentable" | "broadcast" | string;
export type ApprovedFallback = "animatic" | "still_led" | null;

export interface DeliveryPromiseFields {
  promise_type: PromiseType;
  motion_required: boolean;
  source_required: boolean;
  tone_mode: ToneMode;
  quality_floor: QualityFloor;
  approved_fallback?: ApprovedFallback;
}

export interface DeliveryPromiseObject {
  promise_type: string;
  motion_required: boolean;
  source_required: boolean;
  tone_mode: string;
  quality_floor: string;
  approved_fallback: string | null;
}

export interface EditCut {
  source?: string;
  type?: string;
  [key: string]: unknown;
}

export interface CutValidation {
  valid: boolean;
  violations: string[];
  motion_ratio: number;
  motion_cuts?: number;
  slide_cuts?: number;
  still_cuts?: number;
}

const SLIDE_GRAMMAR_TYPES = new Set([
  "text_card",
  "stat_card",
  "chart",
  "bar_chart",
  "line_chart",
  "pie_chart",
  "kpi_grid",
  "comparison",
  "progress",
  "callout",
]);

const REAL_MOTION_TYPES = new Set(["video", "animation", "avatar"]);
const MOTION_EXTENSIONS = new Set(["mp4", "mov", "webm", "avi", "mkv"]);

function coercePromiseType(value: unknown): PromiseType {
  for (const type of Object.values(PromiseType)) {
    if (value === type) return type;
  }
  throw new Error(`Unknown delivery promise type '${String(value)}'`);
}

function coerceApprovedFallback(value: unknown): ApprovedFallback {
  return value === "animatic" || value === "still_led" ? value : null;
}

function percent0(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export class DeliveryPromise {
  promise_type: PromiseType;
  motion_required: boolean;
  source_required: boolean;
  tone_mode: ToneMode;
  quality_floor: QualityFloor;
  approved_fallback: ApprovedFallback;

  constructor(fields: DeliveryPromiseFields) {
    this.promise_type = fields.promise_type;
    this.motion_required = fields.motion_required;
    this.source_required = fields.source_required;
    this.tone_mode = fields.tone_mode;
    this.quality_floor = fields.quality_floor;
    this.approved_fallback = fields.approved_fallback ?? null;
  }

  toDict(): DeliveryPromiseObject {
    return {
      promise_type: this.promise_type,
      motion_required: this.motion_required,
      source_required: this.source_required,
      tone_mode: this.tone_mode,
      quality_floor: this.quality_floor,
      approved_fallback: this.approved_fallback,
    };
  }

  toJSON(): DeliveryPromiseObject {
    return this.toDict();
  }

  static fromDict(data: DeliveryPromiseObject | Record<string, unknown>): DeliveryPromise {
    return new DeliveryPromise({
      promise_type: coercePromiseType(data.promise_type),
      motion_required: typeof data.motion_required === "boolean" ? data.motion_required : false,
      source_required: typeof data.source_required === "boolean" ? data.source_required : false,
      tone_mode: typeof data.tone_mode === "string" ? data.tone_mode : "corporate",
      quality_floor: typeof data.quality_floor === "string" ? data.quality_floor : "presentable",
      approved_fallback: coerceApprovedFallback(data.approved_fallback),
    });
  }

  getRules(): PromiseRule | Record<string, never> {
    return PROMISE_RULES[this.promise_type] ?? {};
  }

  validateCuts(cuts: EditCut[]): CutValidation {
    const rules = this.getRules();
    const violations: string[] = [];

    if (!cuts.length) {
      return { valid: false, violations: ["No cuts provided"], motion_ratio: 0.0 };
    }

    let motionCuts = 0;
    let slideCuts = 0;
    let stillCuts = 0;

    for (const cut of cuts) {
      const source = typeof cut.source === "string" ? cut.source : "";
      const cutType = typeof cut.type === "string" ? cut.type : "";
      let isMotion = false;
      let isSlide = false;

      if (source) {
        const ext = source.includes(".") ? source.split(".").pop()?.toLowerCase() ?? "" : "";
        if (MOTION_EXTENSIONS.has(ext)) isMotion = true;
      }
      if (REAL_MOTION_TYPES.has(cutType)) isMotion = true;
      else if (SLIDE_GRAMMAR_TYPES.has(cutType)) isSlide = true;

      if (isMotion) motionCuts += 1;
      else if (isSlide) slideCuts += 1;
      else stillCuts += 1;
    }

    const total = motionCuts + slideCuts + stillCuts;
    const motionRatio = total > 0 ? motionCuts / total : 0.0;
    const minRatio = "min_motion_ratio" in rules ? rules.min_motion_ratio : 0.0;

    if (this.motion_required && motionRatio < minRatio) {
      violations.push(
        `Motion ratio ${percent0(motionRatio)} is below minimum ${percent0(minRatio)} ` +
        `for ${this.promise_type}. ${motionCuts}/${total} cuts have real motion ` +
        `(${slideCuts} are animated slides which do not count as motion).`,
      );
    }

    const nonMotion = slideCuts + stillCuts;
    const stillFallbackAllowed = "still_fallback_allowed" in rules ? rules.still_fallback_allowed : true;
    if (!stillFallbackAllowed && nonMotion > total * 0.5) {
      if (this.approved_fallback !== "still_led") {
        violations.push(
          `${this.promise_type} does not allow still-led fallback, ` +
          `but ${nonMotion}/${total} cuts are non-motion (stills + animated slides). ` +
          "User must approve 'still_led' fallback or provide motion content.",
        );
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      motion_ratio: motionRatio,
      motion_cuts: motionCuts,
      slide_cuts: slideCuts,
      still_cuts: stillCuts,
    };
  }
}

export function classifyFromBrief(pipelineType: string, userIntent: Record<string, unknown>): DeliveryPromise {
  const pipelineDefaults: Record<string, PromiseType> = {
    cinematic: PromiseType.MOTION_LED,
    "animated-explainer": PromiseType.DATA_EXPLAINER,
    animation: PromiseType.MOTION_LED,
    "talking-head": PromiseType.AVATAR_PRESENTER,
    "avatar-spokesperson": PromiseType.AVATAR_PRESENTER,
    "screen-demo": PromiseType.SCREEN_DEMO,
    hybrid: PromiseType.HYBRID,
    "localization-dub": PromiseType.LOCALIZATION,
    "podcast-repurpose": PromiseType.SOURCE_LED,
    "clip-factory": PromiseType.SOURCE_LED,
  };

  let promiseType = pipelineDefaults[pipelineType] ?? PromiseType.HYBRID;

  if (userIntent.motion_required === false && promiseType === PromiseType.MOTION_LED) {
    promiseType = PromiseType.HYBRID;
  }

  const motionRequired = typeof userIntent.motion_required === "boolean"
    ? userIntent.motion_required
    : promiseType === PromiseType.MOTION_LED || promiseType === PromiseType.AVATAR_PRESENTER;

  const sourceRequired = Boolean(userIntent.has_footage);
  if (sourceRequired && promiseType !== PromiseType.SOURCE_LED && promiseType !== PromiseType.LOCALIZATION) {
    promiseType = PromiseType.SOURCE_LED;
  }

  return new DeliveryPromise({
    promise_type: promiseType,
    motion_required: motionRequired,
    source_required: sourceRequired,
    tone_mode: typeof userIntent.tone === "string" ? userIntent.tone : "corporate",
    quality_floor: typeof userIntent.quality === "string" ? userIntent.quality : "presentable",
  });
}

export const classifyDeliveryPromiseFromBrief = classifyFromBrief;
