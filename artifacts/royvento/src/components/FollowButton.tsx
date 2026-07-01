import { useState } from "react";
import { useLocation } from "wouter";
import { Bell, BellRing } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { ensurePushSubscription } from "@/lib/webPush";
import { useToast } from "@/hooks/use-toast";

export type FollowTargetType = "vendor" | "event" | "game_organizer" | "organizer";

type FollowState = { following: boolean; followerCount: number };

interface Props {
  targetType: FollowTargetType;
  targetId: number;
  /** Display name used in the confirmation toast (e.g. the venue name). */
  name?: string;
  /** Extra classes merged onto the button wrapper. */
  className?: string;
  /** Hide the follower count suffix. */
  hideCount?: boolean;
}

/**
 * Server-backed Follow / Following button. Works for any followable profile
 * (venue, event, game zone, organizer). Following also opts the user into web
 * push so they receive instant alerts (e.g. a venue's new drink deal).
 */
export function FollowButton({ targetType, targetId, name, className = "", hideCount = false }: Props) {
  const { data: me } = useGetMe({ query: { retry: false } as never });
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const enabled = Number.isFinite(targetId) && targetId > 0;
  const key = ["follow", targetType, targetId] as const;
  const { data } = useQuery<FollowState>({
    queryKey: key,
    queryFn: () => apiGet<FollowState>(`/api/follows/${targetType}/${targetId}`),
    enabled,
  });

  const following = data?.following ?? false;
  const followerCount = data?.followerCount ?? 0;

  const toggle = async () => {
    if (!me?.user) { setLocation("/login"); return; }
    if (busy || !enabled) return;
    setBusy(true);
    const next = !following;
    qc.setQueryData<FollowState>(key, (old) => ({
      following: next,
      followerCount: Math.max(0, (old?.followerCount ?? 0) + (next ? 1 : -1)),
    }));
    try {
      const res = next
        ? await apiPost<FollowState>(`/api/follows/${targetType}/${targetId}`)
        : await apiDelete<FollowState>(`/api/follows/${targetType}/${targetId}`);
      qc.setQueryData(key, res);
      if (next) {
        const ok = await ensurePushSubscription();
        toast({
          title: `Following ${name ?? "this profile"} 🔔`,
          description: ok
            ? "We'll ping you the second there's something new."
            : "Enable notifications to get instant alerts.",
        });
      } else {
        toast({ title: "Unfollowed" });
      }
    } catch {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={[
        // w-fit keeps the button at its content width even inside a flex-column
        // parent (whose default align-items:stretch would otherwise blow it out
        // to full width with the label left-packed). No self-* so it follows the
        // parent's alignment (left in a column, vertically centred in a row).
        "inline-flex w-fit items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium leading-none transition-colors disabled:opacity-60",
        following
          ? "bg-white/10 text-white border border-white/15 hover:bg-white/15"
          : "bg-primary text-white hover:bg-primary/90",
        className,
      ].join(" ")}
    >
      {following ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {following ? "Following" : "Follow"}
      {!hideCount && followerCount > 0 && (
        <span className={following ? "text-white/50" : "text-white/70"}>· {followerCount}</span>
      )}
    </button>
  );
}
