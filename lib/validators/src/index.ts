export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const INDIAN_PHONE_RE = /^[6-9]\d{9}$/;

export function normalizeIndianPhone(input: string): string {
  const raw = (input ?? "").trim();
  const hadPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && hadPlus && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

export function isValidEmail(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

export function isValidIndianPhone(value: string): boolean {
  return INDIAN_PHONE_RE.test(normalizeIndianPhone(value));
}

export interface PasswordRule {
  id: "len" | "upper" | "lower" | "num" | "special";
  label: string;
  test: (p: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "Uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "Lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "num", label: "Number (0–9)", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "Special character (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function isStrongPassword(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}

export function getPasswordError(p: string): string | null {
  if (!p) return "Password is required.";
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(p)) return "Password must contain an uppercase letter.";
  if (!/[a-z]/.test(p)) return "Password must contain a lowercase letter.";
  if (!/[0-9]/.test(p)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(p)) return "Password must contain a special character (e.g. !@#$%).";
  return null;
}

export function getEmailError(value: string): string | null {
  if (!value || !value.trim()) return "Email is required.";
  if (!isValidEmail(value)) return "Please enter a valid email address.";
  return null;
}

export function getIndianPhoneError(value: string, opts?: { required?: boolean }): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return opts?.required ? "Phone number is required." : null;
  if (!isValidIndianPhone(trimmed)) {
    return "Enter a valid 10-digit Indian mobile number (starts with 6–9).";
  }
  return null;
}

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}
