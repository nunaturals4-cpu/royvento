const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Compresses a list of day abbreviations into human-readable ranges.
 * Mirrors web's src/lib/days.ts.
 *
 *   ["Mon","Tue","Wed"]              → "Mon-Wed"
 *   ["Mon","Tue","Wed","Fri","Sat"]  → "Mon-Wed, Fri-Sat"
 *   ["Mon","Wed","Fri"]              → "Mon, Wed, Fri"
 *   [] or all 7                      → "Everyday"
 */
export function formatDayRanges(days: string[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return "Everyday";

  const sorted = [...days].sort((a, b) => {
    const ai = DAY_ORDER.indexOf(a as (typeof DAY_ORDER)[number]);
    const bi = DAY_ORDER.indexOf(b as (typeof DAY_ORDER)[number]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const groups: string[][] = [];
  let cur: string[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = DAY_ORDER.indexOf(sorted[i - 1] as (typeof DAY_ORDER)[number]);
    const curr = DAY_ORDER.indexOf(sorted[i] as (typeof DAY_ORDER)[number]);
    if (curr === prev + 1) {
      cur.push(sorted[i]!);
    } else {
      groups.push(cur);
      cur = [sorted[i]!];
    }
  }
  groups.push(cur);

  return groups.map((g) => (g.length === 1 ? g[0]! : `${g[0]}-${g[g.length - 1]}`)).join(", ");
}
