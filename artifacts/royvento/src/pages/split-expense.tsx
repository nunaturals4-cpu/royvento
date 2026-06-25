import { useEffect, useMemo, useRef, useState } from "react";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useGetMe } from "@workspace/api-client-react";
import {
  Receipt, Plus, Trash2, Users, Wallet, ArrowRight, X as XIcon, UserPlus,
} from "lucide-react";
import {
  type SplitGroup, type Participant, type Expense,
  loadGroups, saveGroups, uid, computeBalances, settleUp, groupTotal, formatINR,
} from "@/lib/splitExpense";

export function SplitExpense() {
  const { toast } = useToast();
  const { data: me } = useGetMe({ query: { retry: false } as any });
  const user = (me?.user as any) ?? null;
  // Namespace storage per-user so accounts don't share tabs on a shared browser;
  // logged-out visitors get a "guest" bucket.
  const userKey = user?.id ?? "guest";

  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load once per user.
  useEffect(() => {
    const loaded = loadGroups(userKey);
    setGroups(loaded);
    setActiveId(loaded[0]?.id ?? null);
    setHydrated(true);
  }, [userKey]);

  // Persist on every change (after the initial hydrate).
  useEffect(() => {
    if (!hydrated) return;
    saveGroups(userKey, groups);
  }, [groups, userKey, hydrated]);

  const activeGroup = groups.find((g) => g.id === activeId) ?? null;

  function patchGroup(id: string, patch: (g: SplitGroup) => SplitGroup) {
    setGroups((prev) => prev.map((g) => (g.id === id ? patch(g) : g)));
  }

  function createGroup() {
    const name = window.prompt("Name this split (e.g. \"Saturday Pub Night\")", "");
    if (name === null) return;
    const trimmed = name.trim() || "New Split";
    const seed: Participant[] = user?.name
      ? [{ id: uid(), name: String(user.name).split(" ")[0] || "Me" }]
      : [];
    const group: SplitGroup = {
      id: uid(),
      name: trimmed,
      participants: seed,
      expenses: [],
      createdAt: new Date().toISOString(),
    };
    setGroups((prev) => [group, ...prev]);
    setActiveId(group.id);
  }

  function deleteGroup(id: string) {
    if (!window.confirm("Delete this split and all its expenses?")) return;
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-14">
      <SEO title="Split Expense | Royvento" canonical="/split-expense" noindex />

      <div className="flex items-start gap-3 mb-2">
        <div className="grid place-items-center h-11 w-11 rounded-2xl bg-primary/10 border border-primary/25 shrink-0">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight">Split Expense</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Split the bill with friends after a night out — add who paid, who was in, and settle up.
          </p>
        </div>
      </div>

      {!hydrated ? null : groups.length === 0 ? (
        <EmptyState onCreate={createGroup} />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
          {/* ── Group rail ── */}
          <aside className="space-y-2">
            <Button onClick={createGroup} className="w-full gap-2">
              <Plus className="h-4 w-4" /> New Split
            </Button>
            <div className="space-y-1.5 mt-2">
              {groups.map((g) => {
                const active = g.id === activeId;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActiveId(g.id)}
                    className={`group/item w-full text-left rounded-xl border px-3.5 py-3 transition-all ${
                      active
                        ? "border-primary/50 bg-primary/[0.07]"
                        : "border-border hover:border-primary/30 hover:bg-foreground/[0.03]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{g.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); deleteGroup(g.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); deleteGroup(g.id); } }}
                        className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                        aria-label="Delete split"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {g.participants.length} {g.participants.length === 1 ? "person" : "people"} · {formatINR(groupTotal(g))}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Active group detail ── */}
          <div className="min-w-0">
            {activeGroup ? (
              <GroupDetail
                key={activeGroup.id}
                group={activeGroup}
                onChange={(patch) => patchGroup(activeGroup.id, patch)}
                toast={toast}
              />
            ) : (
              <Card><CardContent className="py-16 text-center text-muted-foreground">Select a split to view it.</CardContent></Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-10 text-center py-16 rounded-2xl border border-dashed border-border">
      <div className="grid place-items-center h-16 w-16 rounded-2xl bg-primary/10 mx-auto mb-5">
        <Receipt className="h-8 w-8 text-primary" />
      </div>
      <h2 className="font-serif text-2xl mb-2">No splits yet</h2>
      <p className="text-muted-foreground mb-7 max-w-md mx-auto">
        Create a split, add the friends who were there, log each expense, and Royvento works
        out the simplest way for everyone to settle up.
      </p>
      <Button onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" /> Create your first split
      </Button>
    </div>
  );
}

function GroupDetail({
  group, onChange, toast,
}: {
  group: SplitGroup;
  onChange: (patch: (g: SplitGroup) => SplitGroup) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [newName, setNewName] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const nameById = useMemo(
    () => new Map(group.participants.map((p) => [p.id, p.name])),
    [group.participants],
  );

  const balances = useMemo(() => computeBalances(group), [group]);
  const settlements = useMemo(() => settleUp(balances), [balances]);
  const total = groupTotal(group);

  function addParticipant() {
    const name = newName.trim();
    if (!name) return;
    if (group.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Already added", description: `${name} is already in this split.`, variant: "destructive" });
      return;
    }
    onChange((g) => ({ ...g, participants: [...g.participants, { id: uid(), name }] }));
    setNewName("");
  }

  function removeParticipant(id: string) {
    const usedIn = group.expenses.some((e) => e.paidBy === id || e.splitAmong.includes(id));
    if (usedIn && !window.confirm("This person is part of existing expenses. Remove them and those expenses too?")) {
      return;
    }
    onChange((g) => ({
      ...g,
      participants: g.participants.filter((p) => p.id !== id),
      // Drop any expense that depended on this person to keep balances consistent.
      expenses: g.expenses.filter((e) => e.paidBy !== id && !e.splitAmong.includes(id)),
    }));
  }

  function addExpense(expense: Expense) {
    onChange((g) => ({ ...g, expenses: [expense, ...g.expenses] }));
  }

  function removeExpense(id: string) {
    onChange((g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== id) }));
  }

  return (
    <div className="space-y-6">
      {/* Header / summary */}
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-xl truncate">{group.name}</CardTitle>
          <div className="text-right shrink-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total spent</p>
            <p className="text-2xl font-bold tabular-nums">{formatINR(total)}</p>
          </div>
        </CardHeader>
      </Card>

      {/* People */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> People
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {group.participants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/[0.04] pl-3 pr-1.5 py-1 text-sm">
                {p.name}
                <button
                  onClick={() => removeParticipant(p.id)}
                  className="grid place-items-center h-5 w-5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label={`Remove ${p.name}`}
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
            {group.participants.length === 0 && (
              <p className="text-sm text-muted-foreground">Add the friends who were there.</p>
            )}
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
              placeholder="Add a name…"
              className="h-9"
            />
            <Button variant="outline" size="sm" onClick={addParticipant} className="gap-1.5 shrink-0 h-9">
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Expenses
          </CardTitle>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={group.participants.length < 1}
            onClick={() => setExpenseOpen(true)}
          >
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        </CardHeader>
        <CardContent>
          {group.participants.length < 2 ? (
            <p className="text-sm text-muted-foreground py-2">Add at least two people, then log expenses.</p>
          ) : group.expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No expenses yet. Add the first one above.</p>
          ) : (
            <ul className="divide-y divide-border">
              {group.expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{e.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-foreground/80">{nameById.get(e.paidBy) ?? "?"}</span> paid · split between {e.splitAmong.length}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-sm">{formatINR(e.amount)}</span>
                  <button
                    onClick={() => removeExpense(e.id)}
                    className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    aria-label="Remove expense"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Settle up */}
      {group.expenses.length > 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Settle up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Per-person balances */}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {group.participants.map((p) => {
                const bal = balances.get(p.id) ?? 0;
                const owed = bal > 0.005;
                const owes = bal < -0.005;
                return (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <span className={`tabular-nums font-medium ${owed ? "text-emerald-500" : owes ? "text-destructive" : "text-muted-foreground"}`}>
                      {owed ? `gets back ${formatINR(bal)}` : owes ? `owes ${formatINR(-bal)}` : "settled"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Minimal transactions */}
            {settlements.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Simplest way to settle</p>
                {settlements.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-background border border-border px-3 py-2.5 text-sm">
                    <span className="font-medium">{nameById.get(s.from) ?? "?"}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium">{nameById.get(s.to) ?? "?"}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatINR(s.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Everyone's all settled up. 🎉</p>
            )}
          </CardContent>
        </Card>
      )}

      <AddExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        participants={group.participants}
        onAdd={addExpense}
        toast={toast}
      />
    </div>
  );
}

function AddExpenseDialog({
  open, onOpenChange, participants, onAdd, toast,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  participants: Participant[];
  onAdd: (e: Expense) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
  const descRef = useRef<HTMLInputElement | null>(null);

  // Reset + sensible defaults each time the dialog opens (everyone splits, first
  // person paid).
  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setPaidBy(participants[0]?.id ?? "");
    setSplitAmong(participants.map((p) => p.id));
    setTimeout(() => descRef.current?.focus(), 50);
  }, [open, participants]);

  function toggleSharer(id: string) {
    setSplitAmong((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc) { toast({ title: "Add a description", variant: "destructive" }); return; }
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (!paidBy) { toast({ title: "Select who paid", variant: "destructive" }); return; }
    if (splitAmong.length === 0) { toast({ title: "Pick at least one person to split between", variant: "destructive" }); return; }
    onAdd({
      id: uid(),
      description: desc,
      amount: Math.round(amt * 100) / 100,
      paidBy,
      splitAmong,
      createdAt: new Date().toISOString(),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input ref={descRef} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Drinks, dinner, cab…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Amount (₹)</label>
              <Input
                type="number" inputMode="decimal" min="0" step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Paid by</label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger><SelectValue placeholder="Who paid?" /></SelectTrigger>
                <SelectContent>
                  {participants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Split between</label>
              <button
                type="button"
                onClick={() => setSplitAmong(
                  splitAmong.length === participants.length ? [] : participants.map((p) => p.id),
                )}
                className="text-xs text-primary hover:underline"
              >
                {splitAmong.length === participants.length ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
              {participants.map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm cursor-pointer hover:bg-foreground/[0.03]">
                  <Checkbox checked={splitAmong.includes(p.id)} onCheckedChange={() => toggleSharer(p.id)} />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
            {splitAmong.length > 0 && Number(amount) > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatINR((Number(amount) || 0) / splitAmong.length)} each
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Add expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
