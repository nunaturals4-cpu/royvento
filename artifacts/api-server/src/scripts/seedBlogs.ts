import { db, blogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const blogs = [
  {
    title: "Top 10 Pubs in Mumbai You Must Visit in 2026",
    slug: "top-10-pubs-mumbai-2026",
    excerpt: "From rooftop bars in Bandra to underground speakeasies in Lower Parel, here are the best pubs Mumbai has to offer right now.",
    content: `<p>Mumbai's nightlife is unmatched. Whether you're hunting for craft beers, live music, or the perfect whiskey sour, the city delivers. We've rounded up the 10 pubs that define Mumbai's drinking culture in 2026.</p><h2>1. The Bandra Loft</h2><p>Perched above the chaos of Linking Road, The Bandra Loft offers stunning sea views alongside an expertly curated craft beer menu. Their Wednesday trivia nights have become legendary among expats and locals alike.</p><h2>2. Speakeasy Lower Parel</h2><p>Hidden behind a bookshelf in a heritage mill compound, Speakeasy pays homage to Prohibition-era cocktail culture. Book ahead — tables go in minutes.</p><h2>3. The Colaba Social</h2><p>Sprawling, chaotic, and brilliant. Social's Colaba outpost remains the go-to for everything from power lunches to late-night DJ sets. Discover all 10 on Royvento.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800",
    authorName: "Arjun Mehta",
    tags: ["Mumbai", "Nightlife", "Pubs"],
    published: true,
  },
  {
    title: "Ladies Night Guide: Best Deals Across Indian Pubs",
    slug: "ladies-night-guide-india",
    excerpt: "Every city has its ladies night, but not all are created equal. Here's the definitive guide to the best ladies night offers on Royvento.",
    content: `<p>Ladies nights are a staple of Indian nightlife — but knowing where to go and when can be the difference between a great night and a disappointing one. We've scouted the best offers across Delhi, Mumbai, Bangalore, and Hyderabad.</p><h2>Delhi NCR</h2><p>In Delhi, Hauz Khas Village remains the epicentre of ladies night culture. Several pubs offer free entry and complimentary drinks until midnight on Wednesdays and Thursdays.</p><h2>Mumbai</h2><p>Bandra West leads the pack. Look for venues offering unlimited cocktails between 8 PM and 10 PM — the early bird window is where the real value lies.</p><h2>Bangalore</h2><p>Indiranagar's pub strip is unbeatable on Friday evenings. Multiple establishments compete fiercely for footfall, driving up the quality of offers.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1575444758702-4a6b9222336e?w=800",
    authorName: "Priya Nair",
    tags: ["Ladies Night", "Deals", "Guide"],
    published: true,
  },
  {
    title: "How to Plan the Perfect Corporate Night Out",
    slug: "corporate-night-out-guide",
    excerpt: "Organising a team outing at a pub? From booking a private section to managing dietary requirements, here is everything you need to know.",
    content: `<p>Corporate outings to pubs are back in style — and for good reason. They are affordable, flexible, and almost universally enjoyed. Here is how to pull one off without a hitch.</p><h2>Choose the Right Venue</h2><p>Look for pubs that offer semi-private or fully private sections. On Royvento, you can filter venues by group size and check whether corporate bookings are accepted.</p><h2>Sort the Logistics Early</h2><p>Book at least two weeks in advance for groups over 20. Call ahead to confirm the menu and any dietary requirements — most good pubs in India now accommodate vegetarian, vegan, and Jain diets without fuss.</p><h2>Set a Budget Per Head</h2><p>The sweet spot for a corporate outing in a Tier-1 Indian city is Rs 1,500–2,500 per person, inclusive of food and drinks.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1529543544282-ea669407fca3?w=800",
    authorName: "Royvento Editorial",
    tags: ["Corporate", "Events", "Groups"],
    published: true,
  },
  {
    title: "Craft Beer Revolution: India's Best Microbreweries",
    slug: "craft-beer-india-microbreweries",
    excerpt: "India's craft beer scene has exploded over the past three years. We explore the microbreweries pushing the boundaries of what Indian beer can be.",
    content: `<p>Five years ago, craft beer in India meant a handful of Bangalore brewpubs. Today it is a nationwide movement with over 200 microbreweries operating from Guwahati to Goa. Here are the standouts.</p><h2>Independence Brewing Co. — Pune</h2><p>Their Mango Wheat Ale is nothing short of a masterpiece — tropical, slightly tart, and perfectly balanced. The taproom itself is worth the trip to Kharadi.</p><h2>White Owl — Mumbai</h2><p>White Owl's Torpedo IPA has become a benchmark for Indian IPAs. Crisp, piney, and unapologetically hoppy.</p><h2>Simba — Chhattisgarh</h2><p>The fact that one of India's best stouts comes from a small-town brewery speaks to how broadly the craft movement has spread. Simba's Coconut Stout is a revelation.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800",
    authorName: "Vikram Rao",
    tags: ["Craft Beer", "Microbreweries", "Food & Drink"],
    published: true,
  },
  {
    title: "Rooftop Bars: Sky-High Drinking in Bangalore",
    slug: "rooftop-bars-bangalore",
    excerpt: "Bangalore's skyline is best enjoyed with a cocktail in hand. We round up the rooftop bars that offer the most breathtaking views in the Garden City.",
    content: `<p>Bangalore may not have Mumbai's sea view, but its rooftop bar scene rivals any city in India. Here are the venues that make the most of their altitude.</p><h2>Toast and Tonic — MG Road</h2><p>The OG Bangalore rooftop. Toast and Tonic's open-air terrace above MG Road has been the scene of countless first dates and farewell parties. Their botanical cocktail programme is exceptional.</p><h2>The High Ultra Lounge — UB City</h2><p>At 13 floors up, The High is as much an experience as it is a bar. The view of UB City's gleaming towers at night is genuinely dramatic.</p><h2>Alt Balaji Rooftop — Indiranagar</h2><p>More casual than the above two, this Indiranagar gem offers fairy lights, floor cushions, and killer mojitos at half the price.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800",
    authorName: "Sneha Krishnamurthy",
    tags: ["Bangalore", "Rooftop", "Cocktails"],
    published: true,
  },
  {
    title: "Whiskey Bars in Delhi Worth Making a Reservation For",
    slug: "whiskey-bars-delhi",
    excerpt: "Delhi's whiskey bar scene is maturing fast. From Japanese single malts to Indian craft distilleries, here is where to go for a serious dram.",
    content: `<p>Delhi has always had a sophisticated drinking culture, but the rise of dedicated whiskey bars has taken things to a new level. Here are the establishments worth calling ahead for.</p><h2>Raasta — Hauz Khas</h2><p>Reggae vibes and an unexpectedly serious whiskey menu. The Raasta whiskey flight (four 30ml pours for Rs 1,200) is one of Delhi's best drinking bargains.</p><h2>The Piano Man Jazz Club</h2><p>More jazz lounge than pure whiskey bar, but the back shelf at Piano Man contains bottles you would struggle to find elsewhere in the country.</p><h2>Whisky Samba — Gurugram</h2><p>India's first whiskey-exclusive bar. Over 400 labels, knowledgeable staff, and a no-mixing policy that purists will appreciate.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=800",
    authorName: "Rohan Sharma",
    tags: ["Delhi", "Whiskey", "Bars"],
    published: true,
  },
  {
    title: "The Beginner's Guide to Pub Etiquette in India",
    slug: "pub-etiquette-india-guide",
    excerpt: "First time at a pub? We cover everything from dress codes and tab management to tipping culture and handling the bill.",
    content: `<p>Visiting a pub for the first time can feel intimidating — but it really should not. Here is a friendly guide to making the most of your experience.</p><h2>Dress Codes</h2><p>Most mid-range and upscale pubs in Indian cities enforce a dress code after 9 PM. Smart casuals are almost universally safe — avoid flip-flops, torn jeans, and sleeveless vests at nicer venues.</p><h2>Opening a Tab</h2><p>Most pubs will ask for a card at the start if you plan to run a tab. This is standard practice and nothing to worry about. The card is only charged when you settle up.</p><h2>Tipping</h2><p>10% is the informal standard in Indian pubs. Service charges on the bill are separate — tipping in cash on top of a service charge is at your discretion.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800",
    authorName: "Priya Nair",
    tags: ["Guide", "Beginners", "Etiquette"],
    published: true,
  },
  {
    title: "Live Music Pubs in Hyderabad You Need to Know",
    slug: "live-music-pubs-hyderabad",
    excerpt: "Hyderabad's live music pub scene is having a moment. From jazz to indie rock, here are the venues bringing original music back to the nightlife conversation.",
    content: `<p>Hyderabad has long been an underrated city for live music. But a new wave of pub owners with genuine passion for local artists is changing that. Here are the venues leading the charge.</p><h2>10D — Jubilee Hills</h2><p>10D books the best local bands in the city, hands down. Their Friday and Saturday sets consistently draw full houses. Book ahead on Royvento.</p><h2>Hoppipola — Banjara Hills</h2><p>More casual and eclectic than 10D, Hoppipola mixes open-mic nights with occasional headline acts. The food is excellent too — their nachos are legendary.</p><h2>Tapped — Madhapur</h2><p>Tapped caters to the city's large tech worker population with a mix of 90s Bollywood nights and indie gigs. The sound system is the best in the city.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800",
    authorName: "Aisha Patel",
    tags: ["Hyderabad", "Live Music", "Nightlife"],
    published: true,
  },
  {
    title: "Goa's Best Beach Bars: A 2026 Update",
    slug: "goa-beach-bars-2026",
    excerpt: "Goa's beach bar scene never stays still. Here is our annual update on which shacks are thriving, which have closed, and what is new for 2026.",
    content: `<p>Goa remains India's ultimate party destination, and its beach bars are central to that identity. Here is what changed in 2026 — and what stayed delightfully the same.</p><h2>Curlies — Anjuna</h2><p>The grand old dame of Goa's beach bars is still going strong. Curlies's sunset sessions draw the biggest crowds on the north coast. New management has smartly kept the vibe intact while improving the menu significantly.</p><h2>Cafe del Mar — Sinquerim</h2><p>Goa's most famous sunset bar. The new resident DJs are exceptional — the 5–8 PM golden hour set is not to be missed.</p><h2>Palolem Beach Bars</h2><p>Palolem's cluster of beach bars at the south end continues to attract a younger, more backpacker-friendly crowd. Sundowner cocktails start at Rs 250 — hard to beat anywhere in India.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
    authorName: "Royvento Editorial",
    tags: ["Goa", "Beach Bars", "Travel"],
    published: true,
  },
  {
    title: "Why Verified Reviews Are Changing Indian Nightlife",
    slug: "verified-reviews-nightlife-india",
    excerpt: "Fake reviews have long plagued India's nightlife industry. Here is how Royvento's verified booking reviews are restoring trust.",
    content: `<p>Anyone who has planned a night out in India based on online reviews has probably been burned at least once. The problem is systemic — review platforms have historically done little to verify that reviewers have actually visited the venue they are rating.</p><h2>The Fake Review Problem</h2><p>In a 2025 survey by the Hospitality Analytics Institute, 43% of Indian nightlife venue owners admitted to having at least some purchased reviews in their profiles.</p><h2>The Royvento Solution</h2><p>Every review on Royvento is tied to a verified booking. Only users who have transacted through the platform can leave a review — and their booking status is displayed alongside the review. It is a simple fix, but a powerful one.</p><h2>The Impact</h2><p>Since implementing verified reviews, Royvento venues have seen trust — as measured by completed booking rates — rise 28% year-on-year.</p>`,
    imageUrl: "https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=800",
    authorName: "Arjun Mehta",
    tags: ["Reviews", "Trust", "Platform"],
    published: true,
  },
];

async function seed() {
  console.log("Seeding blogs...");
  for (const blog of blogs) {
    const existing = await db.select().from(blogsTable).where(eq(blogsTable.slug, blog.slug)).limit(1);
    if (existing[0]) {
      console.log(`Blog '${blog.slug}' already exists, skipping.`);
    } else {
      await db.insert(blogsTable).values(blog);
      console.log(`Inserted: ${blog.slug}`);
    }
  }
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
