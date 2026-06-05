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
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ticketPrefix: varchar("ticket_prefix", { length: 8 }).notNull().default(""),
    ticketSalt: varchar("ticket_salt", { length: 32 }).notNull().default(""),
    danceFloor: varchar("dance_floor", { length: 20 }),
    danceFloorPhotos: text("dance_floor_photos").array(),
    menuUrl: text("menu_url").notNull().default(""),
    menuUrls: text("menu_urls").array().notNull().default([]),
    crowdLevel: varchar("crowd_level", { length: 20 }),
    onlineBalance: numeric("online_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    commissionOwed: numeric("commission_owed", { precision: 14, scale: 2 }).notNull().default("0"),
    baseFeePercent: numeric("base_fee_percent", { precision: 5, scale: 2 }).notNull().default("3.50"),
    baseFeeEnabled: boolean("base_fee_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: uniqueIndex("vendors_user_idx").on(t.userId),
    statusIdx: index("vendors_status_idx").on(t.status),
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
    pubMode: varchar("pub_mode", { length: 20 }).notNull().default(""),
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
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: uniqueIndex("organizers_user_idx").on(t.userId),
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
    city: varchar("city", { length: 100 }).notNull().default(""),
    state: varchar("state", { length: 100 }).notNull().default(""),
    // Date & time
    startDate: date("start_date"),
    endDate: date("end_date"),
    startTime: varchar("start_time", { length: 8 }).notNull().default(""),
    endTime: varchar("end_time", { length: 8 }).notNull().default(""),
    isMultiDay: boolean("is_multi_day").notNull().default(false),
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
