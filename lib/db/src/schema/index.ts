import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  numeric,
  date,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("user"),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    about: text("about").notNull().default(""),
    profileImage: text("profile_image").notNull().default(""),
    googleId: varchar("google_id", { length: 255 }).notNull().default(""),
    referralCode: varchar("referral_code", { length: 32 }).notNull().default(""),
    referredBy: integer("referred_by"),
    points: integer("points").notNull().default(0),
    resetToken: varchar("reset_token", { length: 255 }).notNull().default(""),
    resetTokenExpiry: timestamp("reset_token_expiry", { withTimezone: true }),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifyToken: varchar("email_verify_token", { length: 255 }).notNull().default(""),
    emailVerifyExpiry: timestamp("email_verify_expiry", { withTimezone: true }),
    pushToken: text("push_token").notNull().default(""),
    expoPushToken: text("expo_push_token"),
    webPushSubscription: text("web_push_subscription"),
    gender: varchar("gender", { length: 10 }),
    genderCompleted: boolean("gender_completed").notNull().default(false),
    // Session-revocation counter. Embedded in issued JWTs; bumped on password
    // reset / logout-all so previously-issued tokens stop authenticating.
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    referralCodeIdx: uniqueIndex("users_referral_code_idx").on(t.referralCode),
  }),
);

export const vendorsTable = pgTable(
  "vendors",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    businessName: varchar("business_name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    location: varchar("location", { length: 255 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    country: varchar("country", { length: 100 }).notNull().default("India"),
    bannerImage: text("banner_image").notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    portfolioImages: text("portfolio_images").array().notNull().default([]),
    eventTypes: text("event_types").array().notNull().default([]),
    budgetMin: numeric("budget_min", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    budgetMax: numeric("budget_max", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    openDays: text("open_days").array().notNull().default([]),
    dayHours: text("day_hours"),
    address: text("address"),
    isPremium: boolean("is_premium").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // Admin "hide" lever, independent of the approval `status`. When true the
    // venue and everything it created (events, offers, announcements, drink
    // plans) is removed from every public surface; flipping back to false
    // restores it. Set when an admin hides the venue's pub/club row in the
    // Events tab. Read-filters require status='approved' AND hidden=false.
    hidden: boolean("hidden").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ticketPrefix: varchar("ticket_prefix", { length: 8 }).notNull().default(""),
    ticketSalt: varchar("ticket_salt", { length: 32 }).notNull().default(""),
    danceFloor: varchar("dance_floor", { length: 20 }),
    danceFloorPhotos: text("dance_floor_photos").array(),
    menuUrl: text("menu_url").notNull().default(""),
    // Food menu images/PDFs (legacy "pub menu" — existing uploads live here).
    menuUrls: text("menu_urls").array().notNull().default([]),
    // Bar / drinks menu images/PDFs (shown as its own sub-section).
    barMenuUrls: text("bar_menu_urls").array().notNull().default([]),
    crowdLevel: varchar("crowd_level", { length: 20 }),
    onlineBalance: numeric("online_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    commissionOwed: numeric("commission_owed", { precision: 14, scale: 2 }).notNull().default("0"),
    baseFeePercent: numeric("base_fee_percent", { precision: 5, scale: 2 }).notNull().default("3.50"),
    baseFeeEnabled: boolean("base_fee_enabled").notNull().default(true),
    // ── Admin-owned venue lifecycle ──────────────────────────────────────────
    // Admin can create & launch a venue with no partner: such rows use the
    // sentinel owner `userId = 0` (UNASSIGNED_VENUE_USER_ID) and
    // assignmentStatus='unassigned'. Assigning to a partner relinks `userId`
    // and flips status to 'assigned' — preserving all vendor_id-keyed history.
    assignmentStatus: varchar("assignment_status", { length: 20 }).notNull().default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    assignedByAdminId: integer("assigned_by_admin_id"),
    createdByAdminId: integer("created_by_admin_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Partial unique index: real partners stay 1:1 (one vendor per user), while
    // multiple unassigned venues may share the sentinel owner id 0.
    userIdx: uniqueIndex("vendors_user_assigned_idx").on(t.userId).where(sql`user_id <> 0`),
    statusIdx: index("vendors_status_idx").on(t.status),
  }),
);

// Immutable audit trail for admin-owned venue lifecycle: who created a venue,
// when it was assigned/reassigned/unassigned, to which partner, and the prior
// owner on a reassignment. One row per action.
export const venueAssignmentLogTable = pgTable(
  "venue_assignment_log",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    action: varchar("action", { length: 20 }).notNull(), // created | assigned | reassigned | unassigned
    actorAdminId: integer("actor_admin_id"),
    partnerUserId: integer("partner_user_id"),
    partnerEmail: varchar("partner_email", { length: 255 }).notNull().default(""),
    previousUserId: integer("previous_user_id"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("venue_assignment_log_vendor_idx").on(t.vendorId),
  }),
);

export const eventsTable = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    category: varchar("category", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("event"),
    location: varchar("location", { length: 255 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    country: varchar("country", { length: 100 }).notNull().default("India"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    capacity: integer("capacity").notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    eventDate: date("event_date"),
    featured: boolean("featured").notNull().default(false),
    popular: boolean("popular").notNull().default(false),
    // Admin kill-switch: when true the event (and its venue, since pubs/clubs/
    // bars are events of type "pub") is excluded from every public discovery
    // surface — storefront listings, featured/popular rails, search, going-out,
    // happening-tonight and the sitemap. Approval state is left untouched.
    hidden: boolean("hidden").notNull().default(false),
    // Admin-curated flag: surface this venue in the storefront "Date Night"
    // rail (homepage) and the Pubs-page "Date Night" category. Single source of
    // truth so both places show the exact same set.
    dateNight: boolean("date_night").notNull().default(false),
    pubMode: varchar("pub_mode", { length: 20 }).notNull().default(""),
    // ── Happening Tonight ── real-time discovery fields. start/end time are the
    // event's tonight session window ("HH:MM", IST). The three booleans are
    // partner opt-in visibility gates; time-window logic decides the bucket.
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    happeningTonight: boolean("happening_tonight").notNull().default(true),
    startingSoon: boolean("starting_soon").notNull().default(true),
    lastMinuteDeal: boolean("last_minute_deal").notNull().default(false),
    dealLabel: varchar("deal_label", { length: 120 }).notNull().default(""),
    // ── Going Out With Friends ── group-capacity controls. `capacity` above is
    // the venue's total seating; availableCapacity is computed live at query
    // time (capacity − today's booked guests). tableCount/tableSize/vipCapacity
    // describe group seating; maxGroupSize=0 means "no stated cap" (treated as
    // fits any group). groupOffer is the partner's free-text group promo label.
    tableCount: integer("table_count").notNull().default(0),
    tableSize: integer("table_size").notNull().default(0),
    vipCapacity: integer("vip_capacity").notNull().default(0),
    maxGroupSize: integer("max_group_size").notNull().default(0),
    groupBookingEnabled: boolean("group_booking_enabled").notNull().default(true),
    groupOffer: varchar("group_offer", { length: 160 }).notNull().default(""),
    priceWomen: numeric("price_women", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    priceMen: numeric("price_men", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    priceCouple: numeric("price_couple", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    pubEventTypes: text("pub_event_types").array().notNull().default([]),
    // Genders the partner has disabled entry for at this venue (e.g. ["men"]
    // for a women-only night). Gates both the ticket-booking UI and the
    // booking API for the disabled tiers.
    disabledGenders: text("disabled_genders").array().notNull().default([]),
    dayPricing: jsonb("day_pricing").$type<Record<string, { women: number; men: number; couple: number } | null>>(),
    freeEntryRules: jsonb("free_entry_rules").$type<{ enabled: boolean; genders: string[]; days: string[]; beforeTime?: string }>(),
    galleryImages: text("gallery_images").array(),
    galleryVideos: text("gallery_videos").array(),
    freeEntryForTable: boolean("free_entry_for_table").notNull().default(false),
    freeEntryForTableDays: jsonb("free_entry_for_table_days").$type<string[]>(),
    freeEntryForTableBeforeTime: text("free_entry_for_table_before_time"),
    retainForever: boolean("retain_forever").notNull().default(false),
    approvalStatus: varchar("approval_status", { length: 20 })
      .notNull()
      .default("pending"),
    rejectionReason: text("rejection_reason"),
    // Set the moment an admin flips approvalStatus to "approved". Powers the
    // storefront "New" badge, which auto-hides 15 days after this timestamp.
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    popularSince: timestamp("popular_since", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("events_vendor_idx").on(t.vendorId),
    categoryIdx: index("events_category_idx").on(t.category),
    typeIdx: index("events_type_idx").on(t.type),
    approvalIdx: index("events_approval_idx").on(t.approvalStatus),
  }),
);

export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    // Polymorphic booking source. `kind = 'pub'` is the original vendor/event
    // booking. `kind = 'organizer'` is an Event Organizer ticket booking
    // (organizerId + organizerEventId + eventTicketId set; eventId/vendorId are
    // NULL at the DB level for these rows). The TS columns stay `.notNull()`
    // (type = number) so the large existing pub codebase keeps compiling against
    // non-null ids; the DB columns are made nullable by an idempotent
    // `ALTER COLUMN … DROP NOT NULL` in applyPendingSchemaChanges(). The single
    // organizer insert casts its values to satisfy the stricter insert type.
    kind: varchar("kind", { length: 12 }).notNull().default("pub"),
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    organizerId: integer("organizer_id"),
    organizerEventId: integer("organizer_event_id"),
    eventTicketId: integer("event_ticket_id"),
    // Host venue for a venue-linked organizer booking (organizer_events.venue_id),
    // so the hosting pub/club can see the booking in its dashboard. NULL otherwise.
    hostVendorId: integer("host_vendor_id"),
    // `kind = 'game'` is a Game Organizer booking. gameOrganizerId is always set;
    // exactly one of gameId / gamePackageId is set (a single game vs a package).
    // Like organizer bookings these DB columns are nullable; the TS columns below
    // stay nullable too. durationHours is set only for hourly-priced games.
    gameOrganizerId: integer("game_organizer_id"),
    gameId: integer("game_id"),
    gamePackageId: integer("game_package_id"),
    durationHours: numeric("duration_hours", { precision: 5, scale: 1 }),
    bookingDate: date("booking_date").notNull(),
    guests: integer("guests").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    couponCode: varchar("coupon_code", { length: 64 }).notNull().default(""),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    finalPrice: numeric("final_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    budgetRange: varchar("budget_range", { length: 50 }).notNull().default(""),
    notes: text("notes").notNull().default(""),
    eventType: varchar("event_type", { length: 50 }).notNull().default("other"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    pubMode: varchar("pub_mode", { length: 20 }).notNull().default(""),
    ticketWomen: integer("ticket_women").notNull().default(0),
    ticketMen: integer("ticket_men").notNull().default(0),
    ticketCouple: integer("ticket_couple").notNull().default(0),
    selectedPubEvent: varchar("selected_pub_event", { length: 100 })
      .notNull()
      .default(""),
    announcementId: integer("announcement_id"),
    eventCommissionPct: numeric("event_commission_pct", { precision: 5, scale: 2 }),
    personName: varchar("person_name", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 20 }).notNull().default(""),
    pointsUsed: integer("points_used").notNull().default(0),
    approvedBy: varchar("approved_by", { length: 20 }).notNull().default(""),
    rejectionReason: text("rejection_reason"),
    checkedIn: boolean("checked_in").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedOut: boolean("checked_out").notNull().default(false),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    baseFee: integer("base_fee").notNull().default(0),
    arrivalTime: varchar("arrival_time", { length: 8 }),
    paymentMethod: varchar("payment_method", { length: 10 }).notNull().default("online"),
    actualWomen: integer("actual_women"),
    actualMen: integer("actual_men"),
    actualCouple: integer("actual_couple"),
    actualGuests: integer("actual_guests"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("bookings_user_idx").on(t.userId),
    vendorIdx: index("bookings_vendor_idx").on(t.vendorId),
    eventIdx: index("bookings_event_idx").on(t.eventId),
  }),
);

export const reviewsTable = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    eventId: integer("event_id"),
    vendorId: integer("vendor_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    imageUrls: text("image_urls").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("reviews_vendor_idx").on(t.vendorId),
    eventIdx: index("reviews_event_idx").on(t.eventId),
    userVendorUniq: uniqueIndex("reviews_user_vendor_uniq").on(t.userId, t.vendorId),
  }),
);

export const availabilityTable = pgTable(
  "availability",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    date: date("date").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorDateIdx: uniqueIndex("availability_vendor_date_idx").on(
      t.vendorId,
      t.date,
    ),
  }),
);

export const contactMessagesTable = pgTable(
  "contact_messages",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    subject: varchar("subject", { length: 255 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdIdx: index("contact_messages_created_idx").on(t.createdAt),
  }),
);

export const vendorRequestsTable = pgTable(
  "vendor_requests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    businessName: varchar("business_name", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    category: varchar("category", { length: 100 }).notNull().default(""),
    message: text("message").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("vendor_requests_user_idx").on(t.userId),
    statusIdx: index("vendor_requests_status_idx").on(t.status),
  }),
);

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    planType: varchar("plan_type", { length: 20 }).notNull().default("user"),
    planPeriod: varchar("plan_period", { length: 20 })
      .notNull()
      .default("monthly"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("subscriptions_user_idx").on(t.userId),
    statusIdx: index("subscriptions_status_idx").on(t.status),
  }),
);

