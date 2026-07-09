// ── Follow-notification copy ─────────────────────────────────────────────────
//
// Dynamic, engaging, non-repetitive notification text. Each kind has several
// templates that are rotated at random so a user who follows many venues never
// sees the same sentence twice in a row. Copy is intentionally playful,
// curiosity-driven and action-oriented (never spammy), per the product brief.
//
// `{name}`  → venue / organizer name
// `{event}` → event title (organizer events only)
// `{city}`  → city, when available

export type FollowNotifyKind =
  | "organizer_event"
  | "free_drinks"
  | "ticket"
  | "cover_charge"
  | "food_drink"
  | "exclusive"
  | "promo";

interface Template {
  title: string;
  body: string;
}

interface Ctx {
  name: string;
  event?: string;
  city?: string;
}

const TEMPLATES: Record<FollowNotifyKind, Template[]> = {
  // A followed event organizer just published a new event.
  organizer_event: [
    { title: "🎉 {name} just dropped a new event", body: "“{event}” is live — grab your spot before it sells out." },
    { title: "🔥 New from {name}", body: "{name} just announced “{event}”. Tap to see the lineup and book early." },
    { title: "🎟️ {event} is on!", body: "{name} added a brand-new event. Early birds get the best seats — that could be you." },
    { title: "✨ {name} has something planned", body: "“{event}” just went live. Your weekend called — it wants in." },
    { title: "👀 Guess who's back", body: "{name} just published “{event}”. Don't scroll past this one." },
  ],
  // Free / welcome / unlimited drinks at a followed venue.
  free_drinks: [
    { title: "🍹 Free drinks at {name}?!", body: "Yep — {name} just dropped a free-drinks deal. Round's on them 👀" },
    { title: "🥂 {name} is feeling generous", body: "Complimentary drinks just landed at {name}. Don't say we didn't tell you." },
    { title: "🍸 Someone say free drinks?", body: "{name} just added a free-drinks offer. Grab your crew and go." },
    { title: "😏 {name} unlocked free drinks", body: "New free-drinks deal at {name}. Tap before your friends beat you to it." },
  ],
  // A ticket / ticket-inclusive offer at a followed venue.
  ticket: [
    { title: "🎟️ {name} sweetened the deal", body: "New ticket offer at {name} — more perks, same night out. Tap to see." },
    { title: "🎫 Fresh tickets at {name}", body: "{name} just added a new ticket offer. Lock it in before prices move." },
    { title: "🔥 {name} ticket alert", body: "A new ticket deal just went live at {name}. Curious? You should be." },
  ],
  // Cover-charge update at a followed venue.
  cover_charge: [
    { title: "💰 Cover update at {name}", body: "{name} just changed its cover charge. Good news or great news? Tap to find out." },
    { title: "🚪 New entry deal at {name}", body: "{name} updated its cover charge. Plan your night the smart way." },
    { title: "👀 {name} tweaked the cover", body: "Fresh cover-charge info just posted at {name}. Take a peek." },
  ],
  // Food & drink discount / offer at a followed venue.
  food_drink: [
    { title: "🍔 New deals at {name}", body: "Hungry? {name} just unlocked food & drink offers you'll want tonight 🍕🍺" },
    { title: "🍕 {name} just got tastier", body: "A fresh food & drink deal landed at {name}. Your taste buds say go." },
    { title: "🍻 Deal alert at {name}", body: "{name} added a new food & drink offer. Great excuse to go out, right?" },
    { title: "😋 {name} has a treat for you", body: "New discounts just dropped at {name}. Tap, book, feast." },
  ],
  // An exclusive / special promotional deal at a followed venue (not tied to a
  // food or drink discount) — the "exclusive" vendor-offer category.
  exclusive: [
    { title: "💎 Exclusive deal at {name}", body: "{name} just unlocked an exclusive offer. Members move first — that's you." },
    { title: "🔓 {name} dropped something special", body: "A new exclusive deal just landed at {name}. Tap before it's gone." },
    { title: "⭐ VIP treatment at {name}", body: "{name} has an exclusive offer waiting. Don't let this one slip by." },
    { title: "🎁 {name} saved you the good stuff", body: "Fresh exclusive deal at {name}. First come, first served — go go go." },
    { title: "🥇 Only at {name}", body: "{name} just posted an exclusive offer you won't find anywhere else." },
  ],
  // Generic promotion fallback.
  promo: [
    { title: "🔥 {name} is up to something", body: "{name} just posted something new. Tap before everyone else does." },
    { title: "✨ Fresh drop at {name}", body: "A new update just landed at {name}. Curious minds tap here." },
    { title: "📣 News from {name}", body: "{name} has a new offer waiting for you. Don't miss out." },
  ],
};

