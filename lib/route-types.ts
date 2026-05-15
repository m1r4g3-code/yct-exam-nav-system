/**
 * Local shim for Next.js 16's generated RouteContext type.
 * The real RouteContext is generated into .next/types/routes.d.ts at dev/build time.
 * This shim satisfies TypeScript without requiring a prior build run.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- type param kept for call-site documentation; cannot be removed without breaking all RouteContext<"/path"> usages
export type RouteContext<_Route extends string = string> = {
  params: Promise<Record<string, string>>;
};