export const couponsTable = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    discountPercent: integer("discount_percent").notNull().default(10),
    used: boolean("used").notNull().default(false),
    source: varchar("source", { length: 30 }).notNull().default("admin_grant"),
    vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("coupons_user_idx").on(t.userId),
    codeIdx: uniqueIndex("coupons_code_idx").on(t.code),
    vendorIdx: index("coupons_vendor_idx").on(t.vendorId),
  }),
);

export const partnerMediaTable = pgTable(
  "partner_media",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    type: varchar("type", { length: 10 }).notNull().default("photo"),
    url: text("url").notNull(),
    caption: varchar("caption", { length: 255 }).notNull().default(""),
    eventCategories: text("event_categories").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("partner_media_vendor_idx").on(t.vendorId),
  }),
);

export const partnerBlockedDatesTable = pgTable(
  "partner_blocked_dates",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    date: date("date").notNull(),
    reason: varchar("reason", { length: 255 }).notNull().default(""),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorDateIdx: uniqueIndex("blocked_dates_vendor_date_idx").on(
      t.vendorId,
      t.date,
    ),
  }),
);

export const adsRequestsTable = pgTable(
  "ads_requests",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    message: text("message").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("ads_vendor_idx").on(t.vendorId),
    statusIdx: index("ads_status_idx").on(t.status),
  }),
);

export const profileViewsTable = pgTable(
  "profile_views",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    viewerUserId: integer("viewer_user_id"),
    viewerName: varchar("viewer_name", { length: 255 }).notNull().default(""),
    viewerEmail: varchar("viewer_email", { length: 255 }).notNull().default(""),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("profile_views_vendor_idx").on(t.vendorId),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type Vendor = typeof vendorsTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;

export const reviewDeletionsTable = pgTable(
  "review_deletions",
  {
    id: serial("id").primaryKey(),
    reviewId: integer("review_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    deletedByUserId: integer("deleted_by_user_id").notNull(),
    deletedByRole: varchar("deleted_by_role", { length: 20 }).notNull(),
    originalUserId: integer("original_user_id").notNull(),
    originalRating: integer("original_rating").notNull(),
    originalComment: text("original_comment").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("review_deletions_vendor_idx").on(t.vendorId),
    reviewIdx: index("review_deletions_review_idx").on(t.reviewId),
  }),
);

export type ReviewDeletion = typeof reviewDeletionsTable.$inferSelect;
export type Availability = typeof availabilityTable.$inferSelect;
export type ContactMessage = typeof contactMessagesTable.$inferSelect;
export type VendorRequest = typeof vendorRequestsTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type Coupon = typeof couponsTable.$inferSelect;
export type PartnerMedia = typeof partnerMediaTable.$inferSelect;
export type PartnerBlockedDate = typeof partnerBlockedDatesTable.$inferSelect;
export type AdsRequest = typeof adsRequestsTable.$inferSelect;
export type ProfileView = typeof profileViewsTable.$inferSelect;

export const referralsTable = pgTable(
  "referrals",
  {
    id: serial("id").primaryKey(),
    referrerId: integer("referrer_id").notNull(),
    referredId: integer("referred_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    pointsAwarded: integer("points_awarded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    referrerIdx: index("referrals_referrer_idx").on(t.referrerId),
    referredIdx: uniqueIndex("referrals_referred_idx").on(t.referredId),
  }),
);

export type Referral = typeof referralsTable.$inferSelect;

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull().default(""),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
  }),
);

export type Notification = typeof notificationsTable.$inferSelect;

export const wishlistsTable = pgTable(
  "wishlists",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    eventId: integer("event_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userEventIdx: uniqueIndex("wishlists_user_event_idx").on(t.userId, t.eventId),
  }),
);

export type Wishlist = typeof wishlistsTable.$inferSelect;

// Polymorphic follow: a user follows a profile (a venue, an event, a game zone,
// or an organizer). Followers of an approved venue receive instant push/in-app
// notifications whenever that venue creates or updates a drink deal (Free Drinks
// / Included with Ticket / Cover Charges) or a Food & Drink discount.
// targetType ∈ "vendor" | "event" | "game_organizer" | "organizer".
// One row per (user, targetType, targetId).
export const followsTable = pgTable(
  "follows",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userTargetIdx: uniqueIndex("follows_user_target_idx").on(t.userId, t.targetType, t.targetId),
    targetIdx: index("follows_target_idx").on(t.targetType, t.targetId),
  }),
);

export type Follow = typeof followsTable.$inferSelect;

export const blogsTable = pgTable(
  "blogs",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    excerpt: text("excerpt").notNull().default(""),
    content: text("content").notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    authorName: varchar("author_name", { length: 255 }).notNull().default("Royvento Editorial"),
    tags: text("tags").array().notNull().default([]),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("blogs_slug_idx").on(t.slug),
    publishedIdx: index("blogs_published_idx").on(t.published),
  }),
);

export type Blog = typeof blogsTable.$inferSelect;

export const announcementsTable = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    eventId: integer("event_id"),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull().default(""),
    announceDate: varchar("announce_date", { length: 20 }).notNull().default(""),
    announceTime: varchar("announce_time", { length: 20 }).notNull().default(""),
    imageUrl: text("image_url").notNull().default(""),
    isFeaturedSlider: boolean("is_featured_slider").notNull().default(false),
    genre: varchar("genre", { length: 100 }).notNull().default(""),
    eventType: varchar("event_type", { length: 100 }).notNull().default(""),
    organizerName: varchar("organizer_name", { length: 255 }).notNull().default(""),
    contactDetails: varchar("contact_details", { length: 255 }).notNull().default(""),
    capacity: integer("capacity"),
    isActive: boolean("is_active").notNull().default(true),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("announcements_vendor_idx").on(t.vendorId),
  }),
);

export type Announcement = typeof announcementsTable.$inferSelect;

