// Single source of truth for the announcement / event categories shown in the
// partner dashboard (announcement tab) AND the public Events page. Keeping them
// here guarantees the type a partner picks maps 1:1 to an Events category tile.

export const EVENT_CATEGORIES = [
  "Ladies Night",
  "DJ Night",
  "Live Music",
  "Karaoke",
  "Theme Party",
  "Pool Party",
  "Open Mics",
  "Standup Shows",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

// A small Unsplash image per category for the home-style category tiles.
export const EVENT_CATEGORY_IMAGES: Record<string, string> = {
  "Ladies Night": "https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&q=70",
  "DJ Night": "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=600&q=70",
  "Live Music": "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=70",
  "Karaoke": "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=600&q=70",
  "Theme Party": "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=70",
  "Pool Party": "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600&q=70",
  "Open Mics": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=70",
  "Standup Shows": "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&q=70",
};

export const EVENT_CATEGORY_SUBTITLES: Record<string, string> = {
  "Ladies Night": "Special offers for the ladies",
  "DJ Night": "Beats all night long",
  "Live Music": "Live bands & gigs",
  "Karaoke": "Grab the mic",
  "Theme Party": "Dress up & vibe",
  "Pool Party": "Splash & sip",
  "Open Mics": "Take the stage",
  "Standup Shows": "Laugh out loud",
};
