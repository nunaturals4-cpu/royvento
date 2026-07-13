import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatDayRanges } from "@/lib/days";
import { GuestTypeBadge } from "@/components/GuestTypeBadge";
import { NightlifeOfferCard } from "@/components/NightlifeOfferCard";
import { OfferDayPills } from "@/components/OfferDayPills";
import { OFFER_THEMES, type OfferTheme } from "@/components/offerThemes";
import type { DrinkPlanSummary, VendorDrinkOffer } from "@workspace/api-client-react";

// Mirrors web's src/components/DrinkDealCards.tsx — the VIP ticket-style deal
// sections shown on the homepage Drink Deals rail, the Deals tab, and the Pub
// Offers page, so the design stays identical everywhere.

/* Loose plan shape — the API returns price/imageUrl/validFrom/validUntil even
   though the generated DrinkPlanSummary type doesn't declare them yet. */
export interface DrinkDealPlanLike {
  type: string;
  productName?: string;
  gender?: string;
  price?: number;
  lineItems?: Array<{ name: string; discountedPrice?: number }> | null;
  days?: string[];
  timeFrom?: string;
  timeTo?: string;
  imageUrl?: string | null;
}

export type VendorWithPlans = { offer: VendorDrinkOffer; plans: DrinkPlanSummary[] };

