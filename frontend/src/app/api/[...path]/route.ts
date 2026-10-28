// Same-origin proxy to Django. Reading BACKEND_URL per request (instead of
// next.config rewrites, which standalone builds freeze at build time) lets the
// same image point at `backend:8000` in Docker or `localhost:8000` locally.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

// AI replies can be slow (and a sleeping free-tier backend takes a while to
// wake), so allow up to 60 s on serverless hosts like Vercel.
export const maxDuration = 60;

async function proxy(request: Request, { params }: RouteContext<"/api/[...path]">) {
  const { path } = await params;
  const url = new URL(request.url);
  const target = `${BACKEND}/api/${path.join("/")}${url.search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") ?? "application/json",
  };
  // The Django session cookie rides along both ways, so auth stays first-party.
  const cookie = request.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      // Raw bytes, not text, so any body type passes through untouched.
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
    const out = new Headers({ "Content-Type": res.headers.get("content-type") ?? "application/json" });
    // Keeps the PDF report's download filename.
    const disposition = res.headers.get("content-disposition");
    if (disposition) out.set("Content-Disposition", disposition);
    for (const c of res.headers.getSetCookie()) out.append("Set-Cookie", c);
    return new Response(res.body, { status: res.status, headers: out });
  } catch {
    return Response.json({ error: `Backend unreachable at ${BACKEND}` }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
