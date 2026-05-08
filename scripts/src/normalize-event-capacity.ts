import { pool } from "@workspace/db";

async function main() {
  const { rows: low } = await pool.query<{ id: number; vendor_id: number }>(
    `SELECT id, vendor_id FROM events WHERE capacity < 1`,
  );
  if (low.length === 0) {
    console.log("No events with capacity < 1.");
    await pool.end();
    return;
  }
  let updated = 0;
  for (const row of low) {
    const { rows: peer } = await pool.query<{ median: string | null }>(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY capacity) AS median
         FROM events WHERE vendor_id = $1 AND capacity > 0`,
      [row.vendor_id],
    );
    const median = peer[0]?.median ? Math.max(1, Math.round(Number(peer[0].median))) : 100;
    await pool.query(`UPDATE events SET capacity = $1 WHERE id = $2`, [median, row.id]);
    console.log(`event ${row.id} (vendor ${row.vendor_id}) -> capacity ${median}`);
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
