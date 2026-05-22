import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Inbox, Send, FileEdit, AlertTriangle, Paperclip, Reply, Search, RefreshCw,
  Trash2, X, Plus, Mail, Copy, Download, ChevronLeft, Bold, Italic, Underline,
  List, Link2, Code, Type, FileText, Loader2, CheckCheck, Eye, MousePointerClick,
  ShieldCheck, CheckCircle2, Info, Gauge,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Folder = "inbox" | "sent" | "drafts" | "failed";

interface EmailStats { inbox: number; unread: number; sent: number; drafts: number; failed: number }

interface ThreadListItem {
  id: number; subject: string; counterpartyEmail: string; counterpartyName: string;
  preview: string; lastMessageAt: string; lastDirection: string; messageCount: number;
  hasUnread: boolean; hasDraft: boolean; hasFailed: boolean;
}

interface DraftListItem {
  id: number; threadId: number | null; status: string; toEmails: string[];
  ccEmails?: string[]; bccEmails?: string[]; subject: string; preview: string;
  bodyText: string; bodyHtml: string; errorMessage: string; createdAt: string;
}

interface Attachment { id: number; filename: string; contentType: string; sizeBytes: number }

interface ThreadMessage {
  id: number; direction: string; status: string; fromEmail: string; fromName: string;
  toEmails: string[]; ccEmails: string[]; bccEmails: string[]; subject: string;
  bodyText: string; bodyHtml: string; snippet: string; isRead: boolean; errorMessage: string;
  openedAt: string | null; clickedAt: string | null; deliveredAt: string | null;
  createdAt: string; messageId: string; attachments: Attachment[];
}

interface ThreadDetail {
  thread: { id: number; subject: string; counterpartyEmail: string; counterpartyName: string; messageCount: number };
  messages: ThreadMessage[];
}

interface ComposerAttachment { filename: string; contentType: string; contentBase64: string; sizeBytes: number }

interface EmailIssue { severity: "error" | "warning" | "info"; code: string; message: string }
interface EmailAnalysis { score: number; grade: "Excellent" | "Good" | "Fair" | "Poor"; issues: EmailIssue[] }
interface DnsCheck { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }
interface DeliverabilityReport { domain: string; fromAddress: string; checks: DnsCheck[] }

interface ComposerState {
  open: boolean;
  mode: "new" | "reply";
  threadId: number | null;
  draftId: number | null;
  to: string;
  cc: string;
  bcc: string;
  showCcBcc: boolean;
  subject: string;
  isHtml: boolean;
  bodyText: string;
  bodyHtml: string;
  attachments: ComposerAttachment[];
}

