// @montara/quality — provider and production-path scoring engine.
// Replaces naive "first available" selection with a weighted, multi-dimensional,
// fully explainable score. Scores are normalized 0-1; higher is better.
//
// A scorable tool is anything exposing getInfo()/getStatus()/estimateCost() — the
// BaseTool contract. Status is returned as a plain string ("available"/"degraded"/
// "unavailable"), so reliability branches read it directly (no enum .value step).

export interface ScorableTool {
  getInfo(): Record<string, unknown>;
  getStatus(): string;
  estimateCost(inputs: Record<string, unknown>): number;
}

// ---------------------------------------------------------------------------
// Provider Score
// ---------------------------------------------------------------------------

export interface ProviderScoreFields {
  tool_name: string;
  provider: string;
  task_fit?: number;
  output_quality?: number;
  control?: number;
  reliability?: number;
  cost_efficiency?: number;
  latency?: number;
  continuity?: number;
}

/** Scored evaluation of a provider against a specific task context. */
export class ProviderScore {
  tool_name: string;
  provider: string;
  task_fit: number;
  output_quality: number;
  control: number;
  reliability: number;
  cost_efficiency: number;
  latency: number;
  continuity: number;

  constructor(fields: ProviderScoreFields) {
    this.tool_name = fields.tool_name;
    this.provider = fields.provider;
    this.task_fit = fields.task_fit ?? 0.0;
    this.output_quality = fields.output_quality ?? 0.0;
    this.control = fields.control ?? 0.0;
    this.reliability = fields.reliability ?? 0.0;
    this.cost_efficiency = fields.cost_efficiency ?? 0.0;
    this.latency = fields.latency ?? 0.0;
    this.continuity = fields.continuity ?? 0.0;
  }

  get weighted_score(): number {
    return (
      this.task_fit * 0.30 +
      this.output_quality * 0.20 +
      this.control * 0.15 +
      this.reliability * 0.15 +
      this.cost_efficiency * 0.10 +
      this.latency * 0.05 +
      this.continuity * 0.05
    );
  }

  toDict(): Record<string, number | string> {
    return {
      tool_name: this.tool_name,
      provider: this.provider,
      task_fit: this.task_fit,
      output_quality: this.output_quality,
      control: this.control,
      reliability: this.reliability,
      cost_efficiency: this.cost_efficiency,
      latency: this.latency,
      continuity: this.continuity,
      weighted_score: this.weighted_score,
    };
  }

  /** Human-readable explanation of this score. */
  explain(): string {
    const parts = [`${this.tool_name} (${this.provider}): ${this.weighted_score.toFixed(2)}`];
    const dims: [string, number, number][] = [
      ["task_fit", this.task_fit, 0.30],
      ["output_quality", this.output_quality, 0.20],
      ["control", this.control, 0.15],
      ["reliability", this.reliability, 0.15],
      ["cost_efficiency", this.cost_efficiency, 0.10],
      ["latency", this.latency, 0.05],
      ["continuity", this.continuity, 0.05],
    ];
    const top = [...dims].sort((a, b) => b[1] * b[2] - a[1] * a[2]);
    for (const [name, val, weight] of top.slice(0, 3)) {
      parts.push(`  ${name}=${val.toFixed(2)} (w=${weight})`);
    }
    return parts.join("\n");
  }
}

// ---------------------------------------------------------------------------
// Production Path Score
// ---------------------------------------------------------------------------

export interface ProductionPathScoreFields {
  path_label: string;
  delivery_fit?: number;
  quality_fit?: number;
  capability_confidence?: number;
  fallback_integrity?: number;
  budget_fit?: number;
  speed_fit?: number;
  controllability?: number;
  consistency_fit?: number;
}

/** Scored evaluation of an entire production path. */
export class ProductionPathScore {
  path_label: string;
  delivery_fit: number;
  quality_fit: number;
  capability_confidence: number;
  fallback_integrity: number;
  budget_fit: number;
  speed_fit: number;
  controllability: number;
  consistency_fit: number;

