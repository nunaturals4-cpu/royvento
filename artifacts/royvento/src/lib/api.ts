function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem("royvento_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "DELETE",
    credentials: "include",
    headers: { ...authHeaders() },
  });
  return handle<T>(res);
}

export const EVENT_TYPES = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "casual", label: "Casual party" },
  { value: "surprise", label: "Surprise party" },
  { value: "corporate", label: "Corporate party" },
  { value: "cultural", label: "Cultural event" },
  { value: "other", label: "Other" },
] as const;

export const EVENT_CATEGORIES = [
  "Wedding",
  "Corporate",
  "Birthday",
  "Cultural",
  "Private",
  "Festival",
  "Concert",
  "Brand Activation",
] as const;

// Budget ranges in INR (5,000 → 100 crore)
export const BUDGET_RANGES = [
  { value: "5k-25k", label: "₹5,000 — ₹25,000", min: 5000, max: 25000 },
  { value: "25k-1L", label: "₹25,000 — ₹1 Lakh", min: 25000, max: 100000 },
  { value: "1L-5L", label: "₹1 Lakh — ₹5 Lakh", min: 100000, max: 500000 },
  { value: "5L-25L", label: "₹5 Lakh — ₹25 Lakh", min: 500000, max: 2500000 },
  { value: "25L-1Cr", label: "₹25 Lakh — ₹1 Crore", min: 2500000, max: 10000000 },
  { value: "1Cr-10Cr", label: "₹1 Crore — ₹10 Crore", min: 10000000, max: 100000000 },
  { value: "10Cr-100Cr", label: "₹10 Crore — ₹100 Crore", min: 100000000, max: 1000000000 },
] as const;

export const INDIAN_STATES = [
  "West Bengal", "Maharashtra", "Karnataka", "Delhi", "Tamil Nadu",
  "Telangana", "Gujarat", "Rajasthan", "Punjab", "Uttar Pradesh",
  "Kerala", "Goa", "Madhya Pradesh", "Haryana", "Bihar",
] as const;

export function formatINR(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function formatINRExact(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export const PUB_EVENT_TYPES = [
  "Live Music",
  "DJ Night",
  "Karaoke",
  "Stand-up Comedy",
  "Themed Party",
  "Quiz Night",
  "Sports Screening",
  "Sundowner",
  "Brunch",
  "New Year",
  "Holi Bash",
  "Diwali Soiree",
  "Christmas Eve",
] as const;

// File → base64 data URL (for demo profile/banner uploads, no object storage required).
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
