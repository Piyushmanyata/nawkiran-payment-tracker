/** Company tags inferred from party/vendor text (case-insensitive, typo-tolerant). */
export type PartyTag = "APTUS" | "NKPL";

/**
 * Normalize for matching: lower-case, strip spaces/punct, collapse repeated letters.
 * Keeps letters+digits so "N.K.P.L" / "A P T U S" still match.
 */
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1");
}

/** Cheap Levenshtein capped for short brand tokens. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const prev = new Array<number>(n + 1);
  const cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/** Known exact / common misspellings after normalizeToken (all lowercase keys). */
const EXACT: Record<string, PartyTag> = {
  aptus: "APTUS",
  atpus: "APTUS",
  aptous: "APTUS",
  aptuss: "APTUS",
  apptus: "APTUS",
  aptas: "APTUS",
  aptis: "APTUS",
  aptuz: "APTUS",
  aptos: "APTUS",
  aptu: "APTUS",
  aptsu: "APTUS",
  apptuss: "APTUS",
  nkpl: "NKPL",
  nkpll: "NKPL",
  nklp: "NKPL",
  nkp1: "NKPL",
  nkpltd: "NKPL",
  nkp: "NKPL",
  nkpltda: "NKPL",
  nkl: "NKPL",
};

const CANONICAL: { tag: PartyTag; base: string; maxDist: number }[] = [
  { tag: "APTUS", base: "aptus", maxDist: 2 },
  { tag: "NKPL", base: "nkpl", maxDist: 1 },
];

function tokensFromParty(party: string): string[] {
  const raw = party.trim();
  if (!raw) return [];
  const parts = raw.split(/[\s,;/|_\-.()+]+/).filter(Boolean);
  return [raw, ...parts];
}

function matchToken(norm: string): PartyTag | null {
  if (!norm || norm.length < 3) return null;
  if (EXACT[norm]) return EXACT[norm];

  for (const { tag, base } of CANONICAL) {
    if (norm.includes(base)) return tag;
  }
  for (const { tag, base, maxDist } of CANONICAL) {
    if (norm.length >= base.length - 1 && norm.length <= base.length + 2) {
      if (editDistance(norm, base) <= maxDist) return tag;
    }
  }
  return null;
}

/** Detect APTUS / NKPL from free-text party name. Stable order. */
export function detectPartyTags(party: string): PartyTag[] {
  const found = new Set<PartyTag>();
  for (const t of tokensFromParty(party)) {
    const tag = matchToken(normalizeToken(t));
    if (tag) found.add(tag);
  }
  const whole = normalizeToken(party);
  if (whole) {
    if (EXACT[whole]) {
      found.add(EXACT[whole]);
    }
    for (const { tag, base, maxDist } of CANONICAL) {
      if (whole.includes(base)) {
        found.add(tag);
      } else if (whole.length <= 8 && Math.abs(whole.length - base.length) <= 2) {
        if (editDistance(whole, base) <= maxDist) found.add(tag);
      }
    }
  }

  const out: PartyTag[] = [];
  if (found.has("APTUS")) out.push("APTUS");
  if (found.has("NKPL")) out.push("NKPL");
  return out;
}

export function partyTagClass(tag: PartyTag): string {
  return tag === "APTUS"
    ? "bg-violet-100 text-violet-800 ring-violet-200"
    : "bg-emerald-100 text-emerald-800 ring-emerald-200";
}