  constructor(fields: ProductionPathScoreFields) {
    this.path_label = fields.path_label;
    this.delivery_fit = fields.delivery_fit ?? 0.0;
    this.quality_fit = fields.quality_fit ?? 0.0;
    this.capability_confidence = fields.capability_confidence ?? 0.0;
    this.fallback_integrity = fields.fallback_integrity ?? 0.0;
    this.budget_fit = fields.budget_fit ?? 0.0;
    this.speed_fit = fields.speed_fit ?? 0.0;
    this.controllability = fields.controllability ?? 0.0;
    this.consistency_fit = fields.consistency_fit ?? 0.0;
  }

  get weighted_score(): number {
    return (
      this.delivery_fit * 0.25 +
      this.quality_fit * 0.20 +
      this.capability_confidence * 0.15 +
      this.fallback_integrity * 0.10 +
      this.budget_fit * 0.10 +
      this.speed_fit * 0.08 +
      this.controllability * 0.07 +
      this.consistency_fit * 0.05
    );
  }

  toDict(): Record<string, number | string> {
    return {
      path_label: this.path_label,
      delivery_fit: this.delivery_fit,
      quality_fit: this.quality_fit,
      capability_confidence: this.capability_confidence,
      fallback_integrity: this.fallback_integrity,
      budget_fit: this.budget_fit,
      speed_fit: this.speed_fit,
      controllability: this.controllability,
      consistency_fit: this.consistency_fit,
      weighted_score: this.weighted_score,
    };
  }
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Overlap coefficient |A ∩ B| / min(|A|, |B|) — not Jaccard. Answers "is the
 * intent a subset of what this tool advertises?" which is what scoring needs. */
function keywordOverlap(setA: Set<string>, setB: Set<string>): number {
  if (!setA.size || !setB.size) return 0.0;
  const a = new Set([...setA].map((s) => s.toLowerCase().trim()));
  const b = new Set([...setB].map((s) => s.toLowerCase().trim()));
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  const smaller = Math.min(a.size, b.size);
  return smaller > 0 ? intersection / smaller : 0.0;
}

// Semantic synonym clusters: when intent says "cinematic" and a tool says "film"
// or "movie", that's a match even without literal keyword overlap.
const SYNONYM_CLUSTERS: Set<string>[] = [
  new Set(["cinematic", "film", "movie", "trailer", "dramatic", "epic"]),
  new Set(["explainer", "educational", "tutorial", "teaching", "lesson"]),
  new Set(["corporate", "business", "professional", "enterprise"]),
  new Set(["social", "tiktok", "instagram", "reels", "shorts", "viral"]),
  new Set(["animation", "animated", "motion-graphics", "motion", "kinetic"]),
  new Set(["pixar", "animation", "animated", "stylized", "storybook", "character"]),
  new Set(["realistic", "photorealistic", "lifelike", "natural"]),
  new Set(["stock", "footage", "b-roll", "library"]),
  new Set(["avatar", "presenter", "talking-head", "spokesperson"]),
  new Set(["voiceover", "narration", "speech", "voice"]),
  new Set(["music", "soundtrack", "background-music", "score", "ambient"]),
];

const TOKEN_RE = /[a-z0-9][a-z0-9+._-]*/g;
const GENERATED_VISUAL_TERMS = new Set([
  "animated", "animation", "anime", "cartoon", "character", "cinematic", "concept",
  "fantasy", "ghibli", "illustration", "pixar", "render", "scifi", "short", "story",
  "stylized", "surreal",
]);
const REFERENCE_TERMS = new Set([
  "character", "consistency", "identity", "preserve", "product", "reference",
  "subject", "wardrobe",
]);
const IMAGE_EDIT_TERMS = new Set([
  "combine", "composite", "edit", "merge", "modify", "repaint", "replace",
  "style-transfer", "transfer",
]);

function tokenizeText(value: string): string[] {
  return (value || "").toLowerCase().match(TOKEN_RE) ?? [];
}

/** Expand a word set with synonyms from known clusters. */
function expandSynonyms(words: Set<string>): Set<string> {
  const expanded = new Set(words);
  for (const cluster of SYNONYM_CLUSTERS) {
    let intersects = false;
    for (const w of expanded) {
      if (cluster.has(w)) { intersects = true; break; }
    }
    if (intersects) for (const c of cluster) expanded.add(c);
  }
  return expanded;
}

/** Score how well a tool's best_for matches the task intent and style. */
function computeTaskFit(bestFor: Set<string>, intent: string, styleKeywords: Set<string>): number {
  if (!bestFor.size) return 0.3; // Unknown capability — modest default

  const intentWords = expandSynonyms(new Set(tokenizeText(intent)));
  let bestForWords = new Set<string>();
  for (const desc of bestFor) for (const t of tokenizeText(desc)) bestForWords.add(t);
  bestForWords = expandSynonyms(bestForWords);

  const intentScore = keywordOverlap(intentWords, bestForWords);

  const styleExpanded = expandSynonyms(new Set([...styleKeywords].map((kw) => kw.toLowerCase())));
  const styleScore = keywordOverlap(styleExpanded, bestForWords);

  return Math.min(1.0, intentScore * 0.7 + styleScore * 0.3 + 0.1);
}

/** Score controllability from the supports dict. Features weighted by creative impact. */
function computeControl(supports: Record<string, unknown>): number {
  const controlFeatures: [string, number][] = [
    ["controlnet", 2.0],
    ["reference_image", 1.8],
    ["style_transfer", 1.5],
    ["inpainting", 1.5],
    ["img2img", 1.3],
    ["negative_prompt", 1.0],
    ["custom_size", 0.8],
    ["aspect_ratio", 0.7],
    ["seed", 0.5],
  ];
  if (!supports || Object.keys(supports).length === 0) return 0.3;
  const totalWeight = controlFeatures.reduce((sum, [, w]) => sum + w, 0);
  let earned = 0;
  for (const [f, w] of controlFeatures) if (supports[f]) earned += w;
  return Math.min(1.0, earned / (totalWeight * 0.5));
}

/** Score cost efficiency. Free is 1.0, over-budget is 0.0. */
function computeCostEfficiency(estimatedCost: number, budgetRemaining: number | null | undefined): number {
  if (estimatedCost <= 0) return 1.0;
  if (budgetRemaining != null && budgetRemaining <= 0) return 0.0;
  if (budgetRemaining != null) {
    const ratio = estimatedCost / budgetRemaining;
    if (ratio > 0.5) return 0.1;
    if (ratio > 0.2) return 0.5;
    return 0.8;
  }
  if (estimatedCost < 0.05) return 0.9;
  if (estimatedCost < 0.20) return 0.7;
  if (estimatedCost < 1.00) return 0.5;
  return 0.3;
}

/** Score how well this provider fits already-locked decisions. */
function computeContinuity(provider: string, lockedProviders: Set<string>): number {
  if (!lockedProviders.size) return 0.5; // No prior context
  if (lockedProviders.has(provider)) return 0.9; // Same provider = likely consistent style
  return 0.4; // Different provider = possible style break
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Normalize loose task context into the scorer's expected shape. */
export function normalizeTaskContext(
  taskContext: Record<string, unknown> | null | undefined,
  opts: { prompt?: string; capability?: string; operation?: string } = {},
): Record<string, unknown> {
  const prompt = opts.prompt ?? "";
  const capability = opts.capability ?? "";
  const operation = opts.operation ?? "";
  const context: Record<string, unknown> = { ...(taskContext ?? {}) };

  let needs = context.needs ?? [];
  if (typeof needs === "string") needs = [needs];
  const needsArr = asArray(needs);

  const textFragments: string[] = [];
  for (const key of ["intent", "style", "brief", "goal", "platform"]) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) textFragments.push(value.trim());
  }
  for (const item of needsArr) {
    const s = String(item).trim();
    if (s) textFragments.push(s);
  }
  if (prompt.trim()) textFragments.push(prompt.trim());

