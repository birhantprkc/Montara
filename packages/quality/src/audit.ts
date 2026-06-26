// @montara/quality — decision audit trail (Intelligence §H).
// Every non-trivial choice (provider pick, research angle, gate verdict, budget call) is logged
// with the alternatives it beat and a confidence, so a finished run is fully explainable.

export interface DecisionAlternative {
  label: string;
  score?: number;
  note?: string;
}

export interface DecisionRecord {
  seq: number;
  kind: string;
  chosen: string;
  /** 0..1 */
  confidence: number;
  rationale: string;
  alternatives: DecisionAlternative[];
  atIso: string;
}

export interface DecisionInput {
  kind: string;
  chosen: string;
  confidence: number;
  rationale: string;
  alternatives?: DecisionAlternative[];
}

/** Clamp to the unit interval; non-finite -> 0. Shared by every scorer in this package. */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export class DecisionTrail {
  private records: DecisionRecord[] = [];

  record(input: DecisionInput): DecisionRecord {
    const rec: DecisionRecord = {
      seq: this.records.length + 1,
      kind: input.kind,
      chosen: input.chosen,
      confidence: clamp01(input.confidence),
      rationale: input.rationale,
      alternatives: input.alternatives ?? [],
      atIso: new Date().toISOString(),
    };
    this.records.push(rec);
    return rec;
  }

  entries(): DecisionRecord[] {
    return [...this.records];
  }

  get length(): number {
    return this.records.length;
  }

  toJSON(): { count: number; decisions: DecisionRecord[] } {
    return { count: this.records.length, decisions: this.entries() };
  }
}
