import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSoloGroup,
  useJoinSoloGroup,
  useResetSoloGroupInvite,
  useLeaveSoloGroup,
  useApproveSoloMember,
  useRejectSoloMember,
  useRemoveSoloMember,
  useLockSoloGroup,
  useCloseSoloGroup,
  useListSoloMessages,
  useSendSoloMessage,
  getListSoloMessagesQueryKey,
  getGetSoloGroupQueryKey,
  type SoloGroup,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useRequireGender } from "@/components/useRequireGender";
import { apiPost, apiDelete } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { useSelectedCity } from "@/components/LocationContext";
import { X, MapPin, Calendar, Users, Phone, Lock, ShieldAlert, Check, UserX, MessageCircle, Send, Flag, Ticket, Clock, User, ExternalLink, LogIn, Crown, ShieldCheck, ArrowRight, Share2, RefreshCw, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const GOLD = "#d4af37";
const RED = "#b91c1c";

// Mirrors the page-level gate: when set, the visitor can view the profile but
// must complete this step before joining/booking.
type BookingGate = "login" | "premium" | "verify" | null;
const LOGIN_NEXT = `/login?next=${encodeURIComponent("/solo-connect")}`;

const ACTIVITY_ACCENT: Record<string, string> = {
  nightlife: "#a78bfa",
  happy_hours: "#fbbf24",
  food_drinks: "#fb7185",
  events: "#60a5fa",
  games: "#34d399",
  activities: "#fb923c",
  party: "#f472b6",
};
const accentOf = (a: string) => ACTIVITY_ACCENT[a] ?? GOLD;
const prettyActivity = (a: string) => a.replace(/_/g, " ");

// Compact labelled fact tile used in the party details grid.
function PartyFact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#f472b6" }} />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
        <p className="text-sm break-words" style={{ color: "rgba(255,255,255,0.85)" }}>{value}</p>
      </div>
    </div>
  );
}

const EMERGENCY = [
  { label: "Police", number: "100" },
  { label: "Emergency", number: "112" },
  { label: "Women Helpline", number: "1091" },
  { label: "Ambulance", number: "108" },
];

