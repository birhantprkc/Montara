// @montara/research — live web research (Intelligence §H).
// Plans 15-25 searches across YouTube/Reddit/HackerNews/news/academic before scripting. Network
// is opt-in and pluggable via a SearchFn; with no search function it degrades to a deterministic
// offline brief, so a run always has context and the test gates stay hermetic (zero keys).

import { DecisionTrail, clamp01 } from "../../quality/src/audit";

export type ResearchSource = "youtube" | "reddit" | "hackernews" | "news" | "academic";

export const RESEARCH_SOURCES: ResearchSource[] = ["youtube", "reddit", "hackernews", "news", "academic"];

export interface ResearchQuery {
  source: ResearchSource;
  query: string;
}

export interface ResearchFinding {
  source: ResearchSource;
  title: string;
  url?: string;
  summary: string;
  /** 0..1 */
  relevance: number;
}

export interface ResearchBundle {
  idea: string;
  queries: ResearchQuery[];
  findings: ResearchFinding[];
  angles: string[];
  keyClaims: string[];
  online: boolean;
}

export type SearchFn = (q: ResearchQuery) => ResearchFinding[];

function keywords(idea: string): string[] {
  const stop = new Set([
    "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "with",
    "how", "why", "what", "is", "are", "vs", "at",
  ]);
  const words = idea.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  return words.length ? Array.from(new Set(words)) : ["topic"];
}

const ANGLE_TEMPLATES = [
  "what most explainers get wrong about",
  "the overlooked mechanism behind",
  "who actually wins and loses in",
  "the numbers that reframe",
  "a short history of",
];

export function planResearchQueries(idea: string, opts: { maxQueries?: number } = {}): ResearchQuery[] {
  const kw = keywords(idea);
  const phrase = kw.slice(0, 4).join(" ");
  const perSource: Record<ResearchSource, string[]> = {
    youtube: [`${phrase} explained`, `${phrase} documentary`, `${phrase} breakdown`],
    reddit: [`${phrase} discussion`, `${phrase} eli5`, `${kw[0] ?? "topic"} subreddit`],
    hackernews: [`${phrase}`, `${phrase} analysis`, `${phrase} discussion`],
    news: [`${phrase} latest`, `${phrase} report`, `${phrase} data`],
    academic: [`${phrase} study`, `${phrase} review`, `${phrase} statistics`],
  };
  const queries: ResearchQuery[] = [];
  for (const source of RESEARCH_SOURCES) {
    for (const q of perSource[source]) queries.push({ source, query: q });
  }
  // §H asks for 15-25 searches; clamp into that band.
  const cap = Math.min(25, Math.max(15, opts.maxQueries ?? queries.length));
  return queries.slice(0, cap);
}

function offlineFindings(queries: ResearchQuery[]): ResearchFinding[] {
  return queries.slice(0, 8).map((q, i) => ({
    source: q.source,
    title: `Offline brief: ${q.query}`,
    summary: `Synthesized Stage-1 context for "${q.query}" (no network; deterministic).`,
    relevance: clamp01(0.8 - i * 0.05),
  }));
}

export function runResearch(
  idea: string,
  opts: { maxQueries?: number; search?: SearchFn; trail?: DecisionTrail } = {},
): ResearchBundle {
  const queries = planResearchQueries(idea, opts);
  const online = Boolean(opts.search);
  const findings: ResearchFinding[] = [];
  if (opts.search) {
    for (const q of queries) {
      try { findings.push(...opts.search(q)); } catch { /* a dead source never blocks a run */ }
    }
  }
  if (!findings.length) findings.push(...offlineFindings(queries));

  const kw = keywords(idea);
  const angles = ANGLE_TEMPLATES.map((t) => `${t} ${kw.slice(0, 3).join(" ")}`.trim());
  const keyClaims = findings.slice(0, 5).map((f) => f.title);

  opts.trail?.record({
    kind: "research",
    chosen: online ? `${findings.length} findings (online)` : `${findings.length} findings (offline brief)`,
    confidence: online ? 0.7 : 0.4,
    rationale: `${queries.length} planned queries across ${RESEARCH_SOURCES.length} sources`,
    alternatives: RESEARCH_SOURCES.map((s) => ({ label: s })),
  });

  return { idea, queries, findings, angles, keyClaims, online };
}
