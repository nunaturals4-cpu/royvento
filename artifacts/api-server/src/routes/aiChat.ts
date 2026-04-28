import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, eventsTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

function buildSystemPrompt(pubs: typeof eventsTable.$inferSelect[]): string {
  const pubList =
    pubs.length > 0
      ? pubs
          .map((p) => {
            const pricing: string[] = [];
            if (Number(p.priceWomen) > 0) pricing.push(`Women ₹${p.priceWomen}`);
            if (Number(p.priceMen) > 0) pricing.push(`Men ₹${p.priceMen}`);
            if (Number(p.priceCouple) > 0) pricing.push(`Couple ₹${p.priceCouple}`);
            if (Number(p.price) > 0) pricing.push(`Entry ₹${p.price}`);
            const priceStr = pricing.length > 0 ? pricing.join(", ") : "Price on request";
            const mode = p.pubMode === "table" ? "table reservation" : p.pubMode === "ticket" ? "ticket booking" : "ticket/table";
            return `- ${p.title} (ID: ${p.id}, City: ${p.city}, Mode: ${mode}, ${priceStr}) — ${(p.description || "").slice(0, 120)}`;
          })
          .join("\n")
      : "No verified pubs currently listed for this city.";

  return `You are Roy, the Nightlife AI assistant for Royvento — India's premier pub booking platform.

REAL PUB DATA for this city (use ONLY these pubs when recommending venues):
${pubList}

YOUR RULES:
1. Recommend ONLY pubs from the list above. Never invent venue names.
2. For every pub you mention, include a clickable link like: [View & Book →](/events/ID) — replace ID with the actual pub ID.
3. If the pub's mode is "table reservation", suggest booking a table. If "ticket booking", suggest buying tickets. If both, let the user choose.
4. Keep answers concise, warm, and nightlife-focused. Use short paragraphs.
5. If the user asks about a city with no data, apologise and suggest browsing /pubs for the full list.
6. Always end responses with an offer to help with bookings or answer follow-up questions.
7. Format pricing clearly (e.g. "Ladies Night — Women ₹500, Men ₹800").`;
}

const ChatBody = z.object({
  message: z.string().min(1).max(2000),
  city: z.string().optional().default(""),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
});

router.get("/ai/pubs-context", async (req, res) => {
  const city = (req.query["city"] as string) || "";
  if (!city.trim()) {
    res.json({ pubs: [] });
    return;
  }
  try {
    const pubs = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.approvalStatus, "approved"),
          ilike(eventsTable.city, `%${city.trim()}%`)
        )
      )
      .limit(20);
    res.json({ pubs });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch pub context", details: err?.message });
  }
});

router.post("/ai/chat", async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { message, city, history } = parsed.data;

  let pubs: typeof eventsTable.$inferSelect[] = [];
  if (city.trim()) {
    try {
      pubs = await db
        .select()
        .from(eventsTable)
        .where(
          and(
            eq(eventsTable.approvalStatus, "approved"),
            ilike(eventsTable.city, `%${city.trim()}%`)
          )
        )
        .limit(20);
    } catch {
      // proceed without pub context
    }
  }

  const systemPrompt = buildSystemPrompt(pubs);

  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages,
      max_completion_tokens: 600,
    });

    const reply = completion.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: "AI service unavailable", details: err?.message });
  }
});

export default router;
