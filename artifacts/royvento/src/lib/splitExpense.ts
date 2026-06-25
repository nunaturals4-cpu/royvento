// Split Expense — client-side bill-splitting (Splitwise-style).
//
// All data lives in localStorage on the user's device; there is no backend
// table for this yet. Groups are namespaced per-user (by user id) so two
// accounts on the same browser don't see each other's tabs. The settlement
// math works in integer paise to avoid floating-point drift, then renders back
// to rupees.

export interface Participant {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  description: string;
  /** Total amount of this expense, in rupees. */
  amount: number;
  /** Participant id who paid. */
  paidBy: string;
  /** Participant ids the expense is split equally between. */
  splitAmong: string[];
  createdAt: string;
}

export interface SplitGroup {
  id: string;
  name: string;
  participants: Participant[];
  expenses: Expense[];
  createdAt: string;
}

/** A suggested "who pays whom" transaction that clears all balances. */
export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

const STORAGE_PREFIX = "royvento:split-expense:v1";

function storageKey(userKey: string | number): string {
  return `${STORAGE_PREFIX}:${userKey}`;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function loadGroups(userKey: string | number): SplitGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SplitGroup[];
  } catch {
    return [];
  }
}

export function saveGroups(userKey: string | number, groups: SplitGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userKey), JSON.stringify(groups));
  } catch {
    /* quota / private-mode — best effort only */
  }
}

export function groupTotal(group: SplitGroup): number {
  return group.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

/**
 * Net balance per participant, in rupees.
 *  > 0  → the group owes them money (they over-paid / are a creditor)
 *  < 0  → they owe the group money (they are a debtor)
 * The sum across everyone is always ~0.
 */
export function computeBalances(group: SplitGroup): Map<string, number> {
  // Work in integer paise so equal splits with awkward remainders (e.g. ₹100 / 3)
  // settle exactly instead of leaving a stray fraction of a paisa around.
  const paise = new Map<string, number>();
  for (const p of group.participants) paise.set(p.id, 0);

  for (const e of group.expenses) {
    const sharers = e.splitAmong.filter((id) => paise.has(id));
    if (sharers.length === 0 || !paise.has(e.paidBy)) continue;

    const totalPaise = Math.round((Number(e.amount) || 0) * 100);
    // Credit the payer the full amount …
    paise.set(e.paidBy, (paise.get(e.paidBy) ?? 0) + totalPaise);

    // … then debit each sharer their share. Distribute the rounding remainder
    // one paisa at a time so the splits sum back to the exact total.
    const base = Math.floor(totalPaise / sharers.length);
    let remainder = totalPaise - base * sharers.length;
    for (const id of sharers) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      paise.set(id, (paise.get(id) ?? 0) - share);
    }
  }

  const rupees = new Map<string, number>();
  for (const [id, p] of paise) rupees.set(id, p / 100);
  return rupees;
}

/**
 * Greedily reduces the balance sheet to the minimum set of payments that
 * settles everyone up: largest debtor pays the largest creditor, repeat.
 */
export function settleUp(balances: Map<string, number>): Settlement[] {
  const creditors: { id: string; amt: number }[] = [];
  const debtors: { id: string; amt: number }[] = [];
  for (const [id, bal] of balances) {
    const paise = Math.round(bal * 100);
    if (paise > 0) creditors.push({ id, amt: paise });
    else if (paise < 0) debtors.push({ id, amt: -paise });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const settlements: Settlement[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci]!;
    const debt = debtors[di]!;
    const pay = Math.min(credit.amt, debt.amt);
    if (pay > 0) {
      settlements.push({ from: debt.id, to: credit.id, amount: pay / 100 });
    }
    credit.amt -= pay;
    debt.amt -= pay;
    if (credit.amt === 0) ci += 1;
    if (debt.amt === 0) di += 1;
  }
  return settlements;
}

export function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
