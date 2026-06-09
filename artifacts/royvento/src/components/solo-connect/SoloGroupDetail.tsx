import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSoloGroup,
  useJoinSoloGroup,
  useLeaveSoloGroup,
  useApproveSoloMember,
  useRejectSoloMember,
  useRemoveSoloMember,
  useLockSoloGroup,
  useCloseSoloGroup,
  useListSoloMessages,
  useSendSoloMessage,
  getListSoloMessagesQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { X, MapPin, Calendar, Users, Phone, Lock, ShieldAlert, Check, UserX, MessageCircle, Send } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const GOLD = "#d4af37";
const RED = "#b91c1c";

const ACTIVITY_ACCENT: Record<string, string> = {
  nightlife: "#a78bfa",
  happy_hours: "#fbbf24",
  food_drinks: "#fb7185",
  events: "#60a5fa",
  games: "#34d399",
  activities: "#fb923c",
};
const accentOf = (a: string) => ACTIVITY_ACCENT[a] ?? GOLD;
const prettyActivity = (a: string) => a.replace(/_/g, " ");

const EMERGENCY = [
  { label: "Police", number: "100" },
  { label: "Emergency", number: "112" },
  { label: "Women Helpline", number: "1091" },
  { label: "Ambulance", number: "108" },
];

export function SoloGroupDetail({
  groupId,
  city,
  onClose,
}: {
  groupId: number;
  city: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetSoloGroup(groupId, { city });

  const join = useJoinSoloGroup();
  const leave = useLeaveSoloGroup();
  const approve = useApproveSoloMember();
  const reject = useRejectSoloMember();
  const remove = useRemoveSoloMember();
  const lock = useLockSoloGroup();
  const close = useCloseSoloGroup();

  function refresh() {
    qc.invalidateQueries({ queryKey: ["/api/solo-connect/groups"] });
  }

  const group = data?.group;
  const members = data?.members ?? [];
  const approvedMembers = members.filter((m) => m.status === "approved");
  const pendingMembers = members.filter((m) => m.status === "requested");
  const isAdmin = group?.isAdmin ?? false;
  const myStatus = group?.myMembershipStatus ?? null;

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

        {isLoading || !group ? (
          <div className="py-24 flex justify-center"><Spinner /></div>
        ) : (
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

            {group.description && (
              <p className="text-sm mb-5" style={{ color: "rgba(255,255,255,0.7)" }}>{group.description}</p>
            )}

            {/* Membership actions */}
            <div className="mb-5">
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
                <button type="button"
                  onClick={() => join.mutate({ id: groupId, data: { city } }, {
                    onSuccess: () => { toast({ title: "Join request sent!" }); refresh(); },
                    onError: (e) => toast({ title: e instanceof Error ? e.message : "Could not join", variant: "destructive" }),
                  })}
                  disabled={join.isPending}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all hover:brightness-110" style={{ background: `linear-gradient(135deg, ${RED}, #d23a2a)`, color: "#fff", boxShadow: `0 10px 28px ${RED}4d` }}>
                  {join.isPending ? "Requesting…" : "Request to join"}
                </button>
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
                      {m.userName}
                      {m.role === "admin" && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: `${GOLD}22`, color: GOLD }}>ADMIN</span>}
                    </span>
                    {isAdmin && m.role !== "admin" && (
                      <button type="button" onClick={() => remove.mutate({ id: groupId, memberId: m.id }, { onSuccess: () => { toast({ title: "Member removed" }); refresh(); } })}
                        className="h-7 w-7 flex items-center justify-center rounded-md" style={{ background: `${RED}1a`, color: "#fca5a5" }}><UserX className="h-3.5 w-3.5" /></button>
                    )}
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
        )}
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
