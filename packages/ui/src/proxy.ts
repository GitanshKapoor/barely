import { NextRequest, NextResponse } from "next/server";

// Runs per-request on the server, so INTERNAL_API_URL is read at RUNTIME.
// This is the only place that can vary per platform: NEXT_PUBLIC_* vars and
// next.config rewrites are both frozen into the build output.
//
// The browser always calls a relative /api/*, so the shipped bundle contains no
// hostname and one image serves every platform:
//   Compose  - no proxy layer exists, so this forwards to http://barely-api:8000
//   ECS      - the ALB matches /api* first; this never runs
//   K8s      - the Ingress does the same; this never runs
//   npm dev  - falls back to localhost:8000
export function proxy(req: NextRequest) {
  const origin = process.env.INTERNAL_API_URL || "http://localhost:8000";
  return NextResponse.rewrite(
    new URL(req.nextUrl.pathname + req.nextUrl.search, origin)
  );
}

export const config = { matcher: "/api/:path*" };
