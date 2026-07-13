// Create Your Own Party — shared client types & helpers (React Native).
// Mirrors the /api/create-your-party contract (see api-server createYourParty.ts).

import { customFetch, getBaseUrl } from "@workspace/api-client-react";
export { resolveImageUrl } from "@/lib/resolveImageUrl";

export interface PublicParty {
  id: number;
  organizerUserId: number;
  name: string;
  slug: string;
  coverImageUrl: string;
  galleryImages: string[];
  description: string;
  rules: string;
  category: string;
  visibility: "public" | "private";
  inviteToken: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  mapLocation: string;
  partyDate: string | null;
  startTime: string;
  endTime: string;
  joinType: "male_only" | "female_only" | "mixed";
  organizerName: string;
  capacity: number;
  ageGroup: string;
  dressCode: string;
  drinking: string;
  smoking: string;
  coupleFriendly: string;
  lgbtqFriendly: string;
  status: "published" | "sales_stopped" | "cancelled";
  createdAt: string;
  updatedAt: string;
  ticketType: "free" | "paid";
  ticketPrice: string;
  soldCount: number;
  seatsLeft: number | null;
  isOrganizer: boolean;
  canChat?: boolean;
}

export interface PartyBookingResult {
  ok?: boolean;
  bookingId?: number;
  bookingCode?: string;
  paymentPending?: boolean;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  amountPaise?: number;
}

/**
 * Convert an absolute upload URL from uploadImageToStorage back to the relative
 * `/api/storage/objects/uploads/…` form the party API's strict isUploadPath
 * validator accepts (it rejects a full https:// URL).
 */
export function toUploadPath(absoluteUrl: string): string {
  const base = getBaseUrl() ?? "";
  if (base && absoluteUrl.startsWith(base)) return absoluteUrl.slice(base.length);
  // Fall back to trimming everything up to /api/storage if present.
  const idx = absoluteUrl.indexOf("/api/storage/");
  return idx >= 0 ? absoluteUrl.slice(idx) : absoluteUrl;
}

export function listParties(city?: string): Promise<PublicParty[]> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : "";
  return customFetch<PublicParty[]>(`/api/create-your-party${qs}`);
}

export function myParties(): Promise<PublicParty[]> {
  return customFetch<PublicParty[]>(`/api/create-your-party/mine`);
}

export function getParty(id: number): Promise<PublicParty> {
  return customFetch<PublicParty>(`/api/create-your-party/${id}`);
}

export function joinTypeLabel(t: string): string {
  if (t === "male_only") return "Men only";
  if (t === "female_only") return "Women only";
  return "Everyone welcome";
}

export function formatPartyDate(d: string | null): string {
  if (!d) return "Date TBA";
  const dt = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
