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
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
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
    bannerImage: text("banner_image").notNull().default(""),
    portfolioImages: text("portfolio_images").array().notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
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
    location: varchar("location", { length: 255 }).notNull().default(""),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    capacity: integer("capacity").notNull().default(0),
    imageUrl: text("image_url").notNull().default(""),
    featured: boolean("featured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("events_vendor_idx").on(t.vendorId),
    categoryIdx: index("events_category_idx").on(t.category),
  }),
);

export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    userId: integer("user_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    bookingDate: date("booking_date").notNull(),
    guests: integer("guests").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    vendorIdx: index("reviews_vendor_idx").on(t.vendorId),
    eventIdx: index("reviews_event_idx").on(t.eventId),
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

export type User = typeof usersTable.$inferSelect;
export type Vendor = typeof vendorsTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type Review = typeof reviewsTable.$inferSelect;
export type Availability = typeof availabilityTable.$inferSelect;
