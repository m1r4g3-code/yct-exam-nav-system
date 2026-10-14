export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  errors?: ValidationError[];
  meta?: ApiMeta;
}

export interface ValidationError {
  field: string;
  message: string;
}

/** Pagination details for list endpoints. */
export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function ok<T>(data: T, message = "Success", meta?: ApiMeta): Response {
  return Response.json(
    { success: true, data, message, ...(meta ? { meta } : {}) } satisfies ApiResponse<T>,
    { status: 200 }
  );
}

export function created<T>(data: T, message = "Created"): Response {
  return Response.json({ success: true, data, message } satisfies ApiResponse<T>, {
    status: 201,
  });
}

export function badRequest(message: string, errors?: ValidationError[]): Response {
  return Response.json(
    { success: false, data: null, message, errors } satisfies ApiResponse,
    { status: 400 }
  );
}

export function unauthorized(message = "Unauthorized"): Response {
  return Response.json(
    { success: false, data: null, message } satisfies ApiResponse,
    { status: 401 }
  );
}

export function forbidden(message = "Forbidden"): Response {
  return Response.json(
    { success: false, data: null, message } satisfies ApiResponse,
    { status: 403 }
  );
}

export function notFound(message = "Not found"): Response {
  return Response.json(
    { success: false, data: null, message } satisfies ApiResponse,
    { status: 404 }
  );
}

export function conflict(message: string): Response {
  return Response.json(
    { success: false, data: null, message } satisfies ApiResponse,
    { status: 409 }
  );
}

export function serverError(message = "Internal server error"): Response {
  return Response.json(
    { success: false, data: null, message } satisfies ApiResponse,
    { status: 500 }
  );
}

export function partial<T>(data: T, message = "Partial success"): Response {
  return Response.json({ success: true, data, message } satisfies ApiResponse<T>, {
    status: 207,
  });
}

/** Converts Zod issues into the API's field-level error list. */
export function zodErrors(issues: { path: PropertyKey[]; message: string }[]): ValidationError[] {
  return issues.map((i) => ({ field: i.path.map(String).join("."), message: i.message }));
}

/** Parses ?page=&limit= safely, falling back to defaults on missing or invalid values. */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults: { limit: number; maxLimit: number }
): { page: number; limit: number; skip: number } {
  const rawPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, defaults.maxLimit)
      : defaults.limit;
  return { page, limit, skip: (page - 1) * limit };
}

export function pageMeta(total: number, page: number, limit: number): ApiMeta {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}
