import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod";

const router: IRouter = Router();

const SYSTEM_PROMPT = `You are Roy, a helpful AI assistant for Royvento — India's premier pubs and nightlife booking platform. 
You help users discover pubs and clubs, understand ticket pricing, make reservations, and explore nightlife across Indian cities.

Key things you know:
- Royvento lists verified pubs and clubs across India
- Users can book tickets (ladies night, couple entry, stag entry, table reservations)
- Partners (pub owners) can list their venues and manage bookings
- Users can become Premium members for exclusive deals and priority booking
- Reviews on Royvento are verified — only users who have booked can leave reviews

Keep answers concise, friendly, and helpful. If asked about specific venue availability or pricing, remind the user to check the listing for the latest details. Always encourage users to explore the pubs section.`;

const ChatBody = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
});

router.post("/ai/chat", async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { message, history } = parsed.data;

  try {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages,
      max_completion_tokens: 512,
    });

    const reply = completion.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: "AI service unavailable", details: err?.message });
  }
});

export default router;
