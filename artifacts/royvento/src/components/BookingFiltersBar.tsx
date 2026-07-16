import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

export interface BookingFilters {
  date: string;
  mode: string;
  status: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

interface BookingFiltersBarProps {
  filters: BookingFilters;
  onChange: (filters: BookingFilters) => void;
  /** Omit to hide the Mode dropdown entirely (e.g. organizer/game bookings share one mode). */
  modeOptions?: { value: string; label: string }[];
}

export function BookingFiltersBar({ filters, onChange, modeOptions }: BookingFiltersBarProps) {
  const hasFilters = !!filters.date || filters.mode !== "all" || filters.status !== "all";
  const clear = () => onChange({ date: "", mode: "all", status: "all" });

  return (
    <div className="rounded-2xl glass-card p-4 flex flex-wrap items-end gap-4">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Date</Label>
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => onChange({ ...filters, date: e.target.value })}
          className="w-44"
        />
      </div>

      {modeOptions && modeOptions.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Mode</Label>
          <Select value={filters.mode} onValueChange={(v) => onChange({ ...filters, mode: v })}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {modeOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={filters.status === s.value ? "default" : "outline"}
              onClick={() => onChange({ ...filters, status: s.value })}
              className="text-xs"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {hasFilters && (
        <Button variant="outline" size="sm" onClick={clear}>Clear</Button>
      )}
    </div>
  );
}