function fmtTime(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = (h ?? 0) < 12 ? "AM" : "PM";
  const hr = (h ?? 0) % 12 || 12;
  return `${hr}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

function summarizePlan(plan: DrinkDealPlanLike): { badge: string; headline: string } {
  if (plan.type === "welcome") return { badge: "FREE DRINK", headline: plan.productName || "Free welcome drink" };
  if (plan.type === "unlimited") return { badge: "UNLIMITED", headline: plan.productName || "Unlimited drinks" };
  if (plan.type === "ticket") {
    const count = (plan.lineItems ?? []).filter((i) => i.name).length;
    return { badge: "WITH TICKET", headline: plan.productName || (count > 0 ? `${count} item${count !== 1 ? "s" : ""} included` : "Drinks with ticket") };
  }
  if (plan.type === "cover_charge") return { badge: "COVER CHARGE", headline: plan.productName || "Cover charge package" };
  if (plan.type === "vip_table") return { badge: "VIP TABLE", headline: plan.productName || "VIP table package" };
  return { badge: "DRINKS DEAL", headline: plan.productName || "Drinks discount" };
}

function offerEyebrowFor(type: string): string {
  switch (type) {
    case "welcome": return "Enjoy";
    case "unlimited": return "Enjoy";
    case "ticket": return "Bundle";
    case "cover_charge": return "Entry";
    case "vip_table": return "VIP";
    default: return "Offer";
  }
}

function iconFor(type: string): React.ComponentProps<typeof Ionicons>["name"] {
  if (type === "cover_charge" || type === "vip_table") return "pricetag-outline";
  if (type === "ticket") return "ticket-outline";
  return "wine-outline";
}

/* ─── Card ───────────────────────────────────────────────────────────────── */
function DrinkDealCard({
  plan,
  title,
  theme,
  onPress,
  onBook,
}: {
  plan: DrinkDealPlanLike;
  title?: string;
  theme?: OfferTheme;
  onPress?: () => void;
  onBook?: () => void;
}) {
  const { badge, headline } = summarizePlan(plan);
  const items = (plan.lineItems ?? []).filter((it) => it.name);
  const isCoverCharge = plan.type === "cover_charge" || plan.type === "vip_table";
  const isTicket = plan.type === "ticket";
  const includedText = items.map((it) => it.name).join(" · ");
  const showIncluded = (isCoverCharge || isTicket) && includedText.length > 0;
  const timeStr = plan.timeFrom && plan.timeTo ? `${fmtTime(plan.timeFrom)} – ${fmtTime(plan.timeTo)}` : null;
  const priceLabel = isCoverCharge && (plan.price ?? 0) > 0 ? `₹${((plan.price ?? 0) / 100).toFixed(0)}` : undefined;

  return (
    <NightlifeOfferCard
      hideImage
      theme={theme}
      title={headline}
      venueName={title}
      offerLabel={badge}
      offerEyebrow={offerEyebrowFor(plan.type)}
      offerIcon={iconFor(plan.type)}
      priceLabel={priceLabel}
      statusBadge={<GuestTypeBadge gender={plan.gender} />}
      onPress={onPress}
      onBook={onBook}
    >
      <View style={{ gap: 5 }}>
        {showIncluded ? (
          <View style={styles.includedRow}>
            <Ionicons name="checkmark" size={12} color={theme?.accent} style={{ marginTop: 1 }} />
            <Text style={styles.includedText} numberOfLines={2}>{includedText}</Text>
          </View>
        ) : null}
        <OfferDayPills days={plan.days} accent={theme?.accent} />
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={theme?.accent} />
          <Text style={styles.timeText} numberOfLines={1}>{timeStr ?? "All day"}</Text>
        </View>
      </View>
    </NightlifeOfferCard>
  );
}

function DealTile({ offer, plans, theme }: { offer: VendorDrinkOffer; plans: DrinkPlanSummary[]; theme: OfferTheme }) {
  const primary = plans[0] as DrinkDealPlanLike;
  const eventId = offer.pubEventId;
  const onPress = () => (eventId ? router.push(`/event/${eventId}?book=1` as never) : router.push(`/partner/${offer.vendorId}` as never));
  const onBook = () => router.push((eventId ? `/event/${eventId}?book=1` : `/partner/${offer.vendorId}?book=1`) as never);
  return <DrinkDealCard plan={primary} title={offer.vendorName} theme={theme} onPress={onPress} onBook={onBook} />;
}

/* ─── Section header + rail ─────────────────────────────────────────────── */
function DealSectionHeader({ theme, icon, title, subtitle }: { theme: OfferTheme; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; subtitle: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { borderColor: theme.accent + "59", backgroundColor: theme.accent + "14" }]}>
        <Ionicons name={icon} size={16} color={theme.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.sectionSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
    </View>
  );
}

function DealSection({ vendors, title, subtitle, theme, icon }: { vendors: VendorWithPlans[]; title: string; subtitle: string; theme: OfferTheme; icon: React.ComponentProps<typeof Ionicons>["name"] }) {
  if (vendors.length === 0) return null;
  return (
    <View style={styles.section}>
      <DealSectionHeader theme={theme} icon={icon} title={title} subtitle={subtitle} />
      <FlatList
        horizontal
        data={vendors}
        keyExtractor={(v) => String(v.offer.vendorId)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => (
          <View style={styles.tile}>
            <DealTile offer={item.offer} plans={item.plans} theme={theme} />
          </View>
        )}
      />
    </View>
  );
}

/* ─── Public exports ─────────────────────────────────────────────────────── */
export function FreeDrinkSection({ vendors }: { vendors: VendorWithPlans[] }) {
  return <DealSection vendors={vendors} title="Free Drinks" subtitle="Complimentary welcome & unlimited pours" theme={OFFER_THEMES.free} icon="wine-outline" />;
}
export function TicketSection({ vendors }: { vendors: VendorWithPlans[] }) {
  return <DealSection vendors={vendors} title="Included With Ticket" subtitle="Food & drinks bundled with entry" theme={OFFER_THEMES.ticket} icon="ticket-outline" />;
}
export function CoverChargeSection({ vendors }: { vendors: VendorWithPlans[] }) {
  return <DealSection vendors={vendors} title="Cover Charges" subtitle="Seamless entry, redeemable at the bar" theme={OFFER_THEMES.cover} icon="pricetag-outline" />;
}
export function VipTableBookingSection({ vendors }: { vendors: VendorWithPlans[] }) {
  return <DealSection vendors={vendors} title="VIP Table Booking" subtitle="Premium tables & bottle-service packages" theme={OFFER_THEMES.vipTable} icon="diamond-outline" />;
}

export function splitVendorsByPlanType(
  offers: VendorDrinkOffer[],
  genderFilter?: "" | "female" | "other",
): { freeVendors: VendorWithPlans[]; ticketVendors: VendorWithPlans[]; coverChargeVendors: VendorWithPlans[]; vipTableVendors: VendorWithPlans[] } {
  const genderMatch = (p: DrinkPlanSummary) => !genderFilter || (genderFilter === "female" ? p.gender === "female" : p.gender !== "female");

  const byType = (type: string) =>
    offers
      .map((offer) => ({ offer, plans: offer.plans.filter((p) => p.type === type && genderMatch(p)) }))
      .filter((v) => v.plans.length > 0);

  return {
    freeVendors: [...byType("welcome"), ...byType("unlimited")].reduce<VendorWithPlans[]>((acc, cur) => {
      const existing = acc.find((v) => v.offer.vendorId === cur.offer.vendorId);
      if (existing) existing.plans.push(...cur.plans);
      else acc.push({ offer: cur.offer, plans: [...cur.plans] });
      return acc;
    }, []),
    ticketVendors: byType("ticket"),
    coverChargeVendors: byType("cover_charge"),
    vipTableVendors: byType("vip_table"),
  };
}

const styles = StyleSheet.create({
  section: { marginBottom: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  sectionIcon: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)", marginTop: 1 },
  rail: { gap: 12, paddingHorizontal: 20 },
  tile: { width: 300 },
  includedRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  includedText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.65)", lineHeight: 14 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  timeText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)" },
});