// ── Daily "still on" reminder copy ───────────────────────────────────────────
// A SEPARATE, larger pool used by the 6 PM daily reminder for offers that are
// still live. Worded as an ongoing nudge ("still pouring", "reminder", "again
// tonight") — never "NEW" — and chosen deterministically by a day-based seed so
// consecutive days always read differently (no "I saw this yesterday" feeling).
const DAILY_TEMPLATES: Record<FollowNotifyKind, Template[]> = {
  organizer_event: [
    { title: "🎟️ {event} is still on at {name}", body: "Tickets for “{event}” are still live. Grab yours before they're gone." },
    { title: "⏳ Don't miss {event}", body: "{name}'s “{event}” is still open for booking. Your future self will thank you." },
    { title: "✨ Still time for {event}", body: "“{event}” by {name} hasn't sold out yet. Tap to lock your spot." },
  ],
  free_drinks: [
    { title: "🍹 Free drinks, still pouring at {name}", body: "{name}'s free-drinks deal is on again tonight. Cheers to that 🥂" },
    { title: "🥂 {name} hasn't stopped the party", body: "Free drinks at {name} are still a thing. Round up the squad." },
    { title: "🍸 Thirsty? {name} still has you", body: "{name}'s free-drinks offer is live today too. You know what to do." },
    { title: "😏 Your daily free-drinks reminder", body: "{name} is still giving drinks away. Don't make them drink alone." },
    { title: "🍾 {name}'s free pour continues", body: "Tonight could be a {name} night — free drinks are still on." },
    { title: "🍻 The good news repeats: {name}", body: "Free drinks at {name} are still running. Tap in before closing." },
    { title: "🎉 Still on the house at {name}", body: "{name}'s free-drinks deal hasn't expired. Make tonight count." },
  ],
  ticket: [
    { title: "🎟️ {name}'s ticket deal is still live", body: "That ticket offer at {name} hasn't expired. Lock it in tonight." },
    { title: "🎫 Still available at {name}", body: "{name}'s ticket deal is on again today. Don't miss the encore." },
    { title: "🔥 {name} ticket reminder", body: "The ticket offer at {name} is still standing. Grab yours." },
    { title: "😎 {name} saved you a spot", body: "{name}'s ticket deal is live today too. Tap to claim it." },
    { title: "🎟️ Encore at {name}", body: "{name}'s ticket offer runs today as well. You in?" },
    { title: "⏳ Still time at {name}", body: "{name}'s ticket deal is good today. Beat the queue and book now." },
  ],
  cover_charge: [
    { title: "💰 {name}'s cover deal is still on", body: "The cover-charge offer at {name} is live again tonight. Plan smart." },
    { title: "🚪 Good news at the door: {name}", body: "{name}'s cover deal hasn't changed. Tap for tonight's plan." },
    { title: "😌 Your {name} cover reminder", body: "The cover-charge deal at {name} is still standing today." },
    { title: "💸 {name} keeps it easy", body: "{name}'s cover offer is on again. Your night out just got simpler." },
    { title: "🎉 Still worth it: {name}", body: "{name}'s cover-charge deal runs today too. Round up the crew." },
    { title: "🕺 {name} is calling", body: "Cover deal at {name} is live again. Tonight's plan sorted?" },
  ],
  food_drink: [
    { title: "🍕 Still hungry for a deal at {name}?", body: "{name}'s food & drink offer is still on — tonight sorted?" },
    { title: "😋 Psst… {name} has deals waiting", body: "That food & drink offer at {name} hasn't gone anywhere. Tap in." },
    { title: "🍔 Your {name} craving called", body: "{name}'s tasty deal is live again tonight. Don't leave it hanging." },
    { title: "🔥 {name} deal, still standing", body: "The food & drink offer at {name} is on — grab it before it's gone." },
    { title: "🍟 Round two at {name}?", body: "{name}'s deal is still good today. Make plans, make memories." },
    { title: "🥡 Dinner idea: {name}", body: "{name}'s food & drink offer is running today too. Just saying 😉" },
    { title: "🌮 {name} is still treating you", body: "Today's a great day for {name}'s deal. Tap to see it." },
  ],
  exclusive: [
    { title: "💎 {name}'s exclusive deal is still on", body: "That exclusive offer at {name} hasn't expired. Claim it tonight." },
    { title: "🔓 Still unlocked at {name}", body: "{name}'s exclusive deal is live again today. Don't sleep on it." },
    { title: "⭐ Your {name} VIP reminder", body: "{name}'s exclusive offer is still standing. Tap to make it count." },
    { title: "🎁 {name} kept it just for you", body: "The exclusive deal at {name} runs today too. Grab it while it lasts." },
    { title: "🥇 Encore: {name}'s exclusive offer", body: "{name}'s exclusive deal is on again. First in wins — that could be you." },
    { title: "⏳ Still exclusive at {name}", body: "{name}'s special offer hasn't gone anywhere. Tap before it does." },
  ],
  promo: [
    { title: "🔥 {name} still has something for you", body: "{name}'s offer is live again today. Tap before it's gone." },
    { title: "✨ Still on at {name}", body: "That deal at {name} hasn't expired. Make the most of tonight." },
    { title: "📣 Reminder from {name}", body: "{name}'s offer is running today too. Don't miss out." },
  ],
};

function fill(s: string, ctx: Ctx): string {
  return s
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{event\}/g, ctx.event ?? "a new event")
    .replace(/\{city\}/g, ctx.city ?? "");
}

/**
 * Pick a random, filled-in template for a notification kind. Rotating at random
 * keeps a heavy follower's feed from reading like a robot wrote it.
 */
export function renderFollowCopy(
  kind: FollowNotifyKind,
  ctx: Ctx,
): { title: string; body: string } {
  const variants = TEMPLATES[kind] ?? TEMPLATES.promo;
  const pick = variants[Math.floor(Math.random() * variants.length)] ?? variants[0]!;
  return { title: fill(pick.title, ctx), body: fill(pick.body, ctx) };
}

/**
 * Pick a daily-reminder template DETERMINISTICALLY from a seed (typically
 * day-of-year + venue id). Because the seed advances by one each day, the chosen
 * template changes every day, so a user reminded about the same offer never sees
 * yesterday's wording again until the whole pool has cycled.
 */
export function renderDailyReminderCopy(
  kind: FollowNotifyKind,
  ctx: Ctx,
  seed: number,
): { title: string; body: string } {
  const variants = DAILY_TEMPLATES[kind] ?? DAILY_TEMPLATES.promo;
  const idx = ((Math.trunc(seed) % variants.length) + variants.length) % variants.length;
  const pick = variants[idx] ?? variants[0]!;
  return { title: fill(pick.title, ctx), body: fill(pick.body, ctx) };
}