// Global, admin-controlled site settings as simple key/value rows (e.g.
// "hide_nav_links" → "true"). Read publicly via GET /api/site-settings.
export const siteSettingsTable = pgTable("site_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SiteSetting = typeof siteSettingsTable.$inferSelect;

export const vendorManagersTable = pgTable(
  "vendor_managers",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    invitedEmail: varchar("invited_email", { length: 255 }).notNull(),
    invitedBy: integer("invited_by").notNull(),
    managerId: integer("manager_id"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    token: varchar("token", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorEmailIdx: index("vm_vendor_email_idx").on(t.vendorId, t.invitedEmail),
    tokenIdx: uniqueIndex("vm_token_idx").on(t.token),
    managerIdx: index("vm_manager_idx").on(t.managerId),
  }),
);

export type VendorManager = typeof vendorManagersTable.$inferSelect;

export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    merchantTransactionId: varchar("merchant_transaction_id", { length: 64 }).notNull(),
    bookingId: integer("booking_id"),
    subscriptionId: integer("subscription_id"),
    amount: integer("amount").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("initiated"),
    phonepeTransactionId: varchar("phonepe_transaction_id", { length: 128 }).notNull().default(""),
    razorpayOrderId: varchar("razorpay_order_id", { length: 100 }).notNull().default(""),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 100 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    merchantTxIdx: uniqueIndex("payments_merchant_tx_idx").on(t.merchantTransactionId),
    bookingIdx: index("payments_booking_idx").on(t.bookingId),
    subscriptionIdx: index("payments_subscription_idx").on(t.subscriptionId),
  }),
);

export type Payment = typeof paymentsTable.$inferSelect;

export const drinkPlansTable = pgTable(
  "drink_plans",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull().default("welcome"),
    productName: varchar("product_name", { length: 255 }).notNull().default(""),
    gender: varchar("gender", { length: 10 }).notNull().default("all"),
    price: integer("price").notNull().default(0),
    // Cover-charge packages only: how many people one package admits/covers.
    // NULL or 0 = not specified (don't surface). Purely informational — shown
    // to customers; does not change pricing or commission.
    peoplePerPackage: integer("people_per_package"),
    days: text("days").array().notNull().default([]),
    timeFrom: varchar("time_from", { length: 8 }).notNull().default(""),
    timeTo: varchar("time_to", { length: 8 }).notNull().default(""),
    description: text("description").notNull().default(""),
    lineItems: jsonb("line_items").$type<Array<{ name: string; qty: number; discountedPrice: number }>>(),
    drinksOfferLabel: varchar("drinks_offer_label", { length: 255 }).notNull().default(""),
    foodDiscountLabel: varchar("food_discount_label", { length: 255 }).notNull().default(""),
    validUntil: date("valid_until"),
    validFrom: date("valid_from"),
    imageUrl: text("image_url"),
    // Admin-set global priority (1–10). Plans with a value appear first in the
    // Drinks Deals section of every pub page, in ascending priority order.
    // NULL = not prioritised.
    globalPriority: integer("global_priority"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("drink_plans_vendor_idx").on(t.vendorId),
    globalPriorityIdx: index("drink_plans_global_priority_idx").on(t.globalPriority),
  }),
);

export type DrinkPlan = typeof drinkPlansTable.$inferSelect;

export const vendorCommissionsTable = pgTable(
  "vendor_commissions",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().unique().references(() => vendorsTable.id, { onDelete: "cascade" }),
    freeEntryRate: numeric("free_entry_rate", { precision: 8, scale: 2 }).notNull().default("0"),
    ticketRate: numeric("ticket_rate", { precision: 8, scale: 2 }).notNull().default("0"),
    tableBookingRate: numeric("table_booking_rate", { precision: 8, scale: 2 }).notNull().default("0"),
    // Event booking commission as a percentage (0–100) of ticket revenue.
    eventRate: numeric("event_rate", { precision: 8, scale: 2 }).notNull().default("0"),
    // Cover-charge commission as a percentage (0–100) of the final package revenue.
    coverChargeRate: numeric("cover_charge_rate", { precision: 8, scale: 2 }).notNull().default("0"),
    eventCommissionEnabled: boolean("event_commission_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("vendor_commissions_vendor_idx").on(t.vendorId),
  }),
);

export type VendorCommission = typeof vendorCommissionsTable.$inferSelect;

export const vendorBankingDetailsTable = pgTable(
  "vendor_banking_details",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
    accountHolderName: varchar("account_holder_name", { length: 255 }).notNull().default(""),
    bankName: varchar("bank_name", { length: 255 }).notNull().default(""),
    accountNumber: varchar("account_number", { length: 50 }).notNull().default(""),
    ifscCode: varchar("ifsc_code", { length: 20 }).notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: uniqueIndex("vbd_vendor_idx").on(t.vendorId),
  }),
);

export type VendorBankingDetails = typeof vendorBankingDetailsTable.$inferSelect;

export interface BankingDetailsSnapshot {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
}

export const settlementRequestsTable = pgTable(
  "settlement_requests",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    adminNote: text("admin_note").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    bankingDetailsSnapshot: jsonb("banking_details_snapshot").$type<BankingDetailsSnapshot>(),
  },
  (t) => ({
    vendorIdx: index("sr_vendor_idx").on(t.vendorId),
    statusIdx: index("sr_status_idx").on(t.status),
  }),
);

export type SettlementRequest = typeof settlementRequestsTable.$inferSelect;

export const expoPushTicketsTable = pgTable(
  "expo_push_tickets",
  {
    id: serial("id").primaryKey(),
    ticketId: varchar("ticket_id", { length: 255 }).notNull(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketIdIdx: uniqueIndex("expo_push_tickets_ticket_id_idx").on(t.ticketId),
    userIdx: index("expo_push_tickets_user_idx").on(t.userId),
    expiresAtIdx: index("expo_push_tickets_expires_at_idx").on(t.expiresAt),
  }),
);

export type ExpoPushTicket = typeof expoPushTicketsTable.$inferSelect;

export const commissionLedgerTable = pgTable(
  "commission_ledger",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    bookingType: varchar("booking_type", { length: 30 }).notNull(),
    trigger: varchar("trigger", { length: 30 }).notNull(),
    paymentId: integer("payment_id").references(() => paymentsTable.id, { onDelete: "set null" }),
    settlementRequestId: integer("settlement_request_id").references(() => settlementRequestsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("commission_ledger_vendor_idx").on(t.vendorId),
    bookingIdx: index("commission_ledger_booking_idx").on(t.bookingId),
    triggerIdx: index("commission_ledger_trigger_idx").on(t.trigger),
    bookingTriggerUniq: uniqueIndex("commission_ledger_booking_trigger_uniq").on(t.bookingId, t.trigger),
  }),
);

export type CommissionLedger = typeof commissionLedgerTable.$inferSelect;

export const webPushSubscriptionsTable = pgTable(
  "web_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    endpointUniq: uniqueIndex("web_push_subscriptions_endpoint_uniq").on(t.endpoint),
    userIdx: index("web_push_subscriptions_user_idx").on(t.userId),
  }),
);

export type WebPushSubscription = typeof webPushSubscriptionsTable.$inferSelect;

// Admin-editable editorial overrides for programmatic SEO landing pages.
// (template, citySlug, secondSlug) is the natural key. `secondSlug` is the
// locality or category slug for /:city/:second pages, NULL for /:city.
export const seoPagesTable = pgTable(
  "seo_pages",
  {
    id: serial("id").primaryKey(),
    template: varchar("template", { length: 32 }).notNull(),
    citySlug: varchar("city_slug", { length: 64 }).notNull(),
    secondSlug: varchar("second_slug", { length: 64 }),
    title: text("title"),
    metaDescription: text("meta_description"),
    introMd: text("intro_md").notNull().default(""),
    faqs: jsonb("faqs").notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    keyUniq: uniqueIndex("seo_pages_key_uniq").on(t.template, t.citySlug, t.secondSlug),
    cityIdx: index("seo_pages_city_idx").on(t.citySlug),
  }),
);

export type SeoPage = typeof seoPagesTable.$inferSelect;

// Append-only audit trail for the "Save Actual Entry" finalization flow.
// One row per save; the most-recent row's `after_json` reflects the final
// stored state. `before_json` captures what we overwrote so admins can
// reconstruct who corrected what at the door.
export const bookingAuditLogTable = pgTable(
  "booking_audit_log",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "cascade" }),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id"),
    action: varchar("action", { length: 40 }).notNull(),
    beforeJson: jsonb("before_json").notNull().default(sql`'{}'::jsonb`),
    afterJson: jsonb("after_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bookingIdx: index("booking_audit_log_booking_idx").on(t.bookingId),
    vendorIdx: index("booking_audit_log_vendor_idx").on(t.vendorId),
    actionIdx: index("booking_audit_log_action_idx").on(t.action),
    createdIdx: index("booking_audit_log_created_idx").on(t.createdAt),
  }),
);

export type BookingAuditLog = typeof bookingAuditLogTable.$inferSelect;

// ─── Email Management System ────────────────────────────────────────────────
//
// Powers the Admin Panel → "Send & Receive Email" tab. Sending goes through
// Resend (from info@royvento.com); receiving is fed by a Resend Inbound
// webhook. Conversations are grouped into threads; each thread carries
// denormalized folder flags (hasInbound/hasSent/hasDraft/hasFailed) so the
// Inbox/Sent/Drafts/Failed sidebar can filter with a single indexed WHERE.

