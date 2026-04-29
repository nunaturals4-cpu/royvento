import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db, eventsTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

interface AnnouncementCtx {
  title: string;
  vendorName: string;
  announceDate: string;
  announceTime: string;
  eventId: number;
}

function buildSystemPrompt(
  pubs: typeof eventsTable.$inferSelect[],
  announcements: AnnouncementCtx[]
): string {
  const fmt = (v: string | number | null | undefined) => Math.round(Number(v || 0)).toString();

  const pubList =
    pubs.length > 0
      ? pubs
          .map((p) => {
            const pricing: string[] = [];
            if (Number(p.priceWomen) > 0) pricing.push(`Women ₹${fmt(p.priceWomen)}`);
            if (Number(p.priceMen) > 0) pricing.push(`Men ₹${fmt(p.priceMen)}`);
            if (Number(p.priceCouple) > 0) pricing.push(`Couple ₹${fmt(p.priceCouple)}`);
            if (Number(p.price) > 0) pricing.push(`Entry ₹${fmt(p.price)}`);
            const priceStr = pricing.length > 0 ? pricing.join(", ") : "Price on request";
            const mode =
              p.pubMode === "table"
                ? "table reservation"
                : p.pubMode === "ticket"
                ? "ticket booking"
                : "ticket/table";
            return `- ${p.title} (ID: ${p.id}, City: ${p.city}, Mode: ${mode}, ${priceStr})`;
          })
          .join("\n")
      : "No verified pubs currently listed for this city.";

  const announcementSection =
    announcements.length > 0
      ? `\nUPCOMING ANNOUNCEMENTS (mention these when the user asks what's on or what's happening):\n` +
        announcements
          .map(
            (a) =>
              `- "${a.title}" at ${a.vendorName} on ${a.announceDate}${a.announceTime ? " at " + a.announceTime : ""} — [View & Book →](/events/${a.eventId})`
          )
          .join("\n")
      : "";

  return `You are Roy, the warm and enthusiastic nightlife concierge for Royvento — India's premier pub booking platform.

VERIFIED PUBS (recommend ONLY from this list):
${pubList}
${announcementSection}

RESPONSE FORMAT:
- Always start with ONE short, warm, excited opener sentence (e.g. "Oh, great choice! Here are tonight's top picks 🎉" or "You're in for a fantastic night! Check these out ✨").
- Then list each pub using this EXACT multi-line block format, with a blank line between each pub:

**Pub Name**
📍 Location, City
Entry — Women ₹X · Men ₹X · Couple ₹X
[View & Book →](/events/ID)

RULES:
1. Use ONLY the multi-line block format above for pubs. Never put pub details on a single inline line.
2. Always include the 📍 line with the pub's location and city.
3. Always include the Entry pricing line. Only show price types that are > 0. Format: Entry — Women ₹X · Men ₹X · Couple ₹X (omit types with no price).
4. Always end each pub block with [View & Book →](/events/ID).
5. Recommend at most 3 pubs unless the user explicitly asks for more.
6. Never invent venue names. Only use pubs from the verified list above.
7. If asked about a city with no data, say so warmly and suggest browsing /pubs.
8. Mention upcoming announcements only when the user asks what's on or what's happening tonight.`;
}

const AnnouncementCtxSchema = z.object({
  title: z.string(),
  vendorName: z.string(),
  announceDate: z.string(),
  announceTime: z.string().optional().default(""),
  eventId: z.number(),
});

const ChatBody = z.object({
  message: z.string().min(1).max(2000),
  city: z.string().optional().default(""),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
  announcements: z.array(AnnouncementCtxSchema).optional().default([]),
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
  const { message, city, history, announcements } = parsed.data;

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

  const systemPrompt = buildSystemPrompt(pubs, announcements);

  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages,
      max_completion_tokens: 350,
    });

    const reply =
      completion.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: "AI service unavailable", details: err?.message });
  }
});

export default router;
