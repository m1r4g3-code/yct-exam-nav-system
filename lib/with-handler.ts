import { serverError } from "@/lib/api-response";

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

/**
 * Wraps a route handler in a top-level try/catch so unexpected Prisma errors,
 * DB connection failures, and unhandled exceptions always return a structured
 * 500 ApiResponse instead of Next.js's raw error page.
 */
export function withHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      console.error("[route-error]", err);
      return serverError();
    }
  };
}
