import React from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

export type BookingPartnerRole = "vendor" | "organizer" | "game";

interface BookingDetailModalProps {
  /** null closes the modal. */
  bookingId: number | null;
  role: BookingPartnerRole;
  onClose: () => void;
}

function endpointFor(role: BookingPartnerRole, id: number): string {
  if (role === "organizer") return `/api/organizer/bookings/${id}`;
  if (role === "game") return `/api/game-organizer/bookings/${id}`;
  return `/api/bookings/vendor/${id}`;
}

function pubModeLabel(pubMode: string | undefined): string {
  switch (pubMode) {
    case "event": return "Table";
    case "vip_table": return "VIP Table";
    case "ticket": return "Ticket";
    case "event_booking": return "Event Ticket";
    case "game_booking": return "Game Booking";
    default: return "Booking";
  }
}

function formatLongDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}

function statusColor(status: string, colors: ReturnType<typeof useColors>): string {
  if (status === "cancelled") return colors.destructive;
  if (status === "confirmed" || status === "completed") return colors.primary;
  return colors.mutedForeground;
}

export function BookingDetailModal({ bookingId, role, onClose }: BookingDetailModalProps) {
  const colors = useColors();
  const open = bookingId != null;

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["booking-detail", role, bookingId],
    queryFn: () => customFetch<any>(endpointFor(role, bookingId as number)),
    enabled: open,
  });

  const name = data?.personName || data?.attendee || "Guest";
  const phone = data?.phone || "";
  const email = data?.email || data?.userEmail || "";
  const bookingDate = data?.bookingDate || "";
  const time = data?.arrivalTime || data?.time || "";
  const status = data?.status || "";
  const paymentMethod = data?.paymentMethod || "online";
  const location = data?.bookingLocation || "";
  const eventTitle = data?.eventTitle || data?.itemName || data?.gameName || data?.packageName || "";

  const typeLabel = role === "vendor"
    ? pubModeLabel(data?.pubMode)
    : role === "organizer"
      ? (data?.ticketType || "Event Ticket")
      : (data?.itemName || data?.gameName || data?.packageName || "Game Booking");

  const guestsLabel = role === "vendor"
    ? `${data?.guests ?? 0} guest${(data?.guests ?? 0) === 1 ? "" : "s"}`
    : role === "organizer"
      ? `${data?.quantity ?? 0} ticket${(data?.quantity ?? 0) === 1 ? "" : "s"}`
      : `${data?.persons ?? 0} person${(data?.persons ?? 0) === 1 ? "" : "s"}`;

  const amount = role === "vendor" ? Number(data?.finalPrice ?? 0) : Number(data?.amount ?? 0);

  const row = (label: string, value: string) => (
    <View style={{ backgroundColor: colors.muted, borderRadius: 12, padding: 12, flex: 1, minWidth: "45%" }}>
      <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{value}</Text>
    </View>
  );

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
          <Text style={{ fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground }}>Booking details</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError || !data ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text style={{ color: colors.mutedForeground }}>Couldn't load this booking.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>{name}</Text>
                {!!eventTitle && <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{eventTitle}</Text>}
              </View>
              {!!status && (
                <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: statusColor(status, colors) + "22" }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: statusColor(status, colors), textTransform: "capitalize" }}>{status}</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {row("Booking type", `${typeLabel} · ${guestsLabel}`)}
              {row("Payment mode", paymentMethod === "cod" ? "Cash on Arrival" : "Online Payment")}
              {row("Date & time", `${formatLongDate(bookingDate)}${time ? ` · ${time}` : ""}`)}
              {amount > 0 && row("Amount", `₹${amount.toLocaleString("en-IN")}`)}
              {!!location && row("Guest location", location)}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              {!!phone && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${phone}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  <Ionicons name="call" size={16} color={colors.primaryForeground} />
                  <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Call {phone}</Text>
                </TouchableOpacity>
              )}
              {!!email && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${email}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}
                >
                  <Ionicons name="mail-outline" size={16} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Email</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
