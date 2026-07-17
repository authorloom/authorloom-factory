import { NextResponse } from "next/server";

import { env } from "@/lib/env";

const tokenHeaderName = "x-authorloom-factory-token";

function tokenFromRequest(request: Request) {
  const explicitToken = request.headers.get(tokenHeaderName)?.trim();

  if (explicitToken) {
    return explicitToken;
  }

  const authorization = request.headers.get("authorization")?.trim();
  const [scheme, token] = authorization?.split(/\s+/, 2) ?? [];

  return scheme?.toLowerCase() === "bearer" ? token?.trim() : undefined;
}

export function requireInternalApiAccess(request: Request) {
  const expectedToken = env.AUTHORLOOM_FACTORY_API_TOKEN;

  if (!expectedToken && env.NODE_ENV !== "production") {
    return null;
  }

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Factory API token is not configured." },
      { status: 503 },
    );
  }

  if (tokenFromRequest(request) === expectedToken) {
    return null;
  }

  return NextResponse.json(
    { error: "Factory API access denied." },
    { status: 401 },
  );
}
