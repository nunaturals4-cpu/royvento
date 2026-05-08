import type { Response } from "express";
import type { ZodError } from "zod";

export interface ValidationErrorBody {
  error: string;
  fieldErrors: Record<string, string>;
}

export function zodToFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length > 0 ? issue.path.map((p) => String(p)).join(".") : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function buildValidationError(
  err: ZodError,
  fallback = "Please correct the highlighted fields.",
): ValidationErrorBody {
  const fieldErrors = zodToFieldErrors(err);
  const first = err.issues[0];
  const top = first?.message ?? fallback;
  return { error: top, fieldErrors };
}

export function respondInvalid(
  res: Response,
  err: ZodError,
  fallback?: string,
): void {
  res.status(400).json(buildValidationError(err, fallback));
}
