import type { Context, Config } from "@netlify/edge-functions";

const COOKIE = "np_auth";

async function makeToken(password: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret || "fallback"),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return btoa(Array.from(new Uint8Array(sig)).map(b => String.fromCharCode(b)).join(""));
}

function getCookies(req: Request): Record<string, string> {
  return Object.fromEntries(
    (req.headers.get("cookie") ?? "").split(";")
      .filter(Boolean)
      .map(c => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), decodeURIComponent(v.join("="))];
      })
  );
}

export default async (req: Request, context: Context) => {
  try {
    const url = new URL(req.url);
    const password = Netlify.env.get("AUTH_PASSWORD") ?? "";
    const siteToken = Netlify.env.get("AUTH_TOKEN") ?? "";
    const secret = Netlify.env.get("AUTH_SECRET") ?? "";

    // URL token — used by ClickUp iframe embeds (no cookie support)
    if (siteToken && url.searchParams.get("token") === siteToken) {
      return context.next();
    }

    // Cookie auth — set after successful password entry in browser
    const expectedVal = await makeToken(password, secret);
    if (getCookies(req)[COOKIE] === expectedVal) {
      return context.next();
    }

    // Handle password form submission
    if (req.method === "POST" && url.pathname === "/_auth") {
      const form = await req.formData();
      const submitted = (form.get("password") as string) ?? "";
      if (submitted === password) {
        const cookieVal = await makeToken(password, secret);
        const redirectTo = url.searchParams.get("redirect") ?? "/";
        return new Response(null, {
          status: 302,
          headers: {
            Location: redirectTo,
            "Set-Cookie": `${COOKIE}=${encodeURIComponent(cookieVal)}; Path=/; HttpOnly; SameSite=Strict`
          }
        });
      }
      return loginPage(req.url, true);
    }

    return loginPage(req.url, false);
  } catch (err) {
    return new Response("Auth error: " + String(err), { status: 500 });
  }
};

function loginPage(redirectUrl: string, error: boolean): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nobody's Princess</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d0d0d;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#161616;border:1px solid #242424;border-radius:14px;padding:44px 40px;width:100%;max-width:380px}
h1{color:#fff;font-size:17px;font-weight:600;letter-spacing:-.01em;margin-bottom:6px}
.sub{color:#555;font-size:13px;margin-bottom:32px}
label{display:block;color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.09em;margin-bottom:8px}
input{width:100%;background:#1c1c1c;border:1px solid #2c2c2c;border-radius:8px;color:#fff;font-size:14px;padding:11px 13px;outline:none;transition:border-color .15s}
input:focus{border-color:#484848}
.err{color:#f87171;font-size:12px;margin-top:10px}
button{margin-top:22px;width:100%;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:600;padding:12px;cursor:pointer;transition:opacity .15s}
button:hover{opacity:.88}
</style>
</head>
<body>
<div class="card">
  <h1>Nobody's Princess</h1>
  <p class="sub">This page is private.</p>
  <form method="POST" action="/_auth?redirect=${encodeURIComponent(redirectUrl)}">
    <label for="p">Password</label>
    <input type="password" id="p" name="password" autofocus placeholder="••••••••••">
    ${error ? '<p class="err">Incorrect password — try again.</p>' : ""}
    <button type="submit">Continue →</button>
  </form>
</div>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { "Content-Type": "text/html" }
  });
}

export const config: Config = {
  path: "/*"
};
