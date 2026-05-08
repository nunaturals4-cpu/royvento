import { pool } from "@workspace/db";

type Fer = { enabled?: boolean; genders?: unknown; days?: unknown; beforeTime?: string } | null;

function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const g of raw) {
    const s = String(g ?? "").trim().toLowerCase();
    if (!s) continue;
    if (s === "everyone" || s === "all") {
      out.add("women"); out.add("men"); out.add("couple");
    } else if (s === "ladies" || s === "women" || s === "female") {
      out.add("women");
    } else if (s === "men" || s === "male") {
      out.add("men");
    } else if (s === "couples" || s === "couple") {
      out.add("couple");
    }
  }
  return Array.from(out);
}

async function main() {
  const { rows } = await pool.query<{ id: number; free_entry_rules: Fer }>(
    `SELECT id, free_entry_rules FROM events WHERE free_entry_rules IS NOT NULL`,
  );

  let updated = 0;
  for (const r of rows) {
    const fer = r.free_entry_rules;
    if (!fer || !Array.isArray(fer.genders)) continue;
    const before = (fer.genders as unknown[]).map((g) => String(g));
    const after = normalize(fer.genders);
    const sortedSame =
      before.length === after.length &&
      [...before].sort().join("|") === [...after].sort().join("|");
    if (sortedSame) continue;
    const next = { ...fer, genders: after };
    await pool.query(`UPDATE events SET free_entry_rules = $1 WHERE id = $2`, [next, r.id]);
    console.log(`event ${r.id}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    updated++;
  }
  console.log(`Done. Updated ${updated} row(s).`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