const EMPTY_COMPOSER: ComposerState = {
  open: false, mode: "new", threadId: null, draftId: null,
  to: "", cc: "", bcc: "", showCcBcc: false, subject: "",
  isHtml: false, bodyText: "", bodyHtml: "", attachments: [],
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

const POLL_MS = 20_000;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const LS_KEY = "rv-email-autosave";

function isDirty(c: Omit<ComposerState, "open">): boolean {
  return !!(c.to || c.cc || c.bcc || c.subject || c.bodyText || c.bodyHtml || c.attachments.length > 0);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function scoreColor(s: number): string {
  return s >= 90 ? "text-emerald-300" : s >= 75 ? "text-emerald-400" : s >= 55 ? "text-amber-300" : "text-red-400";
}
function scoreBar(s: number): string {
  return s >= 75 ? "bg-emerald-400" : s >= 55 ? "bg-amber-400" : "bg-red-400";
}

function initials(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-white/10 text-white/60" },
  queued: { label: "Queued", cls: "bg-sky-500/15 text-sky-300" },
  sent: { label: "Sent", cls: "bg-sky-500/15 text-sky-300" },
  delivered: { label: "Delivered", cls: "bg-emerald-500/15 text-emerald-300" },
  opened: { label: "Opened", cls: "bg-violet-500/15 text-violet-300" },
  clicked: { label: "Clicked", cls: "bg-fuchsia-500/15 text-fuchsia-300" },
  bounced: { label: "Bounced", cls: "bg-red-500/15 text-red-300" },
  complained: { label: "Spam", cls: "bg-red-500/15 text-red-300" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-300" },
  received: { label: "Received", cls: "bg-white/10 text-white/60" },
};

// ─── Rich text editor ─────────────────────────────────────────────────────────

function RichEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const isTyping = useRef(false);

  useEffect(() => {
    if (!isTyping.current && ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
    isTyping.current = false;
  }, [html]);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    ref.current?.focus();
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const tools: { icon: typeof Bold; cmd: string; value?: string; title: string }[] = [
    { icon: Bold, cmd: "bold", title: "Bold" },
    { icon: Italic, cmd: "italic", title: "Italic" },
    { icon: Underline, cmd: "underline", title: "Underline" },
    { icon: Type, cmd: "formatBlock", value: "h3", title: "Heading" },
    { icon: List, cmd: "insertUnorderedList", title: "Bullet list" },
  ];

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/8 bg-white/[0.03] flex-wrap">
        {tools.map((t) => (
          <button
            key={t.cmd + (t.value ?? "")}
            type="button"
            title={t.title}
            onClick={() => exec(t.cmd, t.value)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <t.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) exec("createLink", url);
          }}
          className="h-7 w-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Insert button"
          onClick={() => {
            const url = window.prompt("Button link URL");
            if (!url) return;
            const label = window.prompt("Button label", "Click here") ?? "Click here";
            exec(
              "insertHTML",
              `<a href="${url}" style="display:inline-block;padding:11px 24px;background:#e53e3e;color:#fff;font-weight:700;text-decoration:none;border-radius:6px;">${label}</a>&nbsp;`,
            );
          }}
          className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <MousePointerClick className="h-3.5 w-3.5" /> Button
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={(e) => { isTyping.current = true; onChange((e.target as HTMLDivElement).innerHTML); }}
        className="min-h-[220px] max-h-[420px] overflow-y-auto px-4 py-3 text-sm text-white/90 leading-relaxed focus:outline-none [&_a]:text-primary [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
        suppressContentEditableWarning
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function EmailAdmin() {
  const { toast } = useToast();

  const [folder, setFolder] = useState<Folder>("inbox");
  const [stats, setStats] = useState<EmailStats>({ inbox: 0, unread: 0, sent: 0, drafts: 0, failed: 0 });
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [composer, setComposer] = useState<ComposerState>(EMPTY_COMPOSER);
  const [sending, setSending] = useState(false);
  const [htmlView, setHtmlView] = useState<"visual" | "code" | "preview">("visual");
  const [analysis, setAnalysis] = useState<EmailAnalysis | null>(null);
  const [deliverability, setDeliverability] = useState<DeliverabilityReport | null>(null);
  const [showDeliverability, setShowDeliverability] = useState(false);

  // Delete All state
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // Draft recovery state
  const [recoveryDraft, setRecoveryDraft] = useState<Omit<ComposerState, "open"> | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  // Ref so beforeunload always sees the latest composer state
  const composerRef = useRef<ComposerState>(composer);
  composerRef.current = composer;

  const isFlatFolder = folder === "drafts" || folder === "failed";
  const folderCount = folder === "inbox" ? stats.inbox : folder === "sent" ? stats.sent : folder === "drafts" ? stats.drafts : stats.failed;

  // ── Debounce search ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Live pre-send deliverability analysis (debounced) ──
  useEffect(() => {
    if (!composer.open) { setAnalysis(null); return; }
    const recipientCount = composer.to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).length;
    const t = setTimeout(() => {
      apiPost<EmailAnalysis>("/api/admin/emails/analyze", {
        subject: composer.subject,
        isHtml: composer.isHtml,
        bodyHtml: composer.isHtml ? composer.bodyHtml : undefined,
        bodyText: composer.isHtml ? undefined : composer.bodyText,
        recipientCount,
      }).then(setAnalysis).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [composer.open, composer.subject, composer.isHtml, composer.bodyHtml, composer.bodyText, composer.to]);

  // ── Auto-save to localStorage while composing (debounced 1.5 s) ──
  useEffect(() => {
    if (!composer.open || !isDirty(composer)) return;
    const t = setTimeout(() => {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...composer, open: false }));
    }, 1500);
    return () => clearTimeout(t);
  }, [composer]);

  // ── Save to localStorage on page unload if composer has data ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const c = composerRef.current;
      if (c.open && isDirty(c)) {
        localStorage.setItem(LS_KEY, JSON.stringify({ ...c, open: false }));
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load stats ──
  const loadStats = useCallback(async () => {
    try { setStats(await apiGet<EmailStats>("/api/admin/emails/stats")); } catch {}
  }, []);

  // ── Load list for current folder ──
  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setListLoading(true);
    try {
      const qs = new URLSearchParams({ folder, page: String(page) });
      if (debouncedSearch && !isFlatFolder) qs.set("q", debouncedSearch);
      if (isFlatFolder) {
        const r = await apiGet<{ messages: DraftListItem[]; totalPages: number }>(`/api/admin/emails/messages?${qs}`);
        setDrafts(r.messages);
        setTotalPages(r.totalPages);
      } else {
        const r = await apiGet<{ threads: ThreadListItem[]; totalPages: number }>(`/api/admin/emails/threads?${qs}`);
        setThreads(r.threads);
        setTotalPages(r.totalPages);
      }
    } catch (e: any) {
      if (!opts?.silent) toast({ title: "Failed to load emails", description: e?.message, variant: "destructive" });
    } finally {
      setListLoading(false);
    }
  }, [folder, page, debouncedSearch, isFlatFolder, toast]);

  const [syncing, setSyncing] = useState(false);
  const syncInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setSyncing(true);
    try {
      await apiPost<{ found: number; synced: number }>("/api/admin/emails/sync");
      await Promise.all([loadList({ silent: true }), loadStats()]);
    } catch (e: any) {
      if (!opts?.silent) toast({ title: "Sync failed", description: e?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [loadList, loadStats, toast]);

  useEffect(() => { setPage(1); }, [folder, debouncedSearch]);
  useEffect(() => { loadList(); loadStats(); }, [loadList, loadStats]);
  useEffect(() => { if (folder === "inbox") syncInbox({ silent: true }); }, [folder, syncInbox]);

  // ── Polling ──
  useEffect(() => {
    const id = setInterval(() => {
      loadStats();
      loadList({ silent: true });
      if (folder === "inbox") syncInbox({ silent: true });
      if (selectedThreadId) openThread(selectedThreadId, { silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStats, loadList, selectedThreadId, folder, syncInbox]);

  // ── Open a thread ──
  const openThread = useCallback(async (id: number, opts?: { silent?: boolean }) => {
    setSelectedThreadId(id);
    if (!opts?.silent) setDetailLoading(true);
    try {
      const d = await apiGet<ThreadDetail>(`/api/admin/emails/threads/${id}`);
      setDetail(d);
      if (folder === "inbox" && d.messages.some((m) => m.direction === "inbound" && !m.isRead)) {
        await apiPost(`/api/admin/emails/threads/${id}/read`, { read: true }).catch(() => {});
        loadStats();
        setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, hasUnread: false } : t)));
      }
    } catch (e: any) {
      if (!opts?.silent) toast({ title: "Failed to open conversation", description: e?.message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  }, [folder, loadStats, toast]);

  // ── Composer helpers ──

  /** Silently save to server. Returns the draftId on success. */
  const saveDraftSilently = async (state: ComposerState): Promise<number | null> => {
    try {
      const payload = {
        threadId: state.threadId ?? undefined,
        to: parseEmails(state.to),
        cc: state.showCcBcc ? parseEmails(state.cc) : undefined,
        bcc: state.showCcBcc ? parseEmails(state.bcc) : undefined,
        subject: state.subject,
        isHtml: state.isHtml,
        bodyHtml: state.isHtml ? state.bodyHtml : undefined,
        bodyText: state.isHtml ? undefined : state.bodyText,
      };
      if (state.draftId) {
        await apiPut(`/api/admin/emails/drafts/${state.draftId}`, payload);
        return state.draftId;
      } else {
        const r = await apiPost<{ ok: boolean; messageId?: number }>("/api/admin/emails/drafts", payload);
        return r.messageId ?? null;
      }
    } catch {
      return null;
    }
  };

  /** Close composer after send / explicit save — clears localStorage. */
  const closeComposer = () => {
    localStorage.removeItem(LS_KEY);
    setComposer(EMPTY_COMPOSER);
    setAnalysis(null);
    setShowDeliverability(false);
  };

  /**
   * Close composer initiated by the user (X, ESC, outside click, Cancel).
   * Auto-saves dirty content as a draft before closing.
   */
  const handleComposerClose = async () => {
    if (composer.open && isDirty(composer)) {
      const snapshot = { ...composer, open: false };
      localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
      const draftId = await saveDraftSilently(composer);
      if (draftId) {
        localStorage.setItem(LS_KEY, JSON.stringify({ ...snapshot, draftId }));
      }
      toast({ title: "Draft saved", description: "Closed without sending — your draft has been saved." });
      await Promise.all([loadList(), loadStats()]);
    } else {
      localStorage.removeItem(LS_KEY);
    }
    setComposer(EMPTY_COMPOSER);
    setAnalysis(null);
    setShowDeliverability(false);
  };

  /** Open composer, checking for an unsaved draft in localStorage first. */
  const openCompose = () => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      try {
        const draft = JSON.parse(stored) as Omit<ComposerState, "open"> & { open?: boolean };
        if (isDirty(draft)) {
          setRecoveryDraft(draft);
          setShowRecovery(true);
          return;
        }
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
    setHtmlView("visual");
    setShowDeliverability(false);
    setAnalysis(null);
    setComposer({ ...EMPTY_COMPOSER, open: true, mode: "new" });
  };

  // ── Draft recovery handlers ──
  const handleContinueDraft = () => {
    if (!recoveryDraft) return;
    setHtmlView(recoveryDraft.isHtml && recoveryDraft.bodyHtml ? "code" : "visual");
    setShowDeliverability(false);
    setAnalysis(null);
    setComposer({ ...recoveryDraft, open: true });
    setShowRecovery(false);
    setRecoveryDraft(null);
  };

  const handleDiscardDraft = async () => {
    if (recoveryDraft?.draftId) {
      await apiDelete(`/api/admin/emails/messages/${recoveryDraft.draftId}`).catch(() => {});
      await Promise.all([loadList({ silent: true }), loadStats()]);
    }
    localStorage.removeItem(LS_KEY);
    setRecoveryDraft(null);
    setShowRecovery(false);
    setHtmlView("visual");
    setShowDeliverability(false);
    setAnalysis(null);
    setComposer({ ...EMPTY_COMPOSER, open: true, mode: "new" });
  };

  const handleNewEmail = () => {
    localStorage.removeItem(LS_KEY);
    setRecoveryDraft(null);
    setShowRecovery(false);
    setHtmlView("visual");
    setShowDeliverability(false);
    setAnalysis(null);
    setComposer({ ...EMPTY_COMPOSER, open: true, mode: "new" });
  };

  // ── Delete All ──
  const deleteAll = async () => {
    setDeletingAll(true);
    try {
      const result = await apiDelete<{ ok: boolean; deletedCount: number }>(`/api/admin/emails/folder?folder=${folder}`);
      toast({
        title: `Deleted ${result.deletedCount} item${result.deletedCount !== 1 ? "s" : ""}`,
        description: `All ${folder} emails have been cleared.`,
      });
      if (selectedThreadId) { setSelectedThreadId(null); setDetail(null); }
      await Promise.all([loadList(), loadStats()]);
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message, variant: "destructive" });
    } finally {
      setDeletingAll(false);
      setDeleteAllConfirm(false);
    }
  };

  const loadDeliverability = async () => {
    setShowDeliverability((v) => !v);
    if (!deliverability) {
      try { setDeliverability(await apiGet<DeliverabilityReport>("/api/admin/emails/deliverability")); } catch {}
    }
  };

  const openReply = (d: ThreadDetail) => {
    setHtmlView("visual");
    const last = [...d.messages].reverse().find((m) => m.direction === "inbound") ?? d.messages[d.messages.length - 1];
    setComposer({
      ...EMPTY_COMPOSER,
      open: true,
      mode: "reply",
      threadId: d.thread.id,
      to: last?.fromEmail || d.thread.counterpartyEmail,
      subject: d.thread.subject.match(/^re:/i) ? d.thread.subject : `Re: ${d.thread.subject}`,
    });
  };

  const openDraft = (dr: DraftListItem) => {
    setHtmlView(dr.bodyHtml ? "code" : "visual");
    setComposer({
      ...EMPTY_COMPOSER,
      open: true,
      mode: "new",
      threadId: dr.threadId,
      draftId: dr.id,
      to: (dr.toEmails ?? []).join(", "),
      cc: (dr.ccEmails ?? []).join(", "),
      bcc: (dr.bccEmails ?? []).join(", "),
      showCcBcc: !!(dr.ccEmails?.length || dr.bccEmails?.length),
      subject: dr.subject,
      isHtml: !!dr.bodyHtml,
      bodyText: dr.bodyText,
      bodyHtml: dr.bodyHtml,
    });
  };

  const addAttachments = async (files: FileList | null) => {
    if (!files) return;
    const next: ComposerAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast({ title: `"${file.name}" exceeds 20 MB`, variant: "destructive" });
        continue;
      }
      try {
        const contentBase64 = await fileToBase64(file);
        next.push({ filename: file.name, contentType: file.type || "application/octet-stream", contentBase64, sizeBytes: file.size });
      } catch {
        toast({ title: `Could not read "${file.name}"`, variant: "destructive" });
      }
    }
    if (next.length) setComposer((c) => ({ ...c, attachments: [...c.attachments, ...next] }));
  };

  const validateComposer = (): string | null => {
    const to = parseEmails(composer.to);
    if (to.length === 0) return "Add at least one recipient";
    const bad = [...to, ...parseEmails(composer.cc), ...parseEmails(composer.bcc)].find((e) => !EMAIL_RE.test(e));
    if (bad) return `Invalid email address: ${bad}`;
    if (!composer.subject.trim()) return "Subject is required";
    return null;
  };

  const handleSend = async () => {
    const err = validateComposer();
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    setSending(true);
    try {
      await apiPost("/api/admin/emails/send", {
        threadId: composer.threadId ?? undefined,
        to: parseEmails(composer.to),
        cc: composer.showCcBcc ? parseEmails(composer.cc) : undefined,
        bcc: composer.showCcBcc ? parseEmails(composer.bcc) : undefined,
        subject: composer.subject,
        isHtml: composer.isHtml,
        bodyHtml: composer.isHtml ? composer.bodyHtml : undefined,
        bodyText: composer.isHtml ? undefined : composer.bodyText,
        attachments: composer.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, contentBase64: a.contentBase64 })),
      });
      if (composer.draftId) await apiDelete(`/api/admin/emails/messages/${composer.draftId}`).catch(() => {});
      toast({ title: "Email sent", description: "Delivered via info@royvento.com" });
      closeComposer();
      await Promise.all([loadList(), loadStats()]);
      if (composer.threadId) openThread(composer.threadId);
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setSending(true);
    try {
      const payload = {
        threadId: composer.threadId ?? undefined,
        to: parseEmails(composer.to),
        cc: composer.showCcBcc ? parseEmails(composer.cc) : undefined,
        bcc: composer.showCcBcc ? parseEmails(composer.bcc) : undefined,
        subject: composer.subject,
        isHtml: composer.isHtml,
        bodyHtml: composer.isHtml ? composer.bodyHtml : undefined,
        bodyText: composer.isHtml ? undefined : composer.bodyText,
      };
      if (composer.draftId) await apiPut(`/api/admin/emails/drafts/${composer.draftId}`, payload);
      else await apiPost("/api/admin/emails/drafts", payload);
      toast({ title: "Draft saved" });
      closeComposer();
      await Promise.all([loadList(), loadStats()]);
    } catch (e: any) {
      toast({ title: "Failed to save draft", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const deleteThread = async (id: number) => {
    if (!window.confirm("Delete this entire conversation? This cannot be undone.")) return;
    try {
      await apiDelete(`/api/admin/emails/threads/${id}`);
      if (selectedThreadId === id) { setSelectedThreadId(null); setDetail(null); }
      await Promise.all([loadList(), loadStats()]);
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message, variant: "destructive" });
    }
  };

  const deleteDraft = async (id: number) => {
    if (!window.confirm("Discard this draft?")) return;
    try {
      await apiDelete(`/api/admin/emails/messages/${id}`);
      await Promise.all([loadList(), loadStats()]);
    } catch (e: any) {
      toast({ title: "Failed to delete draft", description: e?.message, variant: "destructive" });
    }
  };

  const copyEmail = (email: string) => {
    navigator.clipboard?.writeText(email).then(
      () => toast({ title: "Email copied", description: email }),
      () => {},
    );
  };

  // ── Sidebar folders ──
  const folders: { key: Folder; label: string; icon: typeof Inbox; count: number; badge?: number }[] = [
    { key: "inbox", label: "Inbox", icon: Inbox, count: stats.inbox, badge: stats.unread },
    { key: "sent", label: "Sent", icon: Send, count: stats.sent },
    { key: "drafts", label: "Drafts", icon: FileEdit, count: stats.drafts },
    { key: "failed", label: "Failed", icon: AlertTriangle, count: stats.failed },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl glass-card p-5 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 red-ring">
          <Mail className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-serif text-2xl">Send &amp; Receive Email</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            A mini email workspace powered by Resend. All mail is sent from <span className="text-white/80">info@royvento.com</span>.
          </p>
        </div>
        <Button onClick={openCompose} className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" /> Compose
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_minmax(0,340px)_minmax(0,1fr)] gap-4">
        {/* ── Sidebar ── */}
        <div className="rounded-2xl glass-card p-3 h-fit lg:sticky lg:top-4">
          <div className="flex flex-col gap-1">
            {folders.map((f) => {
              const active = folder === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => { setFolder(f.key); setSelectedThreadId(null); setDetail(null); }}
                  className={
                    "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border " +
                    (active
                      ? "bg-white/[0.07] border-white/[0.10] text-white"
                      : "border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]")
                  }
                >
                  <f.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{f.label}</span>
                  {f.badge ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">{f.badge}</span>
                  ) : f.count ? (
                    <span className="text-[11px] text-white/40">{f.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── List pane ── */}
        <div className={"rounded-2xl glass-card overflow-hidden flex flex-col " + (selectedThreadId ? "hidden lg:flex" : "flex")}>
          <div className="p-3 border-b border-white/8 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isFlatFolder ? "Search disabled here" : "Search mail…"}
                disabled={isFlatFolder}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title={folder === "inbox" ? "Sync from Resend" : "Refresh"}
              onClick={() => { if (folder === "inbox") syncInbox(); else { loadList(); loadStats(); } }}
            >
              <RefreshCw className={"h-3.5 w-3.5 " + (listLoading || syncing ? "animate-spin" : "")} />
            </Button>
            {folderCount > 0 && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 text-white/40 hover:text-red-300 hover:border-red-500/30"
                title={`Delete all ${folder}`}
                onClick={() => setDeleteAllConfirm(true)}
                disabled={listLoading || deletingAll}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="overflow-y-auto max-h-[68vh] min-h-[300px]">
            {listLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…</div>
            ) : isFlatFolder ? (
              drafts.length === 0 ? (
                <EmptyState folder={folder} />
              ) : (
                drafts.map((dr) => (
                  <button
                    key={dr.id}
                    onClick={() => (folder === "drafts" ? openDraft(dr) : dr.threadId && openThread(dr.threadId))}
                    className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{(dr.toEmails ?? []).join(", ") || "(no recipient)"}</span>
                      <span className="text-[11px] text-white/40 shrink-0">{fmtDate(dr.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white/70 truncate mt-0.5">{dr.subject || "(no subject)"}</p>
                    <p className="text-xs text-white/40 truncate mt-0.5">{dr.preview}</p>
                    {folder === "failed" && dr.errorMessage && (
                      <p className="text-[11px] text-red-300 truncate mt-1">⚠ {dr.errorMessage}</p>
                    )}
                  </button>
                ))
              )
            ) : threads.length === 0 ? (
              <EmptyState folder={folder} />
            ) : (
              threads.map((t) => {
                const active = selectedThreadId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => openThread(t.id)}
                    className={
                      "w-full text-left px-4 py-3 border-b border-white/5 transition-colors " +
                      (active ? "bg-white/[0.06]" : "hover:bg-white/[0.04]") +
                      (t.hasUnread ? " border-l-2 border-l-primary" : "")
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-8 w-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {initials(t.counterpartyName, t.counterpartyEmail)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={"text-sm truncate " + (t.hasUnread ? "font-semibold text-white" : "text-white/80")}>
                            {t.counterpartyName || t.counterpartyEmail}
                          </span>
                          <span className="text-[11px] text-white/40 shrink-0">{fmtDate(t.lastMessageAt)}</span>
                        </div>
                        <p className={"text-sm truncate " + (t.hasUnread ? "text-white/90" : "text-white/60")}>{t.subject || "(no subject)"}</p>
                        <p className="text-xs text-white/40 truncate mt-0.5">{t.preview}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {t.messageCount > 1 && <span className="text-[10px] text-white/40">{t.messageCount}</span>}
                        {t.hasDraft && <span className="text-[9px] px-1 rounded bg-white/10 text-white/50">draft</span>}
                        {t.hasFailed && <span className="text-[9px] px-1 rounded bg-red-500/15 text-red-300">failed</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="p-2 border-t border-white/8 flex items-center justify-center gap-3 text-xs">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span className="text-white/50">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>

        {/* ── Conversation pane ── */}
        <div className={"rounded-2xl glass-card overflow-hidden flex-col " + (selectedThreadId ? "flex" : "hidden lg:flex")}>
          {!detail ? (
            <div className="flex-1 flex items-center justify-center p-10 text-center text-sm text-muted-foreground min-h-[300px]">
              <div>
                <Mail className="h-8 w-8 mx-auto mb-3 text-white/20" />
                Select a conversation to read it here.
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/8 flex items-start gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden shrink-0" onClick={() => { setSelectedThreadId(null); setDetail(null); }}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-base truncate">{detail.thread.subject || "(no subject)"}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-white/50 truncate">{detail.thread.counterpartyName ? `${detail.thread.counterpartyName} · ` : ""}{detail.thread.counterpartyEmail}</p>
                    <button onClick={() => copyEmail(detail.thread.counterpartyEmail)} className="text-white/40 hover:text-white shrink-0" title="Copy email"><Copy className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openReply(detail)}><Reply className="h-3.5 w-3.5" /> Reply</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-red-300" onClick={() => deleteThread(detail.thread.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[60vh] min-h-[240px] p-4 space-y-3">
                {detailLoading && <div className="text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>}
                {[...detail.messages].reverse().map((m) => <MessageCard key={m.id} m={m} onCopy={copyEmail} />)}
              </div>

              <div className="p-3 border-t border-white/8">
                <Button variant="outline" className="w-full gap-1.5" onClick={() => openReply(detail)}>
                  <Reply className="h-3.5 w-3.5" /> Reply from info@royvento.com
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Delete All confirmation dialog ── */}
      <Dialog open={deleteAllConfirm} onOpenChange={(o) => { if (!o) setDeleteAllConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete all {folder} emails?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete all {folderCount} {folder} email{folderCount !== 1 ? "s" : ""}. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteAllConfirm(false)} disabled={deletingAll}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0"
              onClick={deleteAll}
              disabled={deletingAll}
            >
              {deletingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete All
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Draft recovery dialog ── */}
      <Dialog open={showRecovery} onOpenChange={(o) => { if (!o) { setShowRecovery(false); setRecoveryDraft(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsent draft found</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have an unsent email draft{recoveryDraft?.subject ? ` — "${recoveryDraft.subject}"` : ""}. What would you like to do?
          </p>
          {recoveryDraft && (recoveryDraft.to || recoveryDraft.subject) && (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm space-y-1">
              {recoveryDraft.to && (
                <p className="text-white/50">To: <span className="text-white/80">{recoveryDraft.to}</span></p>
              )}
              {recoveryDraft.subject && (
                <p className="text-white/50">Subject: <span className="text-white/80">{recoveryDraft.subject}</span></p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={handleContinueDraft} className="w-full gap-1.5">
              <FileEdit className="h-4 w-4" /> Continue Draft
            </Button>
            <Button variant="outline" onClick={handleNewEmail} className="w-full gap-1.5">
              <Plus className="h-4 w-4" /> Create New Email
            </Button>
            <Button
              variant="ghost"
              onClick={handleDiscardDraft}
              className="w-full gap-1.5 text-red-300 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" /> Discard Draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Composer modal ── */}
      <Dialog open={composer.open} onOpenChange={(o) => { if (!o) void handleComposerClose(); }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{composer.mode === "reply" ? "Reply" : composer.draftId ? "Edit draft" : "New email"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
                {!composer.showCcBcc && (
                  <button onClick={() => setComposer((c) => ({ ...c, showCcBcc: true }))} className="text-[11px] text-primary hover:underline">Add Cc/Bcc</button>
                )}
              </div>
              <Input value={composer.to} onChange={(e) => setComposer((c) => ({ ...c, to: e.target.value }))} placeholder="recipient@example.com, another@example.com" className="h-9 text-sm" />
            </div>

            {composer.showCcBcc && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Cc</Label>
                  <Input value={composer.cc} onChange={(e) => setComposer((c) => ({ ...c, cc: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Bcc</Label>
                  <Input value={composer.bcc} onChange={(e) => setComposer((c) => ({ ...c, bcc: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Subject</Label>
              <Input value={composer.subject} onChange={(e) => setComposer((c) => ({ ...c, subject: e.target.value }))} placeholder="Subject" className="h-9 text-sm" />
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs w-fit">
              <button
                onClick={() => setComposer((c) => ({ ...c, isHtml: false }))}
                className={"px-3 py-1.5 flex items-center gap-1.5 " + (!composer.isHtml ? "bg-primary text-white" : "text-white/60 hover:bg-white/5")}
              ><FileText className="h-3 w-3" /> Plain text</button>
              <button
                onClick={() => setComposer((c) => ({ ...c, isHtml: true }))}
                className={"px-3 py-1.5 flex items-center gap-1.5 " + (composer.isHtml ? "bg-primary text-white" : "text-white/60 hover:bg-white/5")}
              ><Code className="h-3 w-3" /> Rich HTML</button>
            </div>

            {/* Body */}
            {composer.isHtml ? (
              <div className="space-y-2">
                <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs w-fit">
                  {([
                    { id: "visual", label: "Visual", icon: Type },
                    { id: "code", label: "HTML", icon: Code },
                    { id: "preview", label: "Preview", icon: Eye },
                  ] as const).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setHtmlView(v.id)}
                      className={"px-3 py-1.5 flex items-center gap-1.5 " + (htmlView === v.id ? "bg-primary text-white" : "text-white/60 hover:bg-white/5")}
                    ><v.icon className="h-3 w-3" /> {v.label}</button>
                  ))}
                </div>

                {htmlView === "visual" && (
                  <RichEditor html={composer.bodyHtml} onChange={(html) => setComposer((c) => ({ ...c, bodyHtml: html }))} />
                )}

                {htmlView === "code" && (
                  <div className="space-y-1.5">
                    <Textarea
                      value={composer.bodyHtml}
                      onChange={(e) => setComposer((c) => ({ ...c, bodyHtml: e.target.value }))}
                      placeholder="<h1>Hello</h1>&#10;<p>Paste or write raw HTML here — it's sent as a real rendered email.</p>"
                      spellCheck={false}
                      className="min-h-[260px] text-xs font-mono leading-relaxed"
                    />
                    <p className="text-[11px] text-white/40">Write or paste raw HTML. Tags render in the recipient's inbox — they are not shown as text.</p>
                  </div>
                )}

                {htmlView === "preview" && (
                  <div className="space-y-1.5">
                    <iframe
                      title="Email preview"
                      sandbox=""
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;background:#fff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;padding:24px;">${composer.bodyHtml || '<p style="color:#999;">Nothing to preview yet.</p>'}</body></html>`}
                      className="w-full min-h-[300px] rounded-xl border border-white/10 bg-white"
                    />
                    <p className="text-[11px] text-white/40">Body preview. The Royvento header &amp; footer are added automatically when the email is sent.</p>
                  </div>
                )}
              </div>
            ) : (
              <Textarea value={composer.bodyText} onChange={(e) => setComposer((c) => ({ ...c, bodyText: e.target.value }))} placeholder="Write your message…" className="min-h-[220px] text-sm" />
            )}

            {/* Attachments */}
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                {composer.attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1">
                    <Paperclip className="h-3 w-3 text-white/50" />
                    <span className="max-w-[160px] truncate">{a.filename}</span>
                    <span className="text-white/40">{fmtBytes(a.sizeBytes)}</span>
                    <button onClick={() => setComposer((c) => ({ ...c, attachments: c.attachments.filter((_, idx) => idx !== i) }))} className="text-white/40 hover:text-red-300"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white cursor-pointer">
                <Paperclip className="h-3.5 w-3.5" /> Attach files
                <input type="file" multiple className="hidden" onChange={(e) => { addAttachments(e.target.files); e.target.value = ""; }} />
              </label>
            </div>

            {/* Deliverability: pre-send content analysis + domain auth */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
                  <Gauge className="h-3.5 w-3.5 text-primary" /> Deliverability
                </div>
                {analysis && (
                  <span className={"text-xs font-semibold " + scoreColor(analysis.score)}>{analysis.score}/100 · {analysis.grade}</span>
                )}
              </div>

              {analysis && (
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className={"h-full rounded-full transition-all " + scoreBar(analysis.score)} style={{ width: `${analysis.score}%` }} />
                </div>
              )}

              {!analysis ? (
                <p className="text-[11px] text-white/30">Analyzing…</p>
              ) : analysis.issues.length === 0 ? (
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-300"><CheckCircle2 className="h-3 w-3" /> No content issues detected.</p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.issues.map((it, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                      {it.severity === "error"
                        ? <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                        : it.severity === "warning"
                          ? <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                          : <Info className="h-3 w-3 text-sky-400 mt-0.5 shrink-0" />}
                      <span className="text-white/60">{it.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="pt-1.5 border-t border-white/8">
                <button type="button" onClick={loadDeliverability} className="inline-flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white transition-colors">
                  <ShieldCheck className="h-3 w-3" /> Domain authentication (SPF · DKIM · DMARC)
                </button>
                {showDeliverability && (
                  <div className="mt-2 space-y-1.5">
                    {!deliverability ? (
                      <p className="text-[11px] text-white/30">Checking DNS…</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-white/40">{deliverability.fromAddress} · {deliverability.domain}</p>
                        {deliverability.checks.map((c) => (
                          <div key={c.id} className="flex items-start gap-1.5 text-[11px]">
                            {c.status === "pass"
                              ? <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                              : <AlertTriangle className={"h-3 w-3 mt-0.5 shrink-0 " + (c.status === "warn" ? "text-amber-400" : "text-red-400")} />}
                            <span className="text-white/60"><span className="font-semibold text-white/80">{c.label}:</span> {c.detail}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/8">
            <Button variant="ghost" size="sm" onClick={handleSaveDraft} disabled={sending}>Save draft</Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleComposerClose()} disabled={sending}>Cancel</Button>
              <Button size="sm" className="gap-1.5" onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EmptyState({ folder }: { folder: Folder }) {
  const copy: Record<Folder, string> = {
    inbox: "No emails in your inbox yet. Messages sent to info@royvento.com will appear here.",
    sent: "Nothing sent yet. Compose a new email to get started.",
    drafts: "No drafts saved.",
    failed: "No failed emails — everything's been delivered.",
  };
  return (
    <div className="p-10 text-center text-sm text-muted-foreground">
      <Mail className="h-7 w-7 mx-auto mb-3 text-white/15" />
      {copy[folder]}
    </div>
  );
}

function MessageCard({ m, onCopy }: { m: ThreadMessage; onCopy: (e: string) => void }) {
  const [expanded, setExpanded] = useState(true);
  const outbound = m.direction === "outbound";
  const status = STATUS_META[m.status] ?? STATUS_META["received"]!;

  return (
    <div className={"rounded-xl border p-3.5 " + (outbound ? "border-primary/20 bg-primary/[0.04]" : "border-white/10 bg-white/[0.02]")}>
      <div className="flex items-start gap-2.5">
        <span className={"h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 " + (outbound ? "bg-primary/20 text-primary" : "bg-white/[0.06] text-white/70 border border-white/10")}>
          {outbound ? "RV" : initials(m.fromName, m.fromEmail)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate">{outbound ? "Royvento" : (m.fromName || m.fromEmail)}</span>
              <button onClick={() => onCopy(m.fromEmail)} className="text-white/30 hover:text-white shrink-0" title="Copy sender"><Copy className="h-3 w-3" /></button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + status.cls}>{status.label}</span>
              <span className="text-[11px] text-white/40">{fmtDate(m.createdAt)}</span>
            </div>
          </div>
          <p className="text-[11px] text-white/40 truncate">to {m.toEmails.join(", ")}{m.ccEmails.length ? ` · cc ${m.ccEmails.join(", ")}` : ""}</p>

          {outbound && (m.deliveredAt || m.openedAt || m.clickedAt) && (
            <div className="flex items-center gap-2 mt-1.5">
              {m.deliveredAt && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300"><CheckCheck className="h-3 w-3" /> Delivered</span>}
              {m.openedAt && <span className="inline-flex items-center gap-1 text-[10px] text-violet-300"><Eye className="h-3 w-3" /> Opened</span>}
              {m.clickedAt && <span className="inline-flex items-center gap-1 text-[10px] text-fuchsia-300"><MousePointerClick className="h-3 w-3" /> Clicked</span>}
            </div>
          )}
          {m.errorMessage && <p className="text-[11px] text-red-300 mt-1">⚠ {m.errorMessage}</p>}

          <button onClick={() => setExpanded((e) => !e)} className="text-[11px] text-white/40 hover:text-white/70 mt-1">
            {expanded ? "Hide" : "Show message"}
          </button>

          {expanded && (
            <div className="mt-2">
              {m.bodyHtml ? (
                <div className="rounded-lg bg-white text-black p-3 overflow-x-auto text-sm" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-sm text-white/80 font-sans">{m.bodyText}</pre>
              )}

              {m.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/admin/emails/attachments/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1.5 hover:bg-white/[0.10] transition-colors"
                    >
                      <Paperclip className="h-3 w-3 text-white/50" />
                      <span className="max-w-[160px] truncate">{a.filename}</span>
                      <span className="text-white/40">{fmtBytes(a.sizeBytes)}</span>
                      <Download className="h-3 w-3 text-white/50" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
