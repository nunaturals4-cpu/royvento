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
    retainForever: boolean("retain_forever").notNull().default(false),
    approvalStatus: varchar("approval_status", { length: 20 })
      .notNull()
      .default("pending"),
    rejectionReason: text("rejection_reason"),
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
    eventId: integer("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "restrict" }),
    userId: integer("user_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
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
    personName: varchar("person_name", { length: 255 }).notNull().default(""),
    phone: varchar("phone", { length: 20 }).notNull().default(""),
    pointsUsed: integer("points_used").notNull().default(0),
    approvedBy: varchar("approved_by", { length: 20 }).notNull().default(""),
    rejectionReason: text("rejection_reason"),
    checkedIn: boolean("checked_in").notNull().default(false),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vendorIdx: index("drink_plans_vendor_idx").on(t.vendorId),
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