  const combinedText = textFragments.join(" ").trim();
  if (!context.intent) context.intent = combinedText;

  const styleKeywords = new Set<string>();
  for (const item of asArray(context.style_keywords)) {
    const s = String(item).toLowerCase().trim();
    if (s) styleKeywords.add(s);
  }
  for (const source of [context.style, context.platform, ...needsArr]) {
    if (typeof source === "string") for (const t of tokenizeText(source)) styleKeywords.add(t);
  }
  context.style_keywords = [...styleKeywords].sort();

  if (!context.asset_type) {
    const assetTypeMap: Record<string, string> = {
      video_generation: "video",
      image_generation: "image",
      tts: "voice",
      music_generation: "music",
    };
    if (capability in assetTypeMap) context.asset_type = assetTypeMap[capability];
  }

  if (!("motion_required" in context) && capability === "video_generation") {
    context.motion_required = true;
  }

  if (!("budget_remaining_usd" in context) && context.budget_usd != null) {
    context.budget_remaining_usd = context.budget_usd;
  }

  const textTokens = new Set(tokenizeText(combinedText));
  const intersects = (a: Set<string>, b: Set<string>): boolean => {
    for (const x of a) if (b.has(x)) return true;
    return false;
  };
  context.prefers_generated_visuals = intersects(textTokens, GENERATED_VISUAL_TERMS);
  context.wants_reference_conditioning =
    operation === "reference_to_video" || intersects(textTokens, REFERENCE_TERMS);
  context.wants_image_editing =
    operation === "edit" || intersects(textTokens, IMAGE_EDIT_TERMS);