export const emailThreadsTable = pgTable(
  "email_threads",
  {
    id: serial("id").primaryKey(),
    subject: text("subject").notNull().default(""),
    // Subject with leading "Re:" / "Fwd:" stripped + lowercased — used to
    // match an inbound reply to its conversation when headers are missing.
    normalizedSubject: varchar("normalized_subject", { length: 500 }).notNull().default(""),
    // The external (non-royvento) participant. One human = one thread per subject.
    counterpartyEmail: varchar("counterparty_email", { length: 320 }).notNull().default(""),
    counterpartyName: varchar("counterparty_name", { length: 255 }).notNull().default(""),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessagePreview: varchar("last_message_preview", { length: 300 }).notNull().default(""),
    lastDirection: varchar("last_direction", { length: 10 }).notNull().default("inbound"),
    messageCount: integer("message_count").notNull().default(0),
    hasUnread: boolean("has_unread").notNull().default(false),
    // Denormalized folder membership, recomputed on every message change.
    hasInbound: boolean("has_inbound").notNull().default(false),
    hasSent: boolean("has_sent").notNull().default(false),
    hasDraft: boolean("has_draft").notNull().default(false),
    hasFailed: boolean("has_failed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lastMsgIdx: index("email_threads_last_msg_idx").on(t.lastMessageAt),
    counterpartyIdx: index("email_threads_counterparty_idx").on(t.counterpartyEmail),
    normSubjectIdx: index("email_threads_norm_subject_idx").on(t.normalizedSubject),
    inboxIdx: index("email_threads_inbox_idx").on(t.hasInbound),
    sentIdx: index("email_threads_sent_idx").on(t.hasSent),
    draftIdx: index("email_threads_draft_idx").on(t.hasDraft),
    failedIdx: index("email_threads_failed_idx").on(t.hasFailed),
  }),
);

export type EmailThread = typeof emailThreadsTable.$inferSelect;

export const emailMessagesTable = pgTable(
  "email_messages",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id").references(() => emailThreadsTable.id, { onDelete: "cascade" }),
    direction: varchar("direction", { length: 10 }).notNull(), // inbound | outbound
    // draft | queued | sent | delivered | opened | clicked | bounced | complained | failed | received
    status: varchar("status", { length: 20 }).notNull().default("received"),
    fromEmail: varchar("from_email", { length: 320 }).notNull().default(""),
    fromName: varchar("from_name", { length: 255 }).notNull().default(""),
    toEmails: jsonb("to_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ccEmails: jsonb("cc_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    bccEmails: jsonb("bcc_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    snippet: varchar("snippet", { length: 300 }).notNull().default(""),
    // Resend's email id (used to correlate delivery/open/click webhooks).
    resendId: varchar("resend_id", { length: 255 }).notNull().default(""),
    // RFC 5322 Message-ID header — the threading anchor for inbound replies.
    messageId: varchar("message_id", { length: 998 }).notNull().default(""),
    inReplyTo: varchar("in_reply_to", { length: 998 }).notNull().default(""),
    referencesIds: jsonb("references_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    isRead: boolean("is_read").notNull().default(false),
    errorMessage: text("error_message").notNull().default(""),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    sentByUserId: integer("sent_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index("email_messages_thread_idx").on(t.threadId),
    directionIdx: index("email_messages_direction_idx").on(t.direction),
    statusIdx: index("email_messages_status_idx").on(t.status),
    resendIdx: index("email_messages_resend_idx").on(t.resendId),
    messageIdIdx: index("email_messages_message_id_idx").on(t.messageId),
    createdIdx: index("email_messages_created_idx").on(t.createdAt),
  }),
);

export type EmailMessage = typeof emailMessagesTable.$inferSelect;

export const emailAttachmentsTable = pgTable(
  "email_attachments",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id").references(() => emailMessagesTable.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 500 }).notNull().default("attachment"),
    contentType: varchar("content_type", { length: 200 }).notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    // Storage object path (e.g. "/objects/uploads/<uuid>") resolvable via the
    // ObjectStorageService, or an absolute URL for Resend-hosted inbound files.
    storageKey: text("storage_key").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    messageIdx: index("email_attachments_message_idx").on(t.messageId),
  }),
);

// ─── Vendor-owned public coupons ─────────────────────────────────────────────
// Partners create 5-char codes that any customer can apply at booking.
// Distinct from `couponsTable` which is user-specific admin-granted coupons.
export const vendorCouponsTable = pgTable(
  "vendor_coupons",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 10 }).notNull(),
    discountType: varchar("discount_type", { length: 10 }).notNull().default("percent"), // "percent" | "fixed"
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("10"),
    applicableTo: varchar("applicable_to", { length: 20 }).notNull().default("both"), // "ticket" | "event" | "both"
    active: boolean("active").notNull().default(true),
    maxUses: integer("max_uses"),          // null = unlimited
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("vendor_coupons_vendor_idx").on(t.vendorId),
    codeIdx: uniqueIndex("vendor_coupons_code_idx").on(t.code),
    activeIdx: index("vendor_coupons_active_idx").on(t.active),
  }),
);

export type VendorCoupon = typeof vendorCouponsTable.$inferSelect;

// ─── Vendor food & drink discount offers ─────────────────────────────────────
// Venue-pushed promotions (not redeemable codes). Displayed automatically on the
// pub detail/booking page when "active right now" — i.e. inside the validity
// window, on a matching day-of-week, and within the time-of-day band.
// Conversions are computed impression-style by joining bookings made while an
// offer was active on the same venue (no offerId stored on bookings).
export const vendorOffersTable = pgTable(
  "vendor_offers",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendorsTable.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 10 }).notNull(), // "food" | "drink"
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    // "percent" | "fixed" | "bogo" | "free_item"
    discountType: varchar("discount_type", { length: 16 }).notNull(),
    // 0 for bogo / free_item
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
    // Free-item label, e.g. "Free dessert with any main course"
    freeItemName: varchar("free_item_name", { length: 120 }).notNull().default(""),
    // ISO weekday abbreviations: "mon","tue","wed","thu","fri","sat","sun" — empty = every day
    days: text("days").array().notNull().default(sql`'{}'::text[]`),
    // "HH:MM" 24-hour, empty = all-day
    timeFrom: varchar("time_from", { length: 5 }).notNull().default(""),
    timeTo: varchar("time_to", { length: 5 }).notNull().default(""),
    // Validity window. Both nullable: null = open-ended on that side.
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    // Optional per-offer deal image. Null/empty = the customer card falls back
    // to the venue's cover photo (mirrors drink_plans.image_url behaviour).
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("vendor_offers_vendor_idx").on(t.vendorId),
    activeIdx: index("vendor_offers_vendor_active_idx").on(t.vendorId, t.active),
  }),
);

export type VendorOffer = typeof vendorOffersTable.$inferSelect;

// ─── Loyalty points ledger ────────────────────────────────────────────────────
// Append-only log of every points grant (positive) and redemption (negative).
// Used to enforce the 30-day expiry window and send tiered reminder notifications.
// usersTable.points remains the authoritative real-time balance.
export const pointsLedgerTable = pgTable(
  "points_ledger",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    points: integer("points").notNull(),             // >0 = earned, <0 = spent/expired
    source: varchar("source", { length: 30 }).notNull(), // "scan_in"|"referral"|"admin"|"redemption"|"expiry"
    bookingId: integer("booking_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // only set on earned (>0) rows
    notifiedDay20: boolean("notified_day_20").notNull().default(false),
    notifiedDay23: boolean("notified_day_23").notNull().default(false),
    notifiedDay26: boolean("notified_day_26").notNull().default(false),
    notifiedDay29: boolean("notified_day_29").notNull().default(false),
    expired: boolean("expired").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("points_ledger_user_idx").on(t.userId),
    expiresIdx: index("points_ledger_expires_idx").on(t.expiresAt),
    expiredIdx: index("points_ledger_expired_idx").on(t.expired),
  }),
);

export type PointsLedgerRow = typeof pointsLedgerTable.$inferSelect;

export type EmailAttachment = typeof emailAttachmentsTable.$inferSelect;

// ─── Event Organizer vertical ──────────────────────────────────────────────
//
// A completely separate account type from Pub/Club partners (`vendors`). An
// organizer hosts ticketed events (organizer_events) with multiple ticket tiers
// (event_tickets). Intentionally independent of vendors/events/announcements so
// the two systems never mix. See plan: Event Organizer Ecosystem.

export const organizersTable = pgTable(
  "organizers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    description: text("description").notNull().default(""),
    logoUrl: text("logo_url").notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    website: varchar("website", { length: 255 }).notNull().default(""),
    instagram: varchar("instagram", { length: 255 }).notNull().default(""),
    facebook: varchar("facebook", { length: 255 }).notNull().default(""),
    youtube: varchar("youtube", { length: 255 }).notNull().default(""),
    supportEmail: varchar("support_email", { length: 255 }).notNull().default(""),
    supportPhone: varchar("support_phone", { length: 50 }).notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    verified: boolean("verified").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // Per-organizer QR ticket signing material (mirrors vendorsTable). Populated
    // on profile create + by a boot backfill for legacy rows.
    ticketPrefix: varchar("ticket_prefix", { length: 8 }).notNull().default(""),
    ticketSalt: varchar("ticket_salt", { length: 32 }).notNull().default(""),
    // Settlement wallet (Phase C). Net ticket revenue accrues here.
    onlineBalance: numeric("online_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    commissionOwed: numeric("commission_owed", { precision: 14, scale: 2 }).notNull().default("0"),
    // Admin hide lever — when true, the organizer and all their events are removed
    // from every public surface without deleting data. Flipping back restores them.
    hidden: boolean("hidden").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique: many admin-created organizers can sit unassigned at the
    // sentinel owner id 0 before being assigned to a partner by email later
    // (mirrors vendors_user_assigned_idx). Assigned organizers keep one-per-user.
    userIdx: uniqueIndex("organizers_user_assigned_idx").on(t.userId).where(sql`user_id <> 0`),
    slugIdx: uniqueIndex("organizers_slug_idx").on(t.slug),
    statusIdx: index("organizers_status_idx").on(t.status),
  }),
);

export type Organizer = typeof organizersTable.$inferSelect;

