import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_HEIGHT } from "@/components/PersistentBottomNav";
import { MobileFooter } from "@/components/MobileFooter";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  computeBalances,
  formatINR,
  groupTotal,
  loadGroups,
  saveGroups,
  settleUp,
  uid,
  type Expense,
  type Participant,
  type SplitGroup,
} from "@/lib/splitExpense";

export default function SplitExpenseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // Namespace per-user so accounts on a shared device don't mix splits.
  const userKey = user?.id ?? "guest";

  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  // Load once per user.
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    loadGroups(userKey).then((loaded) => {
      if (cancelled) return;
      setGroups(loaded);
      setActiveId(loaded[0]?.id ?? null);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
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

  function createGroup(rawName: string) {
    const trimmed = rawName.trim() || "New Split";
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
    setGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 8, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Split Expense</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]} numberOfLines={2}>
              Split the bill with friends — add who paid, who was in, and settle up.
            </Text>
          </View>
        </View>
      </View>

      {!hydrated ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: BOTTOM_NAV_HEIGHT + insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Group chips row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            style={{ marginBottom: 16 }}
          >
            <TouchableOpacity
              onPress={() => setNewGroupOpen(true)}
              style={[styles.newChip, { borderColor: colors.primary, backgroundColor: colors.primary + "12" }]}
            >
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={[styles.newChipText, { color: colors.primary }]}>New Split</Text>
            </TouchableOpacity>
            {groups.map((g) => {
              const active = g.id === activeId;
              return (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => setActiveId(g.id)}
                  style={[
                    styles.groupChip,
                    active
                      ? { borderColor: colors.primary, backgroundColor: colors.primary + "1A" }
                      : { borderColor: colors.border, backgroundColor: colors.card },
                  ]}
                >
                  <Text
                    style={[styles.groupChipText, { color: active ? colors.foreground : colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {g.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {groups.length === 0 ? (
            <EmptyState colors={colors} onCreate={() => setNewGroupOpen(true)} />
          ) : activeGroup ? (
            <GroupDetail
              key={activeGroup.id}
              group={activeGroup}
              colors={colors}
              onChange={(patch) => patchGroup(activeGroup.id, patch)}
              onDelete={() => deleteGroup(activeGroup.id)}
            />
          ) : (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", paddingVertical: 40 }}>
              Select a split to view it.
            </Text>
          )}

          <MobileFooter />
        </ScrollView>
      )}

      <NewGroupModal
        open={newGroupOpen}
        colors={colors}
        onClose={() => setNewGroupOpen(false)}
        onCreate={(name) => {
          createGroup(name);
          setNewGroupOpen(false);
        }}
      />
    </View>
  );
}

type Colors = ReturnType<typeof useColors>;

function EmptyState({ colors, onCreate }: { colors: Colors; onCreate: () => void }) {
  return (
    <View style={[styles.empty, { borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "1A" }]}>
        <Ionicons name="receipt-outline" size={30} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No splits yet</Text>
      <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
        Create a split, add the friends who were there, log each expense, and we work out the
        simplest way for everyone to settle up.
      </Text>
      <TouchableOpacity onPress={onCreate} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={18} color={colors.primaryForeground} />
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Create your first split</Text>
      </TouchableOpacity>
    </View>
  );
}

function GroupDetail({
  group,
  colors,
  onChange,
  onDelete,
}: {
  group: SplitGroup;
  colors: Colors;
  onChange: (patch: (g: SplitGroup) => SplitGroup) => void;
  onDelete: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      setNewName("");
      return;
    }
    onChange((g) => ({ ...g, participants: [...g.participants, { id: uid(), name }] }));
    setNewName("");
  }

  function removeParticipant(id: string) {
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
    <View style={{ gap: 16 }}>
      {/* Summary */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.kicker, { color: colors.mutedForeground }]}>TOTAL SPENT</Text>
            <Text style={[styles.total, { color: colors.foreground }]}>{formatINR(total)}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setConfirmDelete(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, alignSelf: "flex-start" }}
        >
          <Ionicons name="trash-outline" size={14} color={colors.destructive} />
          <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: "Inter_500Medium" }}>Delete split</Text>
        </TouchableOpacity>
      </View>

      {/* People */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.sectionHead}>
          <Ionicons name="people-outline" size={16} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>People</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {group.participants.map((p) => (
            <View
              key={p.id}
              style={[styles.personChip, { borderColor: colors.border, backgroundColor: colors.background }]}
            >
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>{p.name}</Text>
              <TouchableOpacity onPress={() => removeParticipant(p.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}
          {group.participants.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Add the friends who were there.</Text>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={addParticipant}
            placeholder="Add a name…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { flex: 1, color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          <TouchableOpacity
            onPress={addParticipant}
            style={[styles.outlineBtn, { borderColor: colors.border }]}
          >
            <Ionicons name="person-add-outline" size={16} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Expenses */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={styles.sectionHead}>
            <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Expenses</Text>
          </View>
          <TouchableOpacity
            disabled={group.participants.length < 1}
            onPress={() => setExpenseOpen(true)}
            style={[
              styles.smallPrimaryBtn,
              { backgroundColor: colors.primary, opacity: group.participants.length < 1 ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="add" size={16} color={colors.primaryForeground} />
            <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Add</Text>
          </TouchableOpacity>
        </View>

        {group.participants.length < 2 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 10 }}>
            Add at least two people, then log expenses.
          </Text>
        ) : group.expenses.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 10 }}>
            No expenses yet. Add the first one above.
          </Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {group.expenses.map((e) => (
              <View
                key={e.id}
                style={[styles.expenseRow, { borderTopColor: colors.border }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                    {e.description}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {nameById.get(e.paidBy) ?? "?"} paid · split between {e.splitAmong.length}
                  </Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                  {formatINR(e.amount)}
                </Text>
                <TouchableOpacity onPress={() => removeExpense(e.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Settle up */}
      {group.expenses.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.primary + "0A", borderColor: colors.primary + "4D" }]}>
          <View style={styles.sectionHead}>
            <Ionicons name="wallet-outline" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Settle up</Text>
          </View>

          {/* Per-person balances */}
          <View style={{ gap: 6, marginTop: 10 }}>
            {group.participants.map((p) => {
              const bal = balances.get(p.id) ?? 0;
              const owed = bal > 0.005;
              const owes = bal < -0.005;
              return (
                <View
                  key={p.id}
                  style={[styles.balanceRow, { borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={1}>{p.name}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_600SemiBold",
                      color: owed ? "#22c55e" : owes ? colors.destructive : colors.mutedForeground,
                    }}
                  >
                    {owed ? `gets back ${formatINR(bal)}` : owes ? `owes ${formatINR(-bal)}` : "settled"}
                  </Text>
                </View>
              );
            })}
          </View>

          {settlements.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={[styles.kicker, { color: colors.mutedForeground }]}>SIMPLEST WAY TO SETTLE</Text>
              {settlements.map((s, i) => (
                <View
                  key={i}
                  style={[styles.settleRow, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    {nameById.get(s.from) ?? "?"}
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>
                    {nameById.get(s.to) ?? "?"}
                  </Text>
                  <Text style={{ marginLeft: "auto", color: colors.foreground, fontSize: 14, fontFamily: "Inter_700Bold" }}>
                    {formatINR(s.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 10 }}>
              Everyone&apos;s all settled up. 🎉
            </Text>
          )}
        </View>
      )}

      <AddExpenseModal
        open={expenseOpen}
        colors={colors}
        participants={group.participants}
        onClose={() => setExpenseOpen(false)}
        onAdd={(e) => {
          addExpense(e);
          setExpenseOpen(false);
        }}
      />

      <ConfirmModal
        open={confirmDelete}
        colors={colors}
        title="Delete this split?"
        message="This split and all its expenses will be removed. This cannot be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </View>
  );
}

function NewGroupModal({
  open,
  colors,
  onClose,
  onCreate,
}: {
  open: boolean;
  colors: Colors;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName("");
  }, [open]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>New split</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            onSubmitEditing={() => onCreate(name)}
            placeholder='e.g. "Saturday Pub Night"'
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, marginTop: 12 }]}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={styles.ghostBtn}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onCreate(name)} style={[styles.smallPrimaryBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Create</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConfirmModal({
  open,
  colors,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  colors: Colors;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable
          style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8, lineHeight: 19 }}>{message}</Text>
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onCancel} style={styles.ghostBtn}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={[styles.smallPrimaryBtn, { backgroundColor: colors.destructive }]}>
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold" }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AddExpenseModal({
  open,
  colors,
  participants,
  onClose,
  onAdd,
}: {
  open: boolean;
  colors: Colors;
  participants: Participant[];
  onClose: () => void;
  onAdd: (e: Expense) => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset + sensible defaults each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setDescription("");
    setAmount("");
    setError(null);
    setPaidBy(participants[0]?.id ?? "");
    setSplitAmong(participants.map((p) => p.id));
  }, [open, participants]);

  function toggleSharer(id: string) {
    setSplitAmong((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    const desc = description.trim();
    const amt = Number(amount);
    if (!desc) return setError("Add a description.");
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!paidBy) return setError("Select who paid.");
    if (splitAmong.length === 0) return setError("Pick at least one person to split between.");
    onAdd({
      id: uid(),
      description: desc,
      amount: Math.round(amt * 100) / 100,
      paidBy,
      splitAmong,
      createdAt: new Date().toISOString(),
    });
  }

  const perHead = splitAmong.length > 0 && Number(amount) > 0 ? (Number(amount) || 0) / splitAmong.length : 0;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add expense</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Drinks, dinner, cab…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Amount (₹)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Paid by</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {participants.map((p) => {
                const active = paidBy === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setPaidBy(p.id)}
                    style={[
                      styles.selectPill,
                      active
                        ? { borderColor: colors.primary, backgroundColor: colors.primary + "1A" }
                        : { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                  >
                    <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Split between</Text>
              <TouchableOpacity
                onPress={() =>
                  setSplitAmong(splitAmong.length === participants.length ? [] : participants.map((p) => p.id))
                }
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_500Medium" }}>
                  {splitAmong.length === participants.length ? "Clear all" : "Select all"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {participants.map((p) => {
                const active = splitAmong.includes(p.id);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => toggleSharer(p.id)}
                    style={[
                      styles.selectPill,
                      { flexDirection: "row", alignItems: "center", gap: 6 },
                      active
                        ? { borderColor: colors.primary, backgroundColor: colors.primary + "1A" }
                        : { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                  >
                    <Ionicons
                      name={active ? "checkmark-circle" : "ellipse-outline"}
                      size={15}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={{ color: active ? colors.foreground : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {perHead > 0 && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>
                {formatINR(perHead)} each
              </Text>
            )}

            {error && (
              <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 12 }}>{error}</Text>
            )}
          </ScrollView>

          <View style={[styles.modalActions, { marginTop: 14 }]}>
            <TouchableOpacity onPress={onClose} style={styles.ghostBtn}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={submit} style={[styles.smallPrimaryBtn, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Add expense</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backBtn: { padding: 4, marginTop: 2 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12.5, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  newChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  newChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  groupChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 180 },
  groupChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },

  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  kicker: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  total: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },

  personChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, borderWidth: 1, paddingLeft: 12, paddingRight: 8, paddingVertical: 7 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  smallPrimaryBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, justifyContent: "center" },

  expenseRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  settleRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },

  empty: { borderRadius: 20, borderWidth: 1, borderStyle: "dashed", padding: 28, alignItems: "center" },
  emptyIcon: { width: 60, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  emptySub: { fontSize: 13.5, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 18 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 420, borderRadius: 18, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  ghostBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, justifyContent: "center" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 32 },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  selectPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
});