  return context;
}

function isStockLikeProvider(info: Record<string, unknown>): boolean {
  const provider = asString(info.provider).toLowerCase();
  if (provider === "pexels" || provider === "pixabay") return true;
  const words = new Set<string>();
  for (const desc of asArray(info.best_for)) for (const t of tokenizeText(String(desc))) words.add(t);
  const stockWords = new Set(["stock", "footage", "b-roll", "library"]);
  for (const w of words) if (stockWords.has(w)) return true;
  return false;
}

/** Score a provider against a task context. */
export function scoreProvider(tool: ScorableTool, taskContext: Record<string, unknown>): ProviderScore {
  const ctx = normalizeTaskContext(taskContext);
  const info = tool.getInfo();
  const status = tool.getStatus();

  const bestFor = new Set<string>(asArray(info.best_for).map((s) => String(s)));
  const intent = asString(ctx.intent);
  const styleKeywords = new Set<string>(asArray(ctx.style_keywords).map((s) => String(s)));

  let taskFit = computeTaskFit(bestFor, intent, styleKeywords);

  // Reliability: historical success rate if tracked, else availability status.
  const histSuccess = asNumberOrNull(info.historical_success_rate);
  let reliability: number;
  if (histSuccess !== null) {
    reliability = histSuccess;
  } else if (status === "available") {
    reliability = info.stability === "production" ? 0.95 : 0.8;
  } else if (status === "degraded") {
    reliability = 0.4;
  } else {
    reliability = 0.0;
  }

  const control0 = computeControl(asRecord(info.supports));
  let control = control0;

  let estimatedCost: number;
  try {
    estimatedCost = tool.estimateCost(ctx);
  } catch {
    estimatedCost = 0.0;
  }
  const costEfficiency = computeCostEfficiency(estimatedCost, asNumberOrNull(ctx.budget_remaining_usd));

  // Latency: measured p50 if available, else runtime-class heuristic.
  const measuredP50 = asNumberOrNull(info.latency_p50_seconds);
  let latency: number;
  if (measuredP50 !== null) {
    if (measuredP50 <= 1.0) latency = 1.0;
    else if (measuredP50 <= 10.0) latency = 0.8;
    else if (measuredP50 <= 30.0) latency = 0.6;
    else if (measuredP50 <= 60.0) latency = 0.4;
    else latency = 0.2;
  } else {
    const runtime = asString(info.runtime, "api");
    if (runtime === "local" || runtime === "local_gpu") latency = 0.9;
    else if (runtime === "hybrid") latency = 0.6;
    else latency = 0.4;
  }

  const continuity = computeContinuity(
    asString(info.provider),
    new Set(asArray(ctx.locked_providers).map((s) => String(s))),
  );

  // Output quality: measured score if tracked, else stability + tier.
  const measuredQuality = asNumberOrNull(info.quality_score);
  let outputQuality: number;
  if (measuredQuality !== null) {
    outputQuality = measuredQuality;
  } else {
    const stability = asString(info.stability, "experimental");
    const tier = asString(info.tier);
    const qualityMap: Record<string, number> = { production: 0.9, beta: 0.7, experimental: 0.4 };
    outputQuality = qualityMap[stability] ?? 0.5;
    if (tier === "generate" && stability === "production") {
      outputQuality = Math.min(1.0, outputQuality + 0.05);
    }
  }

  // Motion-required penalty: task needs motion but tool is image-only.
  if (ctx.motion_required && ctx.asset_type === "video") {
    const cap = asString(info.capability);
    if (!cap.includes("video")) taskFit *= 0.2;
  }

  const supports = asRecord(info.supports);
  const stockLike = isStockLikeProvider(info);
  const assetType = ctx.asset_type;

  if (ctx.prefers_generated_visuals && stockLike && (assetType === "video" || assetType === "image")) {
    taskFit *= 0.55;
    outputQuality *= 0.85;
  }

  if (ctx.wants_reference_conditioning && assetType === "video") {
    if (supports.reference_to_video || supports.reference_image || supports.multiple_reference_images) {
      taskFit = Math.min(1.0, taskFit + 0.18);
      control = Math.min(1.0, control + 0.12);
    } else {
      taskFit *= 0.7;
    }
  }

  if (ctx.wants_image_editing && assetType === "image") {
    if (supports.image_edit || supports.style_transfer || supports.multiple_reference_images) {
      taskFit = Math.min(1.0, taskFit + 0.18);
      control = Math.min(1.0, control + 0.10);
    } else {
      taskFit *= 0.7;
    }
  }

  // Premium-cinematic bonus: cinematic/trailer intent rewards premium feature sets
  // (native synchronized audio, multi-shot, camera direction, lip-sync, cinematic quality).
  if (assetType === "video") {
    const intentWords = new Set([
      ...expandSynonyms(new Set(intent.toLowerCase().split(" "))),
      ...styleKeywords,
    ]);
    const cinematicSet = new Set(["cinematic", "film", "movie", "trailer", "teaser", "dramatic", "epic", "premium"]);
    let cinematicSignal = false;
    for (const w of intentWords) if (cinematicSet.has(w)) { cinematicSignal = true; break; }
    if (cinematicSignal) {
      const premiumFeatures = [
        supports.native_audio, supports.multi_shot, supports.camera_direction,
        supports.lip_sync, supports.cinematic_quality,
      ];
      const matched = premiumFeatures.filter((f) => f).length;
      if (matched >= 3) {
        taskFit = Math.min(1.0, taskFit + 0.15);
        outputQuality = Math.min(1.0, outputQuality + 0.10);
      } else if (matched >= 1) {
        taskFit = Math.min(1.0, taskFit + 0.05);
      }
    }
  }

  return new ProviderScore({
    tool_name: asString(info.name, "unknown"),
    provider: asString(info.provider, "unknown"),
    task_fit: Math.min(1.0, taskFit),
    output_quality: outputQuality,
    control,
    reliability,
    cost_efficiency: costEfficiency,
    latency,
    continuity,
  });
}

/** Rank a list of tools by weighted score for a task context (best-first). */
export function rankProviders(tools: ScorableTool[], taskContext: Record<string, unknown>): ProviderScore[] {
  const scores = tools.map((t) => scoreProvider(t, taskContext));
  return scores.sort((a, b) => b.weighted_score - a.weighted_score);
}

/** Format a ranking list for user presentation. */
export function formatRanking(rankings: ProviderScore[], topN = 5): string {
  const lines: string[] = [];
  rankings.slice(0, topN).forEach((r, i) => {
    lines.push(
      `  ${i + 1}. ${r.tool_name} (${r.provider}) — ` +
      `score: ${r.weighted_score.toFixed(2)} ` +
      `[fit=${r.task_fit.toFixed(1)} quality=${r.output_quality.toFixed(1)} ` +
      `control=${r.control.toFixed(1)} reliable=${r.reliability.toFixed(1)} ` +
      `cost=${r.cost_efficiency.toFixed(1)}]`,
    );
  });
  return lines.join("\n");
}
