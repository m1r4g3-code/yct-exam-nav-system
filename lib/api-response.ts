export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
}

export function ok<T>(data: T, message = "Success"): Response {
  return Response.json({ success: true, data, message } satisfies ApiResponse<T>, {
    status: 200,
  });
}

export function created<T>(data: T, message = "Created"): Response {
  return Response.json({ success: true, data, message } satisfies ApiResponse<T>, {
    status: 201,
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
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
