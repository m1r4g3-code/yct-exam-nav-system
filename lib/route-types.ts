/**
 * Local shim for Next.js 16's generated RouteContext type.
 * The real RouteContext is generated into .next/types/routes.d.ts at dev/build time.
 * This shim satisfies TypeScript without requiring a prior build run.
 */
export type RouteContext<_Route extends string = string> = {
  params: Promise<Record<string, string>>;
};
