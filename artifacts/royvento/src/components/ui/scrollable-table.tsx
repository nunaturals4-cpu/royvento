import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Wrapper for raw <table> elements that:
 *  - Adds horizontal scroll for wide tables on mobile (overflow-x-auto)
 *  - Adds vertical scroll capped at maxHeight (default 70vh) for long tables
 *  - Lets the consumer make <thead> sticky via the .sticky-thead class
 *    (header rows that need to stick during vertical scroll should use
 *    `className="sticky top-0 z-10 bg-black/95 backdrop-blur"` or similar)
 *  - Keeps the rounded glass-card aesthetic consistent with the rest of
 *    the admin / partner dashboards
 *
 * Usage:
 *   <ScrollableTable minWidth={720}>
 *     <table className="w-full text-sm">
 *       <thead className="sticky top-0 z-10 bg-black/90 backdrop-blur">…</thead>
 *       <tbody>…</tbody>
 *     </table>
 *   </ScrollableTable>
 */
export interface ScrollableTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum pixel width of the inner table — forces a horizontal scrollbar
   *  on narrower viewports instead of squishing columns into illegible widths. */
  minWidth?: number;
  /** Max height before vertical scroll kicks in. Accepts any CSS length.
   *  Defaults to "70vh" so a long table never pushes the page footer off-screen. */
  maxHeight?: string;
  /** Set to true if the consumer's table is short and a vertical scrollbar
   *  would look out of place (e.g. summary tiles inside a card). */
  noVerticalScroll?: boolean;
}

export const ScrollableTable = React.forwardRef<HTMLDivElement, ScrollableTableProps>(
  function ScrollableTable(
    { minWidth, maxHeight = "70vh", noVerticalScroll = false, className, children, style, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full overflow-x-auto rounded-2xl border border-white/10 bg-black/20",
          noVerticalScroll ? "" : "overflow-y-auto",
          className,
        )}
        style={{ ...(noVerticalScroll ? null : { maxHeight }), ...style }}
        {...rest}
      >
        {minWidth ? <div style={{ minWidth }}>{children}</div> : children}
      </div>
    );
  },
);
