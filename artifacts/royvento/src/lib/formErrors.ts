import { useCallback, useState } from "react";

export interface FieldErrors {
  [path: string]: string;
}

export interface ApiFieldError extends Error {
  status?: number;
  fieldErrors?: FieldErrors;
}

export function isApiFieldError(e: unknown): e is ApiFieldError {
  return e instanceof Error && (typeof (e as ApiFieldError).fieldErrors === "object" || typeof (e as ApiFieldError).status === "number");
}

export function extractFieldErrors(err: unknown): { topError: string; fieldErrors: FieldErrors } {
  // Generated API client errors stash the server payload on `err.data`.
  const data = (err as { data?: unknown } | null)?.data;
  let nestedFieldErrors: FieldErrors | undefined;
  let nestedTopError: string | undefined;
  if (data && typeof data === "object") {
    const fe = (data as { fieldErrors?: unknown }).fieldErrors;
    if (fe && typeof fe === "object") nestedFieldErrors = fe as FieldErrors;
    const er = (data as { error?: unknown }).error;
    if (typeof er === "string") nestedTopError = er;
  }
  if (isApiFieldError(err)) {
    const fieldErrors = err.fieldErrors ?? nestedFieldErrors ?? {};
    return {
      topError: err.message || nestedTopError || "Please correct the highlighted fields.",
      fieldErrors,
    };
  }
  if (nestedFieldErrors || nestedTopError) {
    return {
      topError: nestedTopError || (err instanceof Error ? err.message : "Please correct the highlighted fields."),
      fieldErrors: nestedFieldErrors ?? {},
    };
  }
  if (err instanceof Error) return { topError: err.message, fieldErrors: {} };
  return { topError: "Something went wrong.", fieldErrors: {} };
}

export function useFormErrors() {
  const [topError, setTopError] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const reset = useCallback(() => {
    setTopError("");
    setFieldErrors({});
  }, []);

  const setFromError = useCallback((err: unknown) => {
    const { topError, fieldErrors } = extractFieldErrors(err);
    setTopError(topError);
    setFieldErrors(fieldErrors);
  }, []);

  const clearField = useCallback((path: string) => {
    setFieldErrors((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const fieldError = useCallback(
    (path: string): string | undefined => fieldErrors[path],
    [fieldErrors],
  );

  return { topError, fieldErrors, fieldError, setFromError, reset, clearField };
}

/** Tailwind className that highlights a field as invalid when an error is present. */
export function fieldClass(base: string, hasError: boolean | string | undefined): string {
  return hasError
    ? `${base} border-red-500 focus-visible:ring-red-500 focus:border-red-500`
    : base;
}