export interface OrganizerArtist {
  name: string;
  role: string;
  imageUrl: string;
  bio: string;
  socials: string;
}
export interface OrganizerScheduleItem {
  time: string;
  title: string;
  desc: string;
}
export interface OrganizerPolicies {
  dressCode: string;
  entryRules: string;
  agePolicy: string;
  refundPolicy: string;
  cancellationPolicy: string;
}
export interface OrganizerFaq {
  q: string;
  a: string;
}

export const organizerEventsTable = pgTable(
  "organizer_events",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    // Basic
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    category: varchar("category", { length: 100 }).notNull().default(""),
    subcategory: varchar("subcategory", { length: 100 }).notNull().default(""),
    shortDescription: varchar("short_description", { length: 500 }).notNull().default(""),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    language: varchar("language", { length: 100 }).notNull().default(""),
    ageRestriction: varchar("age_restriction", { length: 50 }).notNull().default(""),
    // Media
    coverImageUrl: text("cover_image_url").notNull().default(""),
    bannerUrl: text("banner_url").notNull().default(""),
    mobileBannerUrl: text("mobile_banner_url").notNull().default(""),
    galleryImages: text("gallery_images").array().notNull().default([]),
    promoVideos: text("promo_videos").array().notNull().default([]),
    // Venue
    venueName: varchar("venue_name", { length: 255 }).notNull().default(""),
    address: text("address").notNull().default(""),
    mapsUrl: text("maps_url").notNull().default(""),
    capacity: integer("capacity").notNull().default(0),
    country: varchar("country", { length: 100 }).notNull().default("India"),
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    // Date & time
    startDate: date("start_date"),
    endDate: date("end_date"),
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    isMultiDay: boolean("is_multi_day").notNull().default(false),
    // ── Happening Tonight ── partner opt-in visibility gates + flash-deal label.
    happeningTonight: boolean("happening_tonight").notNull().default(true),
    startingSoon: boolean("starting_soon").notNull().default(true),
    lastMinuteDeal: boolean("last_minute_deal").notNull().default(false),
    dealLabel: varchar("deal_label", { length: 120 }).notNull().default(""),
    // ── Going Out With Friends ── group-booking controls. Ticket availability
    // is derived from event_tickets (quantity − sold_count); maxGroupSize=0
    // means no stated cap. groupOffer is the partner's free-text group promo.
    maxGroupSize: integer("max_group_size").notNull().default(0),
    groupBookingEnabled: boolean("group_booking_enabled").notNull().default(true),
    groupOffer: varchar("group_offer", { length: 160 }).notNull().default(""),
    // Rich blocks
    artists: jsonb("artists").$type<OrganizerArtist[]>(),
    highlights: jsonb("highlights").$type<string[]>(),
    schedule: jsonb("schedule").$type<OrganizerScheduleItem[]>(),
    policies: jsonb("policies").$type<OrganizerPolicies>(),
    faqs: jsonb("faqs").$type<OrganizerFaq[]>(),
    // Commission (Phase C). Admin sets per-event; each booking locks its rate
    // via bookings.eventCommissionPct so later changes don't re-price history.
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("8"),
    gatewayFeePercent: numeric("gateway_fee_percent", { precision: 5, scale: 2 }).notNull().default("2"),
    // ── Venue link (host pub/club/bar/lounge) ──────────────────────────────
    // When an organizer hosts the event at a partner venue, venueId points at
    // that vendor. The venue's partner must approve it (venueApprovalStatus)
    // before it goes public — partner approval also flips approvalStatus to
    // 'approved'. '' venueApprovalStatus means the event isn't venue-linked.
    venueId: integer("venue_id"),
    venueApprovalStatus: varchar("venue_approval_status", { length: 20 }).notNull().default(""),
    venueRejectionReason: text("venue_rejection_reason").notNull().default(""),
    // Workflow
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    isFeaturedSlider: boolean("is_featured_slider").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("organizer_events_organizer_idx").on(t.organizerId),
    approvalIdx: index("organizer_events_approval_idx").on(t.approvalStatus),
    slugIdx: index("organizer_events_slug_idx").on(t.slug),
    venueIdx: index("organizer_events_venue_idx").on(t.venueId),
  }),
);

export type OrganizerEvent = typeof organizerEventsTable.$inferSelect;

export const eventTicketsTable = pgTable(
  "event_tickets",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => organizerEventsTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 20 }).notNull().default("paid"), // free|paid|early_bird|vip|couple|group|student
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    quantity: integer("quantity").notNull().default(0),
    soldCount: integer("sold_count").notNull().default(0),
    bookingLimit: integer("booking_limit").notNull().default(0),
    salesStartAt: timestamp("sales_start_at", { withTimezone: true }),
    salesEndAt: timestamp("sales_end_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index("event_tickets_event_idx").on(t.eventId),
  }),
);

export type EventTicket = typeof eventTicketsTable.$inferSelect;

export const organizerReviewsTable = pgTable(
  "organizer_reviews",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    userId: integer("user_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("organizer_reviews_organizer_idx").on(t.organizerId),
    userOrganizerUniq: uniqueIndex("organizer_reviews_user_organizer_uniq").on(t.userId, t.organizerId),
  }),
);

export type OrganizerReview = typeof organizerReviewsTable.$inferSelect;

export const organizerTicketOrdersTable = pgTable(
  "organizer_ticket_orders",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => organizerEventsTable.id, { onDelete: "cascade" }),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => eventTicketsTable.id, { onDelete: "cascade" }),
    bookingCode: varchar("booking_code", { length: 16 }).notNull(),
    name: varchar("name", { length: 255 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: index("organizer_ticket_orders_event_idx").on(t.eventId),
    codeIdx: uniqueIndex("organizer_ticket_orders_code_idx").on(t.bookingCode),
  }),
);

export type OrganizerTicketOrder = typeof organizerTicketOrdersTable.$inferSelect;

export interface OrganizerManagerPermissions {
  scan: boolean;
  attendance: boolean;
  reports: boolean;
}

// Event Managers — mirrors vendor_managers. An organizer invites a person by
// email; once accepted, that user can scan tickets / mark attendance / view
// reports for the organizer, gated by the configurable `permissions` set.
export const organizerManagersTable = pgTable(
  "organizer_managers",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    invitedEmail: varchar("invited_email", { length: 255 }).notNull(),
    invitedBy: integer("invited_by").notNull(),
    managerId: integer("manager_id"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    permissions: jsonb("permissions").$type<OrganizerManagerPermissions>(),
    token: varchar("token", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("organizer_managers_organizer_idx").on(t.organizerId),
    managerIdx: index("organizer_managers_manager_idx").on(t.managerId),
  }),
);

export type OrganizerManager = typeof organizerManagersTable.$inferSelect;

// Per-booking commission split, realised when an attendee is checked in at the
// door (COD model — revenue is only real once they show up and pay). One row
// per checked-in organizer booking. Isolated from the vendor commission_ledger
// so the heavily-used pub financial tables are never touched.
export const organizerCommissionLedgerTable = pgTable(
  "organizer_commission_ledger",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    organizerEventId: integer("organizer_event_id"),
    bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
    revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    commission: numeric("commission", { precision: 12, scale: 2 }).notNull().default("0"),
    gatewayFee: numeric("gateway_fee", { precision: 12, scale: 2 }).notNull().default("0"),
    net: numeric("net", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("ocl_organizer_idx").on(t.organizerId),
    eventIdx: index("ocl_event_idx").on(t.organizerEventId),
    bookingUniq: uniqueIndex("ocl_booking_uniq").on(t.bookingId),
  }),
);
export type OrganizerCommissionLedger = typeof organizerCommissionLedgerTable.$inferSelect;

export const organizerBankingDetailsTable = pgTable(
  "organizer_banking_details",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    accountHolderName: varchar("account_holder_name", { length: 255 }).notNull().default(""),
    bankName: varchar("bank_name", { length: 255 }).notNull().default(""),
    accountNumber: varchar("account_number", { length: 50 }).notNull().default(""),
    ifscCode: varchar("ifsc_code", { length: 20 }).notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: uniqueIndex("obd_organizer_idx").on(t.organizerId),
  }),
);
export type OrganizerBankingDetails = typeof organizerBankingDetailsTable.$inferSelect;

// Settlement of dues between organizer and platform. For the COD model the
// organizer holds the cash and owes the platform its commission, so a
// settlement records the organizer remitting `amount` of owed commission.
export const organizerSettlementsTable = pgTable(
  "organizer_settlements",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("settled"),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("osr_organizer_idx").on(t.organizerId),
  }),
);
export type OrganizerSettlement = typeof organizerSettlementsTable.$inferSelect;

// Organizer discount codes, applied at ticket checkout. `eventId` null = valid
// for all of the organizer's events.
export const organizerCouponsTable = pgTable(
  "organizer_coupons",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    eventId: integer("event_id"),
    code: varchar("code", { length: 24 }).notNull(),
    discountType: varchar("discount_type", { length: 10 }).notNull().default("percent"), // percent|fixed
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("ocp_organizer_idx").on(t.organizerId),
    codeUniq: uniqueIndex("ocp_org_code_uniq").on(t.organizerId, t.code),
  }),
);
export type OrganizerCoupon = typeof organizerCouponsTable.$inferSelect;

// "Promote my event" requests — an admin approval flips the event into the
// Events-page hero slider (reuses organizer_events.is_featured_slider).
export const organizerAdRequestsTable = pgTable(
  "organizer_ad_requests",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    organizerEventId: integer("organizer_event_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    note: text("note").notNull().default(""),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("oar_organizer_idx").on(t.organizerId),
    statusIdx: index("oar_status_idx").on(t.status),
  }),
);
export type OrganizerAdRequest = typeof organizerAdRequestsTable.$inferSelect;

