import {
  db,
  usersTable,
  vendorsTable,
  eventsTable,
  bookingsTable,
  reviewsTable,
  availabilityTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";

async function hash(p: string) {
  return bcrypt.hash(p, 10);
}

async function main() {
  console.log("Seeding Royvento database...");

  await db.delete(reviewsTable);
  await db.delete(availabilityTable);
  await db.delete(bookingsTable);
  await db.delete(eventsTable);
  await db.delete(vendorsTable);
  await db.delete(usersTable);

  const adminPwd = await hash("admin123");
  const userPwd = await hash("password123");
  const vendorPwd = await hash("vendor123");

  const [admin, alice, bob, vendor1User, vendor2User, vendor3User, pendingUser] =
    await db
      .insert(usersTable)
      .values([
        {
          email: "admin@royvento.com",
          passwordHash: adminPwd,
          name: "Royvento Admin",
          role: "admin",
        },
        {
          email: "alice@example.com",
          passwordHash: userPwd,
          name: "Alice Carter",
          role: "user",
        },
        {
          email: "bob@example.com",
          passwordHash: userPwd,
          name: "Bob Nguyen",
          role: "user",
        },
        {
          email: "lumiere@royvento.com",
          passwordHash: vendorPwd,
          name: "Camille Beaumont",
          role: "vendor",
        },
        {
          email: "atelier@royvento.com",
          passwordHash: vendorPwd,
          name: "Marco Riviera",
          role: "vendor",
        },
        {
          email: "harvest@royvento.com",
          passwordHash: vendorPwd,
          name: "Elena Park",
          role: "vendor",
        },
        {
          email: "newvendor@royvento.com",
          passwordHash: vendorPwd,
          name: "Theo Salam",
          role: "vendor",
        },
      ])
      .returning();

  if (!admin || !alice || !bob || !vendor1User || !vendor2User || !vendor3User || !pendingUser) {
    throw new Error("Failed to seed users");
  }

  const [v1, v2, v3, vPending] = await db
    .insert(vendorsTable)
    .values([
      {
        userId: vendor1User.id,
        businessName: "Lumière Weddings",
        category: "Wedding",
        description:
          "Heirloom-quality wedding production. From Bordeaux estates to Brooklyn rooftops, we design bespoke celebrations that feel like memory, not theater.",
        location: "San Francisco, CA",
        bannerImage:
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
        portfolioImages: [
          "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=80",
          "https://images.unsplash.com/photo-1530023367847-a683933f4172?w=1200&q=80",
          "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80",
          "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1200&q=80",
        ],
        status: "approved",
      },
      {
        userId: vendor2User.id,
        businessName: "Atelier Riviera",
        category: "Corporate",
        description:
          "Corporate gatherings designed by people who refuse to call them 'corporate.' Product launches, summits, and team retreats with genuine craft.",
        location: "New York, NY",
        bannerImage:
          "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&q=80",
        portfolioImages: [
          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80",
          "https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&q=80",
          "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?w=1200&q=80",
        ],
        status: "approved",
      },
      {
        userId: vendor3User.id,
        businessName: "Harvest Co.",
        category: "Festival",
        description:
          "Outdoor festivals and seasonal markets. Long tables, lantern light, and the kind of music people email you about a week later.",
        location: "Austin, TX",
        bannerImage:
          "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=80",
        portfolioImages: [
          "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1200&q=80",
          "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80",
          "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&q=80",
        ],
        status: "approved",
      },
      {
        userId: pendingUser.id,
        businessName: "Salam Soirées",
        category: "Private",
        description:
          "Intimate private dinners and salons hosted in restored townhouses around the city.",
        location: "Chicago, IL",
        bannerImage:
          "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80",
        portfolioImages: [
          "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
        ],
        status: "pending",
      },
    ])
    .returning();

  if (!v1 || !v2 || !v3 || !vPending) throw new Error("Failed to seed vendors");

  const events = await db
    .insert(eventsTable)
    .values([
      {
        vendorId: v1.id,
        title: "Garden Estate Wedding",
        description:
          "A full-day garden wedding with floral arches, string quartet, and a candlelit family-style dinner under the trees.",
        category: "Wedding",
        location: "Sonoma, CA",
        price: "12500",
        capacity: 120,
        imageUrl:
          "https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80",
        featured: true,
      },
      {
        vendorId: v1.id,
        title: "Rooftop Vow Renewal",
        description:
          "An intimate evening rooftop ceremony with skyline views, a small jazz trio, and a curated tasting menu.",
        category: "Wedding",
        location: "Brooklyn, NY",
        price: "5800",
        capacity: 40,
        imageUrl:
          "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=1600&q=80",
        featured: true,
      },
      {
        vendorId: v2.id,
        title: "Founders Summit",
        description:
          "A two-day private summit for founders and operators — designed talks, intentional dinners, and zero badges.",
        category: "Corporate",
        location: "Manhattan, NY",
        price: "18900",
        capacity: 80,
        imageUrl:
          "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&q=80",
        featured: true,
      },
      {
        vendorId: v2.id,
        title: "Product Launch Reception",
        description:
          "An evening launch experience with custom installations, live demos, and a tightly run press hour.",
        category: "Corporate",
        location: "San Francisco, CA",
        price: "9200",
        capacity: 150,
        imageUrl:
          "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80",
      },
      {
        vendorId: v3.id,
        title: "Hill Country Harvest Festival",
        description:
          "An open-air harvest festival with regional vintners, long communal tables, and three live music acts under lanterns.",
        category: "Festival",
        location: "Austin, TX",
        price: "75",
        capacity: 600,
        imageUrl:
          "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1600&q=80",
        featured: true,
      },
      {
        vendorId: v3.id,
        title: "Spring Night Market",
        description:
          "A pop-up night market with regional makers, slow food vendors, and a small folk stage.",
        category: "Festival",
        location: "Austin, TX",
        price: "25",
        capacity: 1200,
        imageUrl:
          "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&q=80",
      },
    ])
    .returning();

  const e1 = events[0];
  const e2 = events[1];
  const e3 = events[2];
  const e5 = events[4];
  if (!e1 || !e2 || !e3 || !e5) throw new Error("Failed to seed events");

  await db.insert(bookingsTable).values([
    {
      eventId: e1.id,
      userId: alice.id,
      vendorId: v1.id,
      bookingDate: "2026-06-15",
      guests: 80,
      totalPrice: "1000000",
      notes: "Outdoor preferred, vegetarian menu.",
      status: "confirmed",
    },
    {
      eventId: e3.id,
      userId: bob.id,
      vendorId: v2.id,
      bookingDate: "2026-05-20",
      guests: 60,
      totalPrice: "1134000",
      notes: "Need AV for keynote.",
      status: "pending",
    },
    {
      eventId: e5.id,
      userId: alice.id,
      vendorId: v3.id,
      bookingDate: "2026-09-12",
      guests: 4,
      totalPrice: "300",
      notes: "Family of four.",
      status: "confirmed",
    },
    {
      eventId: e2.id,
      userId: bob.id,
      vendorId: v1.id,
      bookingDate: "2026-07-04",
      guests: 30,
      totalPrice: "174000",
      notes: "",
      status: "completed",
    },
  ]);

  await db.insert(reviewsTable).values([
    {
      userId: alice.id,
      vendorId: v1.id,
      eventId: e1.id,
      rating: 5,
      comment:
        "Lumière made our wedding feel like a film we'd want to live in forever. Every detail considered.",
    },
    {
      userId: bob.id,
      vendorId: v1.id,
      eventId: e2.id,
      rating: 5,
      comment: "Our rooftop renewal was perfect. Tight, considered, beautiful.",
    },
    {
      userId: bob.id,
      vendorId: v2.id,
      eventId: e3.id,
      rating: 4,
      comment: "Excellent execution. Coffee could have been stronger.",
    },
    {
      userId: alice.id,
      vendorId: v3.id,
      eventId: e5.id,
      rating: 5,
      comment: "Best festival night of the summer. Already bought tickets to the next one.",
    },
  ]);

  const today = new Date();
  const av: { vendorId: number; date: string; status: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    if (i % 6 === 0) av.push({ vendorId: v1.id, date: ds, status: "blocked" });
    if (i % 4 === 0) av.push({ vendorId: v2.id, date: ds, status: "available" });
    if (i % 5 === 0) av.push({ vendorId: v3.id, date: ds, status: "available" });
  }
  av.push({ vendorId: v1.id, date: "2026-06-15", status: "booked" });
  av.push({ vendorId: v2.id, date: "2026-05-20", status: "booked" });
  av.push({ vendorId: v3.id, date: "2026-09-12", status: "booked" });
  await db.insert(availabilityTable).values(av);

  console.log("Seed complete.");
  console.log("Test accounts:");
  console.log("  admin@royvento.com / admin123");
  console.log("  alice@example.com / password123");
  console.log("  lumiere@royvento.com / vendor123 (vendor)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
