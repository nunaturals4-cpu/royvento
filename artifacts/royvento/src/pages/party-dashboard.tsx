import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyParties,
  useGetPartyDashboard,
  useUpdateParty,
  useCancelParty,
  useListMyPartyBookings,
  useCancelPartyBooking,
  type Party,
} from "@workspace/api-client-react";
import { SEO } from "@/components/SEO";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { EditPartyModal } from "@/components/party/EditPartyModal";
import { joinBadge } from "@/components/solo-connect/CreatePartyWizard";
import {
  PartyPopper, Users, IndianRupee, Percent, Wallet, Ticket, CalendarDays,
  Pencil, Ban, PauseCircle, ExternalLink, ArrowRight, Loader2, Ticket as TicketIcon,
  ScanLine, CheckCircle2, QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const GOLD = "#d4af37";
const RED = "#b91c1c";
const PARTY = "#f472b6";

const inr = (v: string | number) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function PartyDashboardPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<Party | null>(null);

  const { data: parties = [], isLoading: partiesLoading } = useListMyParties({ query: { retry: false } as any });

  useEffect(() => {
    if (selected == null && parties.length > 0) setSelected(parties[0]!.id);
  }, [parties, selected]);

  const refreshAll = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].includes("create-your-party") });

  if (partiesLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center bg-background"><Spinner /></div>;
  }

  return (
    <>
      <SEO title="Party Dashboard | Royvento" noindex />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 md:px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="flex items-center justify-center h-11 w-11 rounded-2xl shrink-0"
              style={{ background: `${PARTY}1f`, border: `1px solid ${PARTY}44` }}>
              <PartyPopper className="h-5 w-5" style={{ color: PARTY }} />
            </span>
            <div>
              <h1 className="font-serif text-2xl md:text-3xl" style={{ color: "#fff" }}>Party Dashboard</h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Manage your parties, bookings & earnings.</p>
            </div>
          </div>

          {parties.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid lg:grid-cols-[260px_1fr] gap-6">
              {/* Party selector */}
              <aside className="space-y-2">
                {parties.map((p) => {
                  const active = selected === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => setSelected(p.id)}
                      className="w-full text-left p-3 rounded-xl transition-all"
                      style={{ background: active ? `${PARTY}1f` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? PARTY : "rgba(255,255,255,0.08)"}` }}>
                      <p className="text-sm font-semibold truncate" style={{ color: "#fff" }}>{p.name}</p>
                      <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                        <span className="capitalize">{p.status.replace("_", " ")}</span>
                        {p.partyDate && <span>· {p.partyDate}</span>}
                      </p>
                    </button>
                  );
                })}
              </aside>

              {/* Selected party dashboard */}
              <div>
                {selected != null && (
                  <PartyDashboardDetail
                    partyId={selected}
                    onEdit={setEditing}
                    onChanged={refreshAll}
                  />
                )}
              </div>
            </div>
          )}

          <MyBookingsPanel />
        </div>
      </div>

      {editing && (
        <EditPartyModal party={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refreshAll(); toast({ title: "Party updated." }); }} />
      )}
    </>
  );
}

function PartyDashboardDetail({ partyId, onEdit, onChanged }: { partyId: number; onEdit: (p: Party) => void; onChanged: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useGetPartyDashboard(partyId, { query: { retry: false } as any });
  const update = useUpdateParty();
  const cancel = useCancelParty();

  if (isLoading || !data) {
    return <div className="py-20 flex justify-center"><Spinner /></div>;
  }

  const { party, stats, bookings, cancelled } = data;
  const salesStopped = party.status === "sales_stopped";
  const isCancelled = party.status === "cancelled";

  const stopSales = () => {
    update.mutate(
      { id: partyId, data: { status: salesStopped ? "published" : "sales_stopped" } },
      { onSuccess: () => { toast({ title: salesStopped ? "Ticket sales resumed." : "Ticket sales stopped." }); onChanged(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }) },
    );
  };
  const cancelParty = () => {
    if (!confirm("Cancel this party? All attendees will be notified.")) return;
    cancel.mutate({ id: partyId }, {
      onSuccess: () => { toast({ title: "Party cancelled." }); onChanged(); },
      onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl truncate" style={{ color: "#fff" }}>{party.name}</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full capitalize" style={{ background: `${PARTY}1f`, color: PARTY, border: `1px solid ${PARTY}40` }}>{party.status.replace("_", " ")}</span>
          </div>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{joinBadge(party.joinType)} · {party.ticketType === "paid" ? inr(party.ticketPrice) : "Free entry"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isCancelled && <Link href={`/dashboard/parties/${partyId}/scan`}><a className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff" }}><ScanLine className="h-3.5 w-3.5" /> Scan tickets</a></Link>}
          <Link href={`/party/${partyId}`}><a className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)" }}><ExternalLink className="h-3.5 w-3.5" /> View page</a></Link>
          {!isCancelled && <button type="button" onClick={() => onEdit(party)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: `${PARTY}14`, color: PARTY, border: `1px solid ${PARTY}40` }}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
          {!isCancelled && <button type="button" onClick={stopSales} disabled={update.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: `${GOLD}14`, color: GOLD, border: `1px solid ${GOLD}40` }}><PauseCircle className="h-3.5 w-3.5" /> {salesStopped ? "Resume sales" : "Stop sales"}</button>}
          {!isCancelled && <button type="button" onClick={cancelParty} disabled={cancel.isPending} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: `${RED}1a`, color: "#fca5a5", border: `1px solid ${RED}44` }}><Ban className="h-3.5 w-3.5" /> Cancel party</button>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi icon={Ticket} label="Total bookings" value={String(stats.totalBookings)} />
        <Kpi icon={Users} label="Guests going" value={String(stats.guestsGoing)} />
        <Kpi icon={ScanLine} label="Checked in" value={`${(stats as any).checkedInCount ?? 0}/${stats.guestsGoing}`} accent="#4ade80" />
        <Kpi icon={IndianRupee} label="Revenue" value={inr(stats.revenue)} />
        <Kpi
          icon={Percent}
          label="Platform commission"
          value={stats.commissionType === "fixed" ? `${inr(stats.commissionValue)}/booking` : `${stats.commissionValue}%`}
          sub={`${inr(stats.commission)} collected so far · set by Royvento`}
          accent={GOLD}
        />
        <Kpi icon={Wallet} label="Net earnings" value={inr(stats.netEarnings)} accent="#4ade80" />
        <Kpi icon={CalendarDays} label="Seats left" value={stats.seatsLeft != null ? `${stats.seatsLeft}/${stats.capacity}` : "Open"} />
      </div>

      {/* Attendees / bookings */}
      <BookingTable title={`Attendees (${bookings.length})`} rows={bookings} emptyText="No bookings yet." />
      {cancelled.length > 0 && <BookingTable title={`Cancelled (${cancelled.length})`} rows={cancelled} emptyText="" muted />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, accent = PARTY }: { icon: typeof Users; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color: accent }} />
        <span className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      </div>
      <p className="font-serif text-2xl" style={{ color: "#fff" }}>{value}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{sub}</p>}
    </div>
  );
}

interface Row { id: number; bookingCode: string; name: string; phone?: string; quantity: number; totalPrice: string; status: string; paymentStatus: string; checkedIn?: boolean; createdAt: string; }

function BookingTable({ title, rows, emptyText, muted = false }: { title: string; rows: Row[]; emptyText: string; muted?: boolean }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", opacity: muted ? 0.75 : 1 }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#fff" }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-center" style={{ color: "rgba(255,255,255,0.4)" }}>{emptyText}</p>
      ) : (
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {rows.map((b) => (
            <div key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: "#fff" }}>{b.name}</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>#{b.bookingCode} · {b.quantity} {b.quantity > 1 ? "tickets" : "ticket"}{b.phone ? ` · ${b.phone}` : ""}</p>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <p className="text-sm" style={{ color: "#fff" }}>{Number(b.totalPrice) > 0 ? inr(b.totalPrice) : "Free"}</p>
                {b.status !== "cancelled" ? (
                  b.checkedIn ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(74,222,128,0.14)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                      <CheckCircle2 className="h-3 w-3" /> Checked in
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>Not checked in</span>
                  )
                ) : (
                  <p className="text-[11px]" style={{ color: "#fca5a5" }}>Cancelled</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MyBookingsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: bookings = [], isLoading } = useListMyPartyBookings({ query: { retry: false } as any });
  const cancelBooking = useCancelPartyBooking();
  if (isLoading || bookings.length === 0) return null;

  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].includes("create-your-party") });

  return (
    <div className="mt-10">
      <h2 className="font-serif text-xl mb-4" style={{ color: "#fff" }}>Your party bookings</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bookings.map((b) => {
          const isCancelled = b.status === "cancelled";
          return (
            <div key={b.id} className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", opacity: isCancelled ? 0.6 : 1 }}>
              {b.coverImageUrl && <img src={b.coverImageUrl} alt="" className="h-24 w-full object-cover" />}
              <div className="p-4">
                <Link href={`/party/${b.partyId}`}><a className="font-serif text-base hover:underline" style={{ color: "#fff" }}>{b.partyName}</a></Link>
                <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {Number(b.totalPrice) > 0 ? inr(b.totalPrice) : "Free"} · <span className="capitalize">{b.status.replace("_", " ")}</span>
                </p>

                {/* QR ticket — the host scans this to check you in */}
                {(b.status === "confirmed" || b.status === "completed") && (
                  <div className="mt-3 flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="shrink-0 rounded-lg bg-white p-1.5">
                      <QRCodeSVG value={b.bookingCode} size={64} level="M" />
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>
                        <QrCode className="h-3 w-3" /> Your ticket
                      </p>
                      <p className="text-sm font-mono font-semibold" style={{ color: "#fff" }}>{b.bookingCode}</p>
                      {(b as any).checkedIn ? (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.14)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                          <CheckCircle2 className="h-3 w-3" /> Checked in
                        </span>
                      ) : (
                        <span className="mt-1 inline-block text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Show this at the door</span>
                      )}
                    </div>
                  </div>
                )}

                {!isCancelled && (
                  <button type="button" disabled={cancelBooking.isPending}
                    onClick={() => {
                      if (!confirm("Cancel this booking?")) return;
                      cancelBooking.mutate({ bookingId: b.id }, {
                        onSuccess: () => { toast({ title: "Booking cancelled." }); refresh(); },
                        onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
                      });
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: `${RED}1a`, color: "#fca5a5", border: `1px solid ${RED}44` }}>
                    {cancelBooking.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />} Cancel booking
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl p-10 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}>
      <TicketIcon className="h-10 w-10 mx-auto mb-3" style={{ color: PARTY }} />
      <p className="font-serif text-xl mb-1" style={{ color: "#fff" }}>You haven't hosted a party yet</p>
      <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>Create one from Solo Connect to start taking bookings.</p>
      <Link href="/solo-connect"><a className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: `linear-gradient(135deg, ${PARTY}, #db2777)`, color: "#fff" }}>Create a party <ArrowRight className="h-4 w-4" /></a></Link>
    </div>
  );
}