// Profile views on an organizer's public page / event pages — powers the
// organizer Leads tab (mirrors profile_views for vendors, kept isolated).
export const organizerProfileViewsTable = pgTable(
  "organizer_profile_views",
  {
    id: serial("id").primaryKey(),
    organizerId: integer("organizer_id").notNull(),
    viewerUserId: integer("viewer_user_id"),
    viewerName: varchar("viewer_name", { length: 255 }).notNull().default(""),
    viewerEmail: varchar("viewer_email", { length: 255 }).notNull().default(""),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("opv_organizer_idx").on(t.organizerId),
  }),
);
export type OrganizerProfileView = typeof organizerProfileViewsTable.$inferSelect;

// ─── Game Organizer vertical ───────────────────────────────────────────────
//
// A separate partner account type for gaming businesses (Gaming Zone, Arcade,
// VR Arena, Bowling, Paintball, Go-Kart, Pool/Snooker, PS/Xbox lounge, …). It
// mirrors the Event Organizer vertical (isolated `game_*` tables, same manager /
// scanning / commission / settlement / leads workflow) but the bookable unit is
// a **game** (with one of three pricing models) or a **package** of games — not
// a ticketed event. Bookings reuse the shared bookings table (kind = 'game').
// Role: `game_organizer`. See plan: Game Organizer Ecosystem.

export const gameOrganizersTable = pgTable(
  "game_organizers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    description: text("description").notNull().default(""),
    logoUrl: text("logo_url").notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    galleryImages: text("gallery_images").array().notNull().default([]),
    website: varchar("website", { length: 255 }).notNull().default(""),
    instagram: varchar("instagram", { length: 255 }).notNull().default(""),
    facebook: varchar("facebook", { length: 255 }).notNull().default(""),
    youtube: varchar("youtube", { length: 255 }).notNull().default(""),
    supportEmail: varchar("support_email", { length: 255 }).notNull().default(""),
    supportPhone: varchar("support_phone", { length: 50 }).notNull().default(""),
    address: text("address").notNull().default(""),
    mapsUrl: text("maps_url").notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    verified: boolean("verified").notNull().default(false),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    // Per-organizer QR ticket signing material (mirrors organizersTable).
    ticketPrefix: varchar("ticket_prefix", { length: 8 }).notNull().default(""),
    ticketSalt: varchar("ticket_salt", { length: 32 }).notNull().default(""),
    // Settlement wallet — net booking revenue accrues here.
    onlineBalance: numeric("online_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    commissionOwed: numeric("commission_owed", { precision: 14, scale: 2 }).notNull().default("0"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial unique: unassigned admin-created game organizers sit at sentinel
    // owner id 0 until assigned to a partner by email (mirrors vendors).
    userIdx: uniqueIndex("game_organizers_user_assigned_idx").on(t.userId).where(sql`user_id <> 0`),
    slugIdx: uniqueIndex("game_organizers_slug_idx").on(t.slug),
    statusIdx: index("game_organizers_status_idx").on(t.status),
  }),
);
export type GameOrganizer = typeof gameOrganizersTable.$inferSelect;

// A single bookable game. `pricingModel` selects which fields apply:
//  - 'fixed'  → price (per person)
//  - 'hourly' → hourlyRate (per hour) + minHours / maxHours
// (The third model, packages, lives in game_packages.)
export const gamesTable = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    category: varchar("category", { length: 100 }).notNull().default(""),
    description: text("description").notNull().default(""),
    rules: text("rules").notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    images: text("images").array().notNull().default([]),
    videos: text("videos").array().notNull().default([]),
    capacity: integer("capacity").notNull().default(0),
    ageRestriction: varchar("age_restriction", { length: 50 }).notNull().default(""),
    // Pricing
    pricingModel: varchar("pricing_model", { length: 12 }).notNull().default("fixed"), // fixed|hourly
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"), // fixed: per person
    // ── Happening Tonight ── tonight session window ("HH:MM", IST) for the venue,
    // plus partner opt-in visibility gates + flash-deal label.
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    happeningTonight: boolean("happening_tonight").notNull().default(true),
    startingSoon: boolean("starting_soon").notNull().default(true),
    lastMinuteDeal: boolean("last_minute_deal").notNull().default(false),
    dealLabel: varchar("deal_label", { length: 120 }).notNull().default(""),
    // ── Going Out With Friends ── `capacity` above is the lane/room/arena seat
    // count. maxGroupSize=0 means no stated cap; groupOffer is the group promo.
    maxGroupSize: integer("max_group_size").notNull().default(0),
    groupBookingEnabled: boolean("group_booking_enabled").notNull().default(true),
    groupOffer: varchar("group_offer", { length: 160 }).notNull().default(""),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0"),
    minHours: integer("min_hours").notNull().default(1),
    maxHours: integer("max_hours").notNull().default(0), // 0 = no max
    // Commission (admin sets per-game; each booking locks its rate via
    // bookings.eventCommissionPct so later changes don't re-price history).
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("8"),
    gatewayFeePercent: numeric("gateway_fee_percent", { precision: 5, scale: 2 }).notNull().default("2"),
    // Workflow
    active: boolean("active").notNull().default(true),
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    isFeaturedSlider: boolean("is_featured_slider").notNull().default(false),
    soldCount: integer("sold_count").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("games_game_organizer_idx").on(t.gameOrganizerId),
    approvalIdx: index("games_approval_idx").on(t.approvalStatus),
    slugIdx: index("games_slug_idx").on(t.slug),
  }),
);
export type Game = typeof gamesTable.$inferSelect;

// A package bundling several games (+ optional add-ons) at a discounted price.
export interface GamePackageItem {
  gameId: number | null;
  label: string;
  quantity: number;
}
export interface GamePackageAddon {
  label: string;
  price: number;
}
export const gamePackagesTable = pgTable(
  "game_packages",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().default(""),
    description: text("description").notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    images: text("images").array().notNull().default([]),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    items: jsonb("items").$type<GamePackageItem[]>(),
    addons: jsonb("addons").$type<GamePackageAddon[]>(),
    groupSize: integer("group_size").notNull().default(0), // 0 = not a group package
    capacity: integer("capacity").notNull().default(0),
    ageRestriction: varchar("age_restriction", { length: 50 }).notNull().default(""),
    commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("10"),
    gatewayFeePercent: numeric("gateway_fee_percent", { precision: 5, scale: 2 }).notNull().default("2"),
    active: boolean("active").notNull().default(true),
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    soldCount: integer("sold_count").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("game_packages_game_organizer_idx").on(t.gameOrganizerId),
    approvalIdx: index("game_packages_approval_idx").on(t.approvalStatus),
    slugIdx: index("game_packages_slug_idx").on(t.slug),
  }),
);
export type GamePackage = typeof gamePackagesTable.$inferSelect;

export const gameReviewsTable = pgTable(
  "game_reviews",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    userId: integer("user_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("game_reviews_game_organizer_idx").on(t.gameOrganizerId),
    userOrganizerUniq: uniqueIndex("game_reviews_user_organizer_uniq").on(t.userId, t.gameOrganizerId),
  }),
);
export type GameReview = typeof gameReviewsTable.$inferSelect;

export interface GameManagerPermissions {
  scan: boolean;
  attendance: boolean;
  reports: boolean;
}

// Game Managers — mirrors organizer_managers. A game organizer invites a person
// by email; once accepted they can scan tickets / mark attendance / view reports.
export const gameManagersTable = pgTable(
  "game_managers",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    invitedEmail: varchar("invited_email", { length: 255 }).notNull(),
    invitedBy: integer("invited_by").notNull(),
    managerId: integer("manager_id"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    permissions: jsonb("permissions").$type<GameManagerPermissions>(),
    token: varchar("token", { length: 64 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("game_managers_game_organizer_idx").on(t.gameOrganizerId),
    managerIdx: index("game_managers_manager_idx").on(t.managerId),
  }),
);
export type GameManager = typeof gameManagersTable.$inferSelect;

// Per-booking commission split, realised at check-in (COD model). One row per
// checked-in game booking.
export const gameCommissionLedgerTable = pgTable(
  "game_commission_ledger",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    gameId: integer("game_id"),
    gamePackageId: integer("game_package_id"),
    bookingId: integer("booking_id").references(() => bookingsTable.id, { onDelete: "set null" }),
    revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    commission: numeric("commission", { precision: 12, scale: 2 }).notNull().default("0"),
    gatewayFee: numeric("gateway_fee", { precision: 12, scale: 2 }).notNull().default("0"),
    net: numeric("net", { precision: 12, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("gcl_game_organizer_idx").on(t.gameOrganizerId),
    gameIdx: index("gcl_game_idx").on(t.gameId),
    bookingUniq: uniqueIndex("gcl_booking_uniq").on(t.bookingId),
  }),
);
export type GameCommissionLedger = typeof gameCommissionLedgerTable.$inferSelect;

export const gameBankingDetailsTable = pgTable(
  "game_banking_details",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    accountHolderName: varchar("account_holder_name", { length: 255 }).notNull().default(""),
    bankName: varchar("bank_name", { length: 255 }).notNull().default(""),
    accountNumber: varchar("account_number", { length: 50 }).notNull().default(""),
    ifscCode: varchar("ifsc_code", { length: 20 }).notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: uniqueIndex("gbd_game_organizer_idx").on(t.gameOrganizerId),
  }),
);
export type GameBankingDetails = typeof gameBankingDetailsTable.$inferSelect;

export const gameSettlementsTable = pgTable(
  "game_settlements",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    status: varchar("status", { length: 20 }).notNull().default("settled"),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("gsr_game_organizer_idx").on(t.gameOrganizerId),
  }),
);
export type GameSettlement = typeof gameSettlementsTable.$inferSelect;

