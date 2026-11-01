// Test-only stand-in for `next/server` so API routes can run under plain Node.
export class NextResponse extends Response {
  static json(body, init = {}) {
    return new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  }
}
