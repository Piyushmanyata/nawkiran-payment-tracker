/**
 * Similar Pending Match pure helpers (ADR-0002 / CONTEXT.md).
 * Server truth is the has_similar_pending_payment RPC; these mirror the rules for tests.
 */

/** trim, collapse whitespace, case-insensitive. */
export function normalizeParty(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Similar party after normalize:
 * - equal → match
 * - shorter name ≥ 5 chars and either contains the other → match
 * - shorter name < 5 → equal only
 */
export function partiesSimilar(a: string, b: string): boolean {
  const na = normalizeParty(a);
  const nb = normalizeParty(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [shorter, longer] =
    na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length < 5) return false;
  return longer.includes(shorter);
}

/** Round to 2 decimals like create_payment. */
export function exactAmount(a: number | string, b: number | string): boolean {
  return Number(Number(a).toFixed(2)) === Number(Number(b).toFixed(2));
}

/**
 * Full Similar Pending Match against one candidate row.
 * status must be pending; amount exact; party similar.
 */
export function isSimilarPendingMatch(
  candidate: { party: string; amount: number | string; status: string },
  input: { party: string; amount: number | string }
): boolean {
  if (candidate.status !== "pending") return false;
  if (!exactAmount(candidate.amount, input.amount)) return false;
  return partiesSimilar(candidate.party, input.party);
}