// Game discount codes, applied at checkout. `gameId` null = valid for all of
// the organizer's games & packages.
export const gameCouponsTable = pgTable(
  "game_coupons",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    gameId: integer("game_id"),
    code: varchar("code", { length: 24 }).notNull(),
    discountType: varchar("discount_type", { length: 10 }).notNull().default("percent"), // percent|fixed
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
    active: boolean("active").notNull().default(true),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("gcp_game_organizer_idx").on(t.gameOrganizerId),
    codeUniq: uniqueIndex("gcp_org_code_uniq").on(t.gameOrganizerId, t.code),
  }),
);
export type GameCoupon = typeof gameCouponsTable.$inferSelect;

// "Promote my game" requests — admin approval flips the game into a featured
// slider on the public listing.
export const gameAdRequestsTable = pgTable(
  "game_ad_requests",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    gameId: integer("game_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    note: text("note").notNull().default(""),
    adminNote: text("admin_note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("gar_game_organizer_idx").on(t.gameOrganizerId),
    statusIdx: index("gar_status_idx").on(t.status),
  }),
);
export type GameAdRequest = typeof gameAdRequestsTable.$inferSelect;

// Profile views on a game organizer's public page — powers the Leads tab.
export const gameProfileViewsTable = pgTable(
  "game_profile_views",
  {
    id: serial("id").primaryKey(),
    gameOrganizerId: integer("game_organizer_id").notNull(),
    viewerUserId: integer("viewer_user_id"),
    viewerName: varchar("viewer_name", { length: 255 }).notNull().default(""),
    viewerEmail: varchar("viewer_email", { length: 255 }).notNull().default(""),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("gpv_game_organizer_idx").on(t.gameOrganizerId),
  }),
);
export type GameProfileView = typeof gameProfileViewsTable.$inferSelect;

// ─── Solo Connect vertical ──────────────────────────────────────────────────
//
// A premium, heavily-moderated, activity-based group discovery feature. Users
// join verified, single-gender, same-city groups tied to a real-world activity
// (nightlife / events / games / activities) — explicitly NOT a dating product.
// Access requires premium/verified-partner eligibility AND an approved identity
// verification. Gender (from users.gender) and the user's current city are
// enforced at BOTH the API and UI layers. Phase 1: verification + groups +
// membership. (Chat, safety center, reporting, reputation are later phases.)

// One identity-verification record per user. status drives participation:
// only `approved` users may create or join groups. The redesigned onboarding is
// phone-first: phone is verified via Firebase (firebaseUid set), a live selfie
// is captured, gender is recorded on the user, and consent is acknowledged.
// idType/idNumber/otpHash/otpExpiry are retained nullable for back-compat with
// the legacy ID-document + dev-OTP flow but are no longer written.
export const soloConnectVerificationsTable = pgTable(
  "solo_connect_verifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Legacy (no longer written): aadhaar | passport | driving_license | voter_id
    idType: varchar("id_type", { length: 20 }).notNull().default(""),
    idNumber: varchar("id_number", { length: 100 }).notNull().default(""),
    idDocumentUrl: text("id_document_url").notNull().default(""),
    selfieUrl: text("selfie_url").notNull().default(""),
    phone: varchar("phone", { length: 20 }).notNull().default(""),
    // Firebase Auth uid behind the verified phone (empty in dev-stub mode).
    firebaseUid: varchar("firebase_uid", { length: 128 }).notNull().default(""),
    // Legacy dev-OTP material (no longer written; Firebase handles OTP now).
    otpHash: varchar("otp_hash", { length: 255 }).notNull().default(""),
    otpExpiry: timestamp("otp_expiry", { withTimezone: true }),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    // Explicit consent to Terms / Community Guidelines / risk disclaimer.
    consentAcceptedAt: timestamp("consent_accepted_at", { withTimezone: true }),
    consentVersion: varchar("consent_version", { length: 20 }).notNull().default(""),
    // Moderation state — checked before any participation.
    suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
    banned: boolean("banned").notNull().default(false),
    // pending | approved | rejected
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    reviewedByUserId: integer("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userUniq: uniqueIndex("solo_verifications_user_uniq").on(t.userId),
    statusIdx: index("solo_verifications_status_idx").on(t.status),
    // One account per verified phone number (anti-duplicate). Partial so the
    // many rows with an empty phone don't collide.
    phoneUniq: uniqueIndex("solo_verifications_phone_uniq")
      .on(t.phone)
      .where(sql`${t.phone} <> ''`),
  }),
);
export type SoloConnectVerification = typeof soloConnectVerificationsTable.$inferSelect;

// An activity-based group. genderType is now a non-gating LABEL
// (`male` | `female` | `mixed`) describing the group's vibe — both genders may
// join any group. country/state/city capture the creator's verified location;
// only same-city members may join. lastActivityAt drives auto-expiry; deletedAt
// is a soft delete that the inactivity job sets (restorable within a grace
// window before the rows are hard-purged).
export const soloGroupsTable = pgTable(
  "solo_groups",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    // nightlife | events | games | activities
    activityType: varchar("activity_type", { length: 20 }).notNull().default("nightlife"),
    // Free-text activity label, e.g. "Pub Crawl Tonight", "VR Gaming Group"
    activityLabel: varchar("activity_label", { length: 160 }).notNull().default(""),
    venueName: varchar("venue_name", { length: 255 }).notNull().default(""),
    vendorId: integer("vendor_id"),
    eventId: integer("event_id"),
    groupDate: date("group_date"),
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    description: text("description").notNull().default(""),
    minMembers: integer("min_members").notNull().default(3),
    maxMembers: integer("max_members").notNull().default(15),
    country: varchar("country", { length: 100 }).notNull().default("India"),
    state: varchar("state", { length: 100 }).notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    // male | female | mixed — a non-gating label (default mixed). Both genders
    // may join any group; this only describes the intended vibe.
    genderType: varchar("gender_type", { length: 10 }).notNull().default("mixed"),
    // public | private. A private group stays VISIBLE in the browse list but
    // only people who open the host's invite link (carrying invite_token) may
    // request to join.
    visibility: varchar("visibility", { length: 10 }).notNull().default("public"),
    // Secret token embedded in the host's share link. Joining a private group
    // requires ?invite=<this>. Exposed to the group admin only.
    inviteToken: varchar("invite_token", { length: 40 }).notNull().default(""),
    // open | locked | closed
    status: varchar("status", { length: 10 }).notNull().default("open"),
    reputationScore: numeric("reputation_score", { precision: 4, scale: 2 }).notNull().default("0"),
    ratingCount: integer("rating_count").notNull().default(0),
    // Auto-expiry bookkeeping: bumped on new member/approve/message. Once it
    // goes 15 days stale the group is soft-deleted (deletedAt set).
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    expiryWarnedAt: timestamp("expiry_warned_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedReason: varchar("deleted_reason", { length: 30 }).notNull().default(""),
    // ── "Create Your Own Party" fields (activity_type = 'party') ──────────
    // A user-hosted party carries its own cover photo, full address + pin,
    // a Google-Maps link, organizer name, an end time and a ticket model.
    // All empty/null for non-party groups.
    coverImageUrl: text("cover_image_url").notNull().default(""),
    address: text("address").notNull().default(""),
    pinCode: varchar("pin_code", { length: 12 }).notNull().default(""),
    mapLocation: text("map_location").notNull().default(""),
    organizerName: varchar("organizer_name", { length: 120 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    // "" (n/a) | free | paid
    ticketType: varchar("ticket_type", { length: 10 }).notNull().default(""),
    ticketPrice: numeric("ticket_price", { precision: 10, scale: 2 }).notNull().default("0"),
    // Total party capacity (paid parties); null = not applicable / unlimited.
    capacity: integer("capacity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cityStatusIdx: index("solo_groups_city_status_idx").on(t.city, t.status),
    adminIdx: index("solo_groups_admin_idx").on(t.adminUserId),
    activityIdx: index("solo_groups_activity_idx").on(t.lastActivityAt),
  }),
);
export type SoloGroup = typeof soloGroupsTable.$inferSelect;

// Membership / join-request rows. The creator is inserted as role=admin,
// status=approved. status: requested | approved | rejected | removed | left.
export const soloGroupMembersTable = pgTable(
  "solo_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => soloGroupsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    role: varchar("role", { length: 10 }).notNull().default("member"),
    status: varchar("status", { length: 12 }).notNull().default("requested"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupUserUniq: uniqueIndex("solo_group_members_group_user_uniq").on(t.groupId, t.userId),
    userIdx: index("solo_group_members_user_idx").on(t.userId),
  }),
);
export type SoloGroupMember = typeof soloGroupMembersTable.$inferSelect;

// Temporary group chat. All rows are wiped daily at 03:00 (IST) by a cron job
// for privacy/safety, so this table only ever holds the current day's messages.
export const soloGroupMessagesTable = pgTable(
  "solo_group_messages",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => soloGroupsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("solo_group_messages_group_idx").on(t.groupId),
    createdIdx: index("solo_group_messages_created_idx").on(t.createdAt),
  }),
);
export type SoloGroupMessage = typeof soloGroupMessagesTable.$inferSelect;

// Member-to-member safety reports filed inside a joined group. status drives the
// admin moderation queue; actionTaken records the moderation outcome. evidenceUrl
// is an optional auth-gated upload supporting the report.
export const soloReportsTable = pgTable(
  "solo_reports",
  {
    id: serial("id").primaryKey(),
    reporterUserId: integer("reporter_user_id").notNull(),
    reportedUserId: integer("reported_user_id").notNull(),
    groupId: integer("group_id").notNull(),
    // harassment | fake_profile | abuse | spam | inappropriate | safety | other
    reason: varchar("reason", { length: 24 }).notNull(),
    description: text("description").notNull().default(""),
    evidenceUrl: text("evidence_url").notNull().default(""),
    // open | under_review | resolved | rejected
    status: varchar("status", { length: 16 }).notNull().default("open"),
    // warn | suspend | ban | remove | none
    actionTaken: varchar("action_taken", { length: 16 }).notNull().default(""),
    adminNote: text("admin_note").notNull().default(""),
    reviewedByUserId: integer("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reportedIdx: index("solo_reports_reported_idx").on(t.reportedUserId),
    statusIdx: index("solo_reports_status_idx").on(t.status),
    // Throttle duplicate spam: one OPEN report per (reporter, reported, group).
    openUniq: uniqueIndex("solo_reports_open_uniq")
      .on(t.reporterUserId, t.reportedUserId, t.groupId)
      .where(sql`${t.status} = 'open'`),
  }),
);
export type SoloReport = typeof soloReportsTable.$inferSelect;

