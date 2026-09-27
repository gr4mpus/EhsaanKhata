import type { Entry } from "./types";

/** "debtor owes creditor `points` Ehsaan Points", after netting favours both ways. */
export type Debt = { debtor: string; creditor: string; points: number };

export function computeDebts(entries: Entry[]): Debt[] {
  // Keyed by an ordered pair "a|b" (a < b); positive means b owes a.
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.status !== "approved") continue;
    const [a, b] = e.doer_id < e.receiver_id ? [e.doer_id, e.receiver_id] : [e.receiver_id, e.doer_id];
    const sign = e.doer_id === a ? 1 : -1;
    const key = `${a}|${b}`;
    net.set(key, (net.get(key) ?? 0) + sign * e.points);
  }
  const debts: Debt[] = [];
  for (const [key, value] of net) {
    if (value === 0) continue;
    const [a, b] = key.split("|");
    debts.push(value > 0 ? { debtor: b, creditor: a, points: value } : { debtor: a, creditor: b, points: -value });
  }
  return debts.sort((x, y) => y.points - x.points);
}

/** Total points each member has earned minus received (approved only). */
export function computeScores(entries: Entry[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const e of entries) {
    if (e.status !== "approved") continue;
    scores.set(e.doer_id, (scores.get(e.doer_id) ?? 0) + e.points);
    scores.set(e.receiver_id, (scores.get(e.receiver_id) ?? 0) - e.points);
  }
  return scores;
}

export type Standing = { kind: "trust-master" | "burden"; done: number; taken: number };

/**
 * A member's standing in one group, from approved entries only.
 * Done at least as much as taken → Trust Master; taken more than done → Burden.
 * Returns null when the member has no approved favours either way.
 */
export function computeStanding(entries: Entry[], userId: string): Standing | null {
  let done = 0;
  let taken = 0;
  for (const e of entries) {
    if (e.status !== "approved") continue;
    if (e.doer_id === userId) done += e.points;
    if (e.receiver_id === userId) taken += e.points;
  }
  if (done === 0 && taken === 0) return null;
  return { kind: taken > done ? "burden" : "trust-master", done, taken };
}
