import { db, followsTable, organizersTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { enqueueFollowNotifications } from "./notificationQueue";
import { renderFollowCopy } from "./notifyTemplates";
import { logger } from "./logger";

export interface OrganizerEventLike {
  organizerId: number;
  eventId: number;
  eventTitle: string;
  eventSlug: string;
  city?: string | null;
}

/**
 * Notify every follower of an event organizer that a new event just went
 * public. Called when an organizer event transitions to approved/live (e.g. the
 * host venue approves it). Fire-and-forget: do NOT await on the request path.
 *
 * Deduped per event via `organizer-event:{eventId}`, so no matter how many times
 * an event flips through review states, each follower is notified at most once.
 * Followers are routed through the shared queue → 30-min spacing + retries.
 */
export async function notifyOrganizerNewEvent(ev: OrganizerEventLike): Promise<void> {
  try {
    const [org] = await db
      .select({
        id: organizersTable.id,
        name: organizersTable.name,
        hidden: organizersTable.hidden,
        ownerId: organizersTable.userId,
      })
      .from(organizersTable)
      .where(eq(organizersTable.id, ev.organizerId))
      .limit(1);

    // A hidden organizer profile shouldn't push to followers.
    if (!org || org.hidden) return;

    const followers = await db
      .select({ userId: followsTable.userId })
      .from(followsTable)
      .where(and(
        eq(followsTable.targetType, "organizer"),
        eq(followsTable.targetId, ev.organizerId),
        // Don't notify the organizer about their own event.
        ne(followsTable.userId, org.ownerId ?? -1),
      ));
    if (followers.length === 0) return;

    const { title, body } = renderFollowCopy("organizer_event", {
      name: org.name,
      event: ev.eventTitle,
      city: ev.city ?? undefined,
    });
    // Deep-link straight to the new event's public page so users can book now.
    const url = `/organizer-events/${ev.eventSlug}`;
    const dedupKey = `organizer-event:${ev.eventId}`;
    const tag = `organizer-event-${ev.eventId}`;

    await enqueueFollowNotifications(
      followers.map((f) => f.userId),
      { title, message: body, url, type: "follow_event", tag, dedupKey, priority: 2 },
    );

    logger.info(
      { organizerId: ev.organizerId, eventId: ev.eventId, followers: followers.length },
      "Queued organizer-follower notifications for new event",
    );
  } catch (err) {
    logger.warn({ err, organizerId: ev.organizerId, eventId: ev.eventId }, "notifyOrganizerNewEvent failed");
  }
}
