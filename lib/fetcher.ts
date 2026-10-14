import type { ApiMeta, ValidationError } from "@/lib/api-response";

/**
 * Shared client-side helpers for calling the app's JSON API.
 *
 * Every endpoint answers with { success, data, message, errors?, meta? }.
 * These helpers unwrap `data`, turn failures into an ApiError with a readable
 * message (so React Query can show an error state instead of an empty list),
 * and send the user back to the sign-in page when their session has expired.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: ValidationError[];

  constructor(message: string, status: number, errors?: ValidationError[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  message: string;
  errors?: ValidationError[];
  meta?: ApiMeta;
}

async function request<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    json = null;
  }

  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      const here = window.location.pathname + window.location.search;
      window.location.assign(`/login?redirectTo=${encodeURIComponent(here)}`);
    }
    throw new ApiError(json?.message || "Your session has expired. Please sign in again.", 401);
  }

  if (!res.ok || !json || json.success === false) {
    throw new ApiError(json?.message || `Request failed (${res.status})`, res.status, json?.errors);
  }

  return json;
}

/** GET a resource and return its `data`. */
export async function apiGet<T>(url: string): Promise<T> {
  const json = await request<T>(url);
  return json.data as T;
}

/** GET a paginated list and return `data` together with `meta`. */
export async function apiGetPage<T>(url: string): Promise<{ data: T; meta?: ApiMeta }> {
  const json = await request<T>(url);
  return { data: json.data as T, meta: json.meta };
}

/** Send JSON (POST/PUT/PATCH/DELETE) and return `data` plus the server's message. */
export async function apiSend<T = unknown>(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<{ data: T; message: string }> {
  const json = await request<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { data: json.data as T, message: json.message };
}

/** Upload a file (multipart/form-data) and return `data` plus the server's message. */
export async function apiUpload<T = unknown>(
  url: string,
  formData: FormData
): Promise<{ data: T; message: string }> {
  const json = await request<T>(url, { method: "POST", body: formData });
  return { data: json.data as T, message: json.message };
}

/** A human-readable message for any error, including the first field-level error when present. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) {
    const first = err.errors?.[0];
    if (first && err.message === "Validation failed")
      return first.field ? `${first.field}: ${first.message}` : first.message;
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