// Append-only audit log of every moderation action an admin takes against a
// Solo Connector member or group.
export const soloModerationActionsTable = pgTable(
  "solo_moderation_actions",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").notNull(),
    targetUserId: integer("target_user_id"),
    groupId: integer("group_id"),
    reportId: integer("report_id"),
    // warn | suspend | ban | remove | resolve | reject | restore
    action: varchar("action", { length: 16 }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index("solo_moderation_actions_target_idx").on(t.targetUserId),
    createdIdx: index("solo_moderation_actions_created_idx").on(t.createdAt),
  }),
);
export type SoloModerationAction = typeof soloModerationActionsTable.$inferSelect;

// Auto-deletion audit + restore source. The inactivity job snapshots a group
// here when it soft-deletes it; admins can restore until restorableUntil, after
// which the group's rows + media are hard-purged.
export const soloDeletedGroupsLogTable = pgTable(
  "solo_deleted_groups_log",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").notNull(),
    name: varchar("name", { length: 160 }).notNull().default(""),
    memberCount: integer("member_count").notNull().default(0),
    // inactivity | admin
    reason: varchar("reason", { length: 30 }).notNull().default("inactivity"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    restorableUntil: timestamp("restorable_until", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => ({
    groupIdx: index("solo_deleted_groups_log_group_idx").on(t.groupId),
  }),
);
export type SoloDeletedGroupLog = typeof soloDeletedGroupsLogTable.$inferSelect;

// ─── "Create Your Own Party" vertical ────────────────────────────────────────
//
// A standalone, user-hosted ticketed party product. Deliberately ISOLATED from
// the pub/club/event/vendor tables (its own entity, tickets, bookings, payments,
// commission config and attendee list) so its money flows never touch the
// heavily-used partner financial tables. Mirrors the Event Organizer vertical's
// shape, minus manager/QR/check-in/table-booking. Online payment only.

// The party entity. organizerUserId/createdBy are a normal user (the host).
// joinType GATES who may book (enforced server-side against users.gender).
export const createYourPartyTable = pgTable(
  "create_your_party",
  {
    id: serial("id").primaryKey(),
    organizerUserId: integer("organizer_user_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().default(""),
    coverImageUrl: text("cover_image_url").notNull().default(""),
    // Optional host-uploaded photo gallery, shown to viewers below the hero.
    galleryImages: text("gallery_images").array().notNull().default([]),
    description: text("description").notNull().default(""),
    rules: text("rules").notNull().default(""),
    category: varchar("category", { length: 80 }).notNull().default(""),
    // public | private. A private party stays VISIBLE in the browse list but
    // only people who open the host's invite link (carrying invite_token) may
    // book a spot.
    visibility: varchar("visibility", { length: 10 }).notNull().default("public"),
    // Secret token embedded in the host's share link. Booking a private party
    // requires ?invite=<this>. Exposed to the organizer only.
    inviteToken: varchar("invite_token", { length: 40 }).notNull().default(""),
    venueName: varchar("venue_name", { length: 255 }).notNull().default(""),
    address: text("address").notNull().default(""),
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    pinCode: varchar("pin_code", { length: 12 }).notNull().default(""),
    mapLocation: text("map_location").notNull().default(""),
    partyDate: date("party_date"),
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    // male_only | female_only | mixed — GATES booking by gender (mandatory).
    joinType: varchar("join_type", { length: 12 }).notNull().default("mixed"),
    organizerName: varchar("organizer_name", { length: 120 }).notNull().default(""),
    capacity: integer("capacity").notNull().default(0),
    // ── Optional vibe metadata ───────────────────────────────────────────
    // age_group: '' | 18-25 | 25-35 | 35+   dress_code: '' | casual | smart_casual | black_theme | white_theme
    ageGroup: varchar("age_group", { length: 12 }).notNull().default(""),
    dressCode: varchar("dress_code", { length: 20 }).notNull().default(""),
    // Party preferences — '' (unspecified) | yes | no
    drinking: varchar("drinking", { length: 4 }).notNull().default(""),
    smoking: varchar("smoking", { length: 4 }).notNull().default(""),
    coupleFriendly: varchar("couple_friendly", { length: 4 }).notNull().default(""),
    lgbtqFriendly: varchar("lgbtq_friendly", { length: 4 }).notNull().default(""),
    // published | sales_stopped | cancelled | completed
    status: varchar("status", { length: 16 }).notNull().default("published"),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    organizerIdx: index("cyp_organizer_idx").on(t.organizerUserId),
    cityStatusIdx: index("cyp_city_status_idx").on(t.city, t.status),
    slugIdx: index("cyp_slug_idx").on(t.slug),
  }),
);
export type CreateYourParty = typeof createYourPartyTable.$inferSelect;

// Ticket model for a party (free | paid). Usually one row per party, but kept as
// a table (mirrors event_tickets) for future multi-tier support.
export const createYourPartyTicketsTable = pgTable(
  "create_your_party_tickets",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => createYourPartyTable.id, { onDelete: "cascade" }),
    // free | paid
    type: varchar("type", { length: 10 }).notNull().default("free"),
    name: varchar("name", { length: 120 }).notNull().default("Entry"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    quantity: integer("quantity").notNull().default(0),
    soldCount: integer("sold_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partyIdx: index("cyp_tickets_party_idx").on(t.partyId),
  }),
);
export type CreateYourPartyTicket = typeof createYourPartyTicketsTable.$inferSelect;

// A booking/order. commissionAmount + netAmount are LOCKED at confirmation so
// later commission-config changes never re-price history.
export const createYourPartyBookingsTable = pgTable(
  "create_your_party_bookings",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => createYourPartyTable.id, { onDelete: "cascade" }),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => createYourPartyTicketsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    bookingCode: varchar("booking_code", { length: 16 }).notNull(),
    name: varchar("name", { length: 255 }).notNull().default(""),
    email: varchar("email", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull().default("0"),
    commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    // payment_pending | confirmed | cancelled | completed
    status: varchar("status", { length: 20 }).notNull().default("confirmed"),
    // none | initiated | success | failed
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("none"),
    // Door check-in — set when the host scans this booking's QR/ticket code.
    checkedIn: boolean("checked_in").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    partyIdx: index("cyp_bookings_party_idx").on(t.partyId),
    userIdx: index("cyp_bookings_user_idx").on(t.userId),
    codeUniq: uniqueIndex("cyp_bookings_code_uniq").on(t.bookingCode),
  }),
);
export type CreateYourPartyBooking = typeof createYourPartyBookingsTable.$inferSelect;

// Razorpay payment record for a paid party booking (online only). Mirrors the
// relevant subset of the shared payments table but isolated.
export const createYourPartyPaymentsTable = pgTable(
  "create_your_party_payments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => createYourPartyBookingsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
    razorpayOrderId: varchar("razorpay_order_id", { length: 64 }).notNull().default(""),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 64 }).notNull().default(""),
    // initiated | success | failed
    status: varchar("status", { length: 12 }).notNull().default("initiated"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookingIdx: index("cyp_payments_booking_idx").on(t.bookingId),
    orderIdx: index("cyp_payments_order_idx").on(t.razorpayOrderId),
  }),
);
export type CreateYourPartyPayment = typeof createYourPartyPaymentsTable.$inferSelect;

// Platform commission CONFIG for parties — a single active row, admin-set.
// Independent of pub/club/event commission. Per-booking realised amounts are
// locked onto create_your_party_bookings.
export const createYourPartyCommissionsTable = pgTable(
  "create_your_party_commissions",
  {
    id: serial("id").primaryKey(),
    // fixed | percentage
    commissionType: varchar("commission_type", { length: 12 }).notNull().default("percentage"),
    value: numeric("value", { precision: 10, scale: 2 }).notNull().default("10"),
    active: boolean("active").notNull().default(true),
    updatedBy: integer("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
export type CreateYourPartyCommission = typeof createYourPartyCommissionsTable.$inferSelect;

// Attendee list — one row per confirmed booking, used by the organizer's
// "View Attendees" / "Upcoming Guests" views.
export const createYourPartyAttendeesTable = pgTable(
  "create_your_party_attendees",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => createYourPartyTable.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => createYourPartyBookingsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    name: varchar("name", { length: 255 }).notNull().default(""),
    gender: varchar("gender", { length: 20 }).notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    // going | cancelled
    status: varchar("status", { length: 12 }).notNull().default("going"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partyIdx: index("cyp_attendees_party_idx").on(t.partyId),
    bookingIdx: index("cyp_attendees_booking_idx").on(t.bookingId),
  }),
);
export type CreateYourPartyAttendee = typeof createYourPartyAttendeesTable.$inferSelect;

// Party group chat — host + confirmed attendees only. Mirrors solo_group_messages.
// Viewers can see the chat panel on the profile but the API gates read/write to
// people who've joined (booked) the party (or the host).
export const createYourPartyMessagesTable = pgTable(
  "create_your_party_messages",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => createYourPartyTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    partyIdx: index("cyp_messages_party_idx").on(t.partyId),
  }),
);
export type CreateYourPartyMessage = typeof createYourPartyMessagesTable.$inferSelect;
