// @montara/quality — budget controls (Quality governance §I).
// estimate -> reserve -> reconcile, in three modes: observe (track only), warn (flag overage),
// cap (reject overage). Defaults: per-action $0.50, total $10.00.

import { DecisionTrail } from "./audit";

export type BudgetMode = "observe" | "warn" | "cap";

export interface BudgetEntry {
  id: string;
  action: string;
  estimated: number;
  reserved: number;
  actual: number | null;
  approved: boolean;
  flagged: boolean;
  note: string;
}

export interface ReserveResult {
  id: string;
  approved: boolean;
  flagged: boolean;
  note: string;
}

export interface BudgetOptions {
  mode?: BudgetMode;
  perActionCap?: number;
  totalCap?: number;
  trail?: DecisionTrail;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export class BudgetLedger {
  readonly mode: BudgetMode;
  readonly perActionCap: number;
  readonly totalCap: number;
  private readonly trail?: DecisionTrail;
  private entries: BudgetEntry[] = [];
  private seq = 0;

  constructor(opts: BudgetOptions = {}) {
    this.mode = opts.mode ?? "cap";
    this.perActionCap = opts.perActionCap ?? 0.5;
    this.totalCap = opts.totalCap ?? 10;
    this.trail = opts.trail;
  }

  /** Total committed so far (reconciled actuals where present, else reservations). */
  reserved(): number {
    return round2(this.entries.filter((e) => e.approved).reduce((s, e) => s + (e.actual ?? e.reserved), 0));
  }

  remaining(): number {
    return round2(this.totalCap - this.reserved());
  }

  reserve(action: string, estimated: number): ReserveResult {
    const id = `b${++this.seq}`;
    const amount = Math.max(0, estimated);
    const overAction = amount > this.perActionCap;
    const overTotal = this.reserved() + amount > this.totalCap;
    let approved = true;
    let flagged = false;
    let note = "within budget";

    if (overAction || overTotal) {
      const why = overAction
        ? `exceeds per-action cap $${this.perActionCap.toFixed(2)}`
        : `exceeds total cap $${this.totalCap.toFixed(2)}`;
      if (this.mode === "cap") { approved = false; note = `rejected: ${why}`; }
      else if (this.mode === "warn") { flagged = true; note = `warning: ${why}`; }
      else { flagged = true; note = `observed: ${why}`; }
    }

    this.entries.push({
      id,
      action,
      estimated: round2(amount),
      reserved: approved ? round2(amount) : 0,
      actual: null,
      approved,
      flagged,
      note,
    });
    this.trail?.record({
      kind: "budget-reserve",
      chosen: approved ? `APPROVE $${amount.toFixed(2)} for ${action}` : `DENY ${action}`,
      confidence: 0.9,
      rationale: note,
    });
    return { id, approved, flagged, note };
  }

  reconcile(id: string, actual: number): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`unknown reservation ${id}`);
    entry.actual = round2(Math.max(0, actual));
  }

  report(): {
    mode: BudgetMode;
    perActionCap: number;
    totalCap: number;
    reserved: number;
    remaining: number;
    entries: BudgetEntry[];
  } {
    return {
      mode: this.mode,
      perActionCap: this.perActionCap,
      totalCap: this.totalCap,
      reserved: this.reserved(),
      remaining: this.remaining(),
      entries: [...this.entries],
    };
  }
}