export function SoloGroupDetail({
  groupId,
  city,
  gate = null,
  onClose,
}: {
  groupId: number;
  city: string;
  gate?: BookingGate;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedState } = useSelectedCity();
  const { data, isLoading } = useGetSoloGroup(groupId, { city });

  // Invite token carried in the host's share link (?invite=…). Required to join
  // a private group for everyone except the admin.
  const inviteToken = new URLSearchParams(window.location.search).get("invite") ?? "";

  const join = useJoinSoloGroup();
  const leave = useLeaveSoloGroup();
  const approve = useApproveSoloMember();
  const reject = useRejectSoloMember();
  const remove = useRemoveSoloMember();
  const lock = useLockSoloGroup();
  const close = useCloseSoloGroup();
  const { ensureGender, modal: genderModal } = useRequireGender();

  // Send the join request — guarded so the caller always has a binary gender
  // (reused silently if already set, otherwise collected first).
  function requestJoin() {
    ensureGender(() =>
      join.mutate({ id: groupId, data: { city, state: selectedState ?? undefined, inviteToken: inviteToken || undefined } }, {
        onSuccess: () => { toast({ title: "Join request sent!" }); refresh(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not join", variant: "destructive" }),
      }),
    );
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/groups"] });
    // Also refetch THIS group's detail so membership / a freshly-reset invite
    // token update without needing to reopen the modal.
    qc.invalidateQueries({ queryKey: getGetSoloGroupQueryKey(groupId, { city }) });
  }

  // Host-only: permanently remove the group. It disappears from every list and
  // its detail 404s after this; the modal closes once done.
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    if (!confirm("Delete this group? This removes it for everyone and can't be undone.")) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/solo-connect/groups/${groupId}`);
      toast({ title: "Group deleted" });
      qc.invalidateQueries({ queryKey: ["/api/solo-connect/groups"] });
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not delete group", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  const group = data?.group;
  const members = data?.members ?? [];
  const approvedMembers = members.filter((m) => m.status === "approved");
  const pendingMembers = members.filter((m) => m.status === "requested");
  const isAdmin = group?.isAdmin ?? false;
  const myStatus = group?.myMembershipStatus ?? null;
  const joined = myStatus === "approved" || isAdmin;
  // Private group + viewer isn't the admin/member and arrived without an invite
  // token → joining is locked behind the host's invite link.
  const needsInvite = group?.visibility === "private" && !isAdmin && !joined && !inviteToken;

  // Member the current user is reporting (null = modal closed).
  const [reportTarget, setReportTarget] = useState<{ id: number; name: string } | null>(null);

  const genderMark = (g: string | null | undefined) => (g === "male" ? "👨" : g === "female" ? "👩" : "");

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl"
        style={{
          background: "linear-gradient(180deg, rgba(24,22,26,0.98), rgba(13,12,15,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 30px 70px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px ${GOLD}10`,
        }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 z-10" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 h-9 w-9 flex items-center justify-center rounded-full border text-white transition-all hover:scale-110"
          style={{ background: `${RED}33`, borderColor: RED, boxShadow: `0 0 14px ${RED}55` }}
          onMouseEnter={(e) => { e.currentTarget.style.background = RED; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${RED}33`; }}
        >
          <X className="h-4 w-4" />
        </button>

        {isLoading ? (
          <div className="py-24 flex justify-center"><Spinner /></div>
        ) : !group ? (
          // Never leave the modal stuck on a spinner: if the detail request
          // failed (group closed/removed, or a transient error) show a clear
          // message + close action instead of an endless loader.
          <div className="py-20 px-6 text-center">
            <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4"
              style={{ background: `${RED}1a`, border: `1px solid ${RED}44` }}>
              <ShieldAlert className="h-6 w-6" style={{ color: "#fca5a5" }} />
            </span>
            <p className="font-serif text-xl mb-1.5" style={{ color: "#fff" }}>Couldn't load this group</p>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.6)" }}>
              It may have been closed or is no longer available. Please try again.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
          {group.activityType === "party" && group.coverImageUrl && (
            <div className="relative h-44 w-full overflow-hidden">
              <img src={group.coverImageUrl} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 50%, rgba(13,12,15,0.98))" }} />
            </div>
          )}
          <div className="p-6 md:p-7">
            <span
              className="inline-block px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-semibold mb-3"
              style={{ background: `${accentOf(group.activityType)}1f`, color: accentOf(group.activityType), border: `1px solid ${accentOf(group.activityType)}55` }}
            >
              {prettyActivity(group.activityType)}{group.status !== "open" ? ` · ${group.status}` : ""}
            </span>
            <h3 className="font-serif text-3xl mb-2 pr-10" style={{ color: "#fff" }}>{group.name}</h3>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
              {group.venueName && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{group.venueName}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{group.city}</span>
              {group.groupDate && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{group.groupDate}{group.startTime ? ` · ${group.startTime}` : ""}</span>}
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{group.memberCount}/{group.maxMembers}</span>
            </div>

            {/* Party details — organizer, ticket, full address, map link, end time. */}
            {group.activityType === "party" && (
              <div className="grid sm:grid-cols-2 gap-2.5 mb-5">
                {group.organizerName && (
                  <PartyFact icon={User} label="Hosted by" value={group.organizerName} />
                )}
                <PartyFact
                  icon={Ticket}
                  label="Ticket"
                  value={group.ticketType === "paid"
                    ? `₹${Number(group.ticketPrice ?? 0).toLocaleString("en-IN")}${group.capacity ? ` · ${group.capacity} seats` : ""}`
                    : "Free entry"}
                />
                {(group.startTime || group.endTime) && (
                  <PartyFact icon={Clock} label="Time" value={`${group.startTime || "—"}${group.endTime ? ` – ${group.endTime}` : ""}`} />
                )}
                {group.address && (
                  <PartyFact icon={MapPin} label="Address" value={`${group.address}${group.pinCode ? ` · ${group.pinCode}` : ""}`} />
                )}
                {group.mapLocation && (
                  <a
                    href={group.mapLocation}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 rounded-xl transition-all hover:brightness-110 sm:col-span-2"
                    style={{ background: "rgba(244,114,182,0.1)", border: "1px solid rgba(244,114,182,0.3)" }}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" style={{ color: "#f472b6" }} />
                    <span className="text-sm font-medium" style={{ color: "#f472b6" }}>Open in Google Maps</span>
                  </a>
                )}
              </div>
            )}

            {group.description && (
              <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.7)" }}>{group.description}</p>
            )}

            {/* Share — everyone can share the group; the admin's link carries the
                invite token that unlocks a private group. */}
            <ShareGroup group={group} onReset={refresh} />

            {/* Membership actions */}
            <div className="mb-5">
              {gate ? (
                <>
                  <GateJoinCTA gate={gate} isParty={group.activityType === "party"} />
                  {/* Locked chat preview — non-premium users can see the group but not the chat */}
                  <div className="mt-4 relative overflow-hidden rounded-2xl" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${GOLD}22` }}>
                    <div className="p-3 space-y-2 blur-[5px] select-none pointer-events-none" aria-hidden>
                      {["Planning on grabbing a spot near the bar 🎶", "Same, I'll be there around 9!", "Just confirmed with the venue 👍"].map((msg, i) => (
                        <div key={i} className={`flex ${i % 2 === 1 ? "justify-end" : "justify-start"}`}>
                          <div className="max-w-[70%] px-3 py-1.5 rounded-2xl text-[13px]"
                            style={{ background: i % 2 === 1 ? RED : "rgba(255,255,255,0.07)", color: "#fff" }}>{msg}</div>
                        </div>
                      ))}
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
                      style={{ background: "rgba(13,12,15,0.65)" }}>
                      <Lock className="h-4.5 w-4.5 mb-1.5" style={{ color: GOLD }} />
                      <p className="text-[13px] font-medium" style={{ color: "#fff" }}>Group chat — Premium only</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>Join after upgrading to read & send messages</p>
                    </div>
                  </div>
                </>
              ) : (
              <>
              {myStatus === "approved" && !isAdmin && (
                <button type="button" onClick={() => leave.mutate({ id: groupId }, { onSuccess: () => { toast({ title: "You left the group." }); refresh(); onClose(); } })}
                  className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)" }}>
                  Leave group
                </button>
              )}
              {myStatus === "requested" && (
                <div className="text-center py-3 rounded-xl text-sm" style={{ background: `${GOLD}14`, color: GOLD }}>Request pending approval</div>
              )}
              {(!myStatus || ["left", "rejected", "removed"].includes(myStatus)) && group.status === "open" && (
                needsInvite ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}40` }}>
                    <span className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0" style={{ background: `${GOLD}1f`, border: `1px solid ${GOLD}55` }}>
                      <Lock className="h-4.5 w-4.5" style={{ color: GOLD }} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#fff" }}>Private group — invite only</p>
                      <p className="text-[12px] mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>Open the host's invite link to request to join.</p>
                    </div>
                  </div>
                ) : (
                  <button type="button"
                    onClick={requestJoin}
                    disabled={join.isPending}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110" style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d` }}>
                    {join.isPending ? "Requesting…" : "Request to join"}
                  </button>
                )
              )}
              </>
              )}
            </div>

            {/* Admin: pending requests */}
            {isAdmin && pendingMembers.length > 0 && (
              <div className="mb-5">
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: GOLD }}>Pending requests</p>
                <div className="space-y-2">
                  {pendingMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <span className="text-sm" style={{ color: "#fff" }}>{m.userName}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => approve.mutate({ id: groupId, memberId: m.id }, { onSuccess: () => { toast({ title: `${m.userName} approved` }); refresh(); }, onError: (e) => toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" }) })}
                          className="h-7 w-7 flex items-center justify-center rounded-md" style={{ background: "#16a34a22", color: "#4ade80" }}><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => reject.mutate({ id: groupId, memberId: m.id }, { onSuccess: () => { refresh(); } })}
                          className="h-7 w-7 flex items-center justify-center rounded-md" style={{ background: `${RED}22`, color: "#fca5a5" }}><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Members */}
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>Members ({approvedMembers.length})</p>
              <div className="space-y-1.5">
                {approvedMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-sm flex items-center gap-2" style={{ color: "#fff" }}>
                      {genderMark(m.gender) && <span aria-hidden>{genderMark(m.gender)}</span>}
                      {m.userName}
                      {m.role === "admin" && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>ADMIN</span>}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* Any joined member can report another member. */}
                      {joined && (
                        <button type="button" title="Report member" onClick={() => setReportTarget({ id: m.userId, name: m.userName })}
                          className="h-7 w-7 flex items-center justify-center rounded-md" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}><Flag className="h-3.5 w-3.5" /></button>
                      )}
                      {isAdmin && m.role !== "admin" && (
                        <button type="button" onClick={() => remove.mutate({ id: groupId, memberId: m.id }, { onSuccess: () => { toast({ title: "Member removed" }); refresh(); } })}
                          className="h-7 w-7 flex items-center justify-center rounded-md" style={{ background: `${RED}1a`, color: "#fca5a5" }}><UserX className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin: lock / close */}
            {isAdmin && group.status !== "closed" && (
              <div className="flex gap-2 mb-5">
                {group.status === "open" && (
                  <button type="button" onClick={() => lock.mutate({ id: groupId }, { onSuccess: () => { toast({ title: "Group locked" }); refresh(); } })}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)" }}>
                    <Lock className="h-3.5 w-3.5" />Lock
                  </button>
                )}
                <button type="button" onClick={() => close.mutate({ id: groupId }, { onSuccess: () => { toast({ title: "Group closed" }); refresh(); onClose(); } })}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: `${RED}1a`, color: "#fca5a5" }}>
                  Close group
                </button>
              </div>
            )}

            {/* Admin: delete the group entirely (available even once closed). */}
            {isAdmin && (
              <button type="button" onClick={handleDelete} disabled={deleting}
                className="w-full mb-5 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
                style={{ background: `${RED}1f`, color: "#fca5a5", border: `1px solid ${RED}55` }}>
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete group"}
              </button>
            )}

            {/* Group chat — approved members + admins only */}
            {(myStatus === "approved" || isAdmin) && <SoloGroupChat groupId={groupId} />}

            {/* Safety Center — persistent inside every group */}
            <div className="p-4 rounded-xl" style={{ background: "rgba(185,28,28,0.08)", border: `1px solid ${RED}33` }}>
              <p className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: "#fff" }}>
                <ShieldAlert className="h-4 w-4" style={{ color: RED }} />Safety Center
              </p>
              <div className="grid grid-cols-2 gap-2">
                {EMERGENCY.map((e) => (
                  <a key={e.number} href={`tel:${e.number}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{e.label}</span>
                    <span className="text-sm font-bold flex items-center gap-1" style={{ color: GOLD }}><Phone className="h-3 w-3" />{e.number}</span>
                  </a>
                ))}
              </div>
              <p className="text-[10px] mt-3" style={{ color: "rgba(255,255,255,0.4)" }}>
                Meet in public places. Never share financial information. Report anything unsafe.
              </p>
            </div>

            {/* Close / Cancel */}
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full py-3 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
          </div>
          </>
        )}
      </div>

      {reportTarget && (
        <ReportMemberModal
          groupId={groupId}
          member={reportTarget}
          onClose={() => setReportTarget(null)}
        />
      )}
      {genderModal}
    </div>
  );
}

// Share the group. Everyone can copy/share the plain link; the admin additionally
// gets the invite-token link (which unlocks a PRIVATE group) plus a Reset action
// that revokes previously-shared invite links.
function ShareGroup({ group, onReset }: { group: SoloGroup; onReset: () => void }) {
  const { toast } = useToast();
  const reset = useResetSoloGroupInvite();
  const isPrivate = group.visibility === "private";
  // Only the admin receives a non-empty inviteToken from the API, so only the
  // admin can build an invite link. Everyone else shares the plain group URL.
  const base = `${window.location.origin}/solo-connect?group=${group.id}`;
  const shareUrl = group.isAdmin && isPrivate && group.inviteToken
    ? `${base}&invite=${group.inviteToken}`
    : base;

  async function doShare() {
    const text = isPrivate ? `You're invited to "${group.name}" on Royvento` : `Join "${group.name}" on Royvento`;
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text, url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied!",
        description: isPrivate && group.isAdmin ? "Anyone with this link can join your private group." : "Share it with your friends.",
      });
    } catch {
      toast({ title: "Could not copy the link", description: shareUrl, variant: "destructive" });
    }
  }

  function doReset() {
    if (!confirm("Reset the invite link? Anyone using the old link will no longer be able to join.")) return;
    reset.mutate(
      { id: group.id },
      {
        onSuccess: () => { toast({ title: "Invite link reset", description: "Old links no longer work — share the new one." }); onReset(); },
        onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not reset link", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      <button type="button" onClick={doShare}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
        style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>
        <Share2 className="h-4 w-4" style={{ color: GOLD }} />
        {isPrivate && group.isAdmin ? "Share invite link" : "Share group"}
      </button>
      {group.isAdmin && isPrivate && (
        <button type="button" onClick={doReset} disabled={reset.isPending}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[12px] font-medium transition-all hover:bg-white/[0.04]"
          style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <RefreshCw className={`h-3.5 w-3.5 ${reset.isPending ? "animate-spin" : ""}`} /> Reset link
        </button>
      )}
    </div>
  );
}

// Replaces the join/leave action for visitors who can view the profile but must
// complete a step (login / premium / verification) before joining or booking.
function GateJoinCTA({ gate, isParty }: { gate: Exclude<BookingGate, null>; isParty: boolean }) {
  const verb = isParty ? "book" : "join";
  const cfg = {
    login: { icon: LogIn, label: `Log in to ${verb}`, href: LOGIN_NEXT, note: "Log in and get verified to continue." },
    premium: { icon: Crown, label: `Upgrade to ${verb}`, href: "/subscription?plan=user_vip", note: `Joining groups, booking tickets, and group chats are Royvento Premium features.` },
    verify: { icon: ShieldCheck, label: `Verify to ${verb}`, href: "/solo-connect", note: "Complete phone + selfie verification to continue." },
  }[gate];
  const Icon = cfg.icon;
  return (
    <div>
      <Link
        href={cfg.href}
        className="group flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110"
        style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d` }}
      >
        <Icon className="h-4 w-4" /> {cfg.label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <p className="text-[11px] text-center mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>{cfg.note}</p>
    </div>
  );
}

const REPORT_REASONS = [
  { value: "harassment", label: "Harassment" },
  { value: "fake_profile", label: "Fake profile" },
  { value: "abuse", label: "Abuse" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate behaviour" },
  { value: "safety", label: "Safety concern" },
  { value: "other", label: "Other" },
] as const;

// Report-a-member modal. Reason + description + optional live/gallery evidence
// photo (uploaded via the signed-upload flow), POSTed to the report endpoint.
function ReportMemberModal({
  groupId,
  member,
  onClose,
}: {
  groupId: number;
  member: { id: number; name: string };
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onPickEvidence(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setEvidenceUrl(url);
      toast({ title: "Evidence attached." });
    } catch {
      toast({ title: "Could not upload that image.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!reason) { toast({ title: "Choose a reason.", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiPost(`/api/solo-connect/groups/${groupId}/report`, {
        reportedUserId: member.id,
        reason,
        description: description.trim() || undefined,
        evidenceUrl: evidenceUrl || undefined,
      });
      toast({ title: "Report submitted. Our team will review it." });
      onClose();
    } catch (err) {
      toast({ title: (err as { message?: string }).message || "Could not submit report.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
      <div className="relative w-full max-w-md rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(24,22,26,0.99), rgba(13,12,15,0.99))", border: `1px solid ${RED}40`, boxShadow: "0 30px 70px rgba(0,0,0,0.7)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Flag className="h-5 w-5" style={{ color: RED }} />
          <h4 className="font-serif text-xl" style={{ color: "#fff" }}>Report {member.name}</h4>
        </div>

        <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>Reason</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {REPORT_REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <button key={r.value} type="button" onClick={() => setReason(r.value)}
                className="px-3 py-2 rounded-lg text-xs text-left transition-all"
                style={{ background: active ? `${RED}26` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? RED : "rgba(255,255,255,0.12)"}`, color: "#fff" }}>
                {r.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Describe what happened (optional)…"
          className="w-full px-3.5 py-2.5 rounded-lg text-sm mb-3"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
        />

        <label className="flex items-center gap-2 mb-4 text-xs cursor-pointer" style={{ color: "rgba(255,255,255,0.6)" }}>
          <input type="file" accept="image/*" className="hidden" onChange={onPickEvidence} />
          <span className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
            {uploading ? "Uploading…" : evidenceUrl ? "✓ Evidence attached" : "Attach supporting photo (optional)"}
          </span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.15)" }}>Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !reason} className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: busy || !reason ? "rgba(255,255,255,0.08)" : `linear-gradient(135deg, ${RED}, #d23a2a)`, color: busy || !reason ? "rgba(255,255,255,0.4)" : "#fff" }}>
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Temporary group chat. Polls every 4s; messages are wiped server-side at 3 AM.
// A one-time acknowledgement is required before the chat is shown.
function SoloGroupChat({ groupId }: { groupId: number }) {
  const qc = useQueryClient();
  const [ack, setAck] = useState(false);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useListSoloMessages(groupId, {
    query: {
      enabled: ack,
      // Poll fast so incoming messages feel near-real-time.
      refetchInterval: ack ? 1500 : false,
      refetchIntervalInBackground: false,
      retry: false,
    } as any,
  });
  const send = useSendSoloMessage();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function submit() {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText(""); // clear immediately so typing feels instant
    send.mutate(
      { id: groupId, data: { body } },
      {
        onSuccess: (msg) => {
          // Append the saved message to the cache right away so the sender sees
          // it without waiting for the next poll.
          qc.setQueryData(getListSoloMessagesQueryKey(groupId), (old: any) =>
            Array.isArray(old) ? [...old, msg] : [msg],
          );
        },
        onError: () => setText(body), // restore on failure
      },
    );
  }

  if (!ack) {
    return (
      <div className="p-4 rounded-xl mb-5" style={{ background: `${GOLD}10`, border: `1px solid ${GOLD}40` }}>
        <p className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: "#fff" }}>
          <MessageCircle className="h-4 w-4" style={{ color: GOLD }} />Group Chat
        </p>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
          All chat messages are automatically deleted at <span style={{ color: GOLD }}>3:00 AM</span> for privacy and safety.
        </p>
        <button
          type="button"
          onClick={() => setAck(true)}
          className="w-full py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: RED, color: "#fff" }}
        >
          I understand — Enter chat
        </button>
      </div>
    );
  }

  const list = messages ?? [];
  return (
    <div className="mb-5">
      <p className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: "#fff" }}>
        <MessageCircle className="h-4 w-4" style={{ color: GOLD }} />Group Chat
      </p>
      <p className="text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
        Messages auto-delete at 3:00 AM.
      </p>
      <div ref={scrollRef} className="h-56 overflow-y-auto space-y-2 p-3 rounded-xl" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {list.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: "rgba(255,255,255,0.35)" }}>No messages yet. Say hi 👋</p>
        )}
        {list.map((m) => (
          <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[75%] px-3 py-1.5 rounded-2xl"
              style={{
                background: m.isMine ? RED : "rgba(255,255,255,0.07)",
                color: "#fff",
                borderBottomRightRadius: m.isMine ? 4 : undefined,
                borderBottomLeftRadius: m.isMine ? undefined : 4,
              }}
            >
              {!m.isMine && <p className="text-[10px] font-semibold mb-0.5" style={{ color: GOLD }}>{m.userName}</p>}
              <p className="text-sm break-words">{m.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Message…"
          maxLength={1000}
          className="flex-1 px-3.5 py-2.5 rounded-lg text-sm"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={send.isPending || !text.trim()}
          className="px-4 rounded-lg flex items-center justify-center"
          style={{ background: RED, color: "#fff", opacity: !text.trim() ? 0.5 : 1 }}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
