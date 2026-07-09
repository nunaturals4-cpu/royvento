import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Who a deal is for — always rendered (not just for "Ladies") so guest type
 *  is visible on every offer card: Happening Tonight and the Happy Hour page. */
export function GuestTypeBadge({ gender, className }: { gender?: string | null; className?: string }) {
  const { t } = useTranslation();
  const isLadies = gender === "female";
  const isMen = gender === "male";
  const label = isLadies ? t("pub_offers.filter_ladies") : isMen ? t("pub_offers.filter_men") : t("pub_offers.filter_everyone");
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-md",
        isLadies ? "bg-pink-500/90 text-white" : isMen ? "bg-blue-500/90 text-white" : "bg-white/15 text-white/85",
        className,
      )}
    >
      {label}
    </span>
  );
}
