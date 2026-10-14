import { conflict, notFound, serverError } from "@/lib/api-response";

type Handler<Req extends Request, Ctx> = (req: Req, ctx: Ctx) => Promise<Response>;

/**
 * Wraps a route handler in a top-level try/catch so database errors and
 * unexpected exceptions always return the structured JSON envelope instead of
 * Next.js's raw error page. Common Prisma errors become friendly responses:
 *   P2002 (unique constraint)      → 409
 *   P2003 (foreign key constraint) → 409
 *   P2025 (record not found)       → 404
 */
export function withHandler<Req extends Request = Request, Ctx = unknown>(
  handler: Handler<Req, Ctx>
): Handler<Req, Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        const target = (err as { meta?: { target?: unknown } }).meta?.target;
        const fields = Array.isArray(target) ? target.join(", ") : typeof target === "string" ? target : "";
        return conflict(
          fields ? `A record with the same ${fields} already exists` : "A record with these details already exists"
        );
      }
      if (code === "P2003")
        return conflict("This record is still referenced by other data and cannot be changed or removed.");
      if (code === "P2025") return notFound("Record not found");
      console.error("[route-error]", err);
      return serverError();
    }
  };
}
