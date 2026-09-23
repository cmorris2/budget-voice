export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (url.pathname === "/api/transactions") {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }
      if (request.method !== "POST") {
        return withCors(new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        }));
      }

      return withCors(await createTransaction(request, env));
    }

    if (url.pathname !== "/api/hello") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    return Response.json({ message: "Voice Budget backend is working" });
  },
};

function withCors(response) {
  // Public endpoint, with no browser cookies or other caller credentials.
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

async function createTransaction(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const fields = ["amount", "description", "category"];
  if (Object.keys(body).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(body, field))) {
    return Response.json(
      { error: "Request body must contain only amount, description, and category." },
      { status: 400 },
    );
  }

  const { amount, description, category } = body;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "amount must be a positive number." }, { status: 400 });
  }
  if (typeof description !== "string" || !description.trim() ||
      typeof category !== "string" || !category.trim()) {
    return Response.json(
      { error: "description and category must be non-empty strings." },
      { status: 400 },
    );
  }

  let upstreamUrl;
  try {
    if (typeof env.APPS_SCRIPT_TOKEN !== "string" || !env.APPS_SCRIPT_TOKEN.trim()) {
      throw new Error("Missing token");
    }
    upstreamUrl = new URL(env.APPS_SCRIPT_URL);
    if (upstreamUrl.protocol !== "https:" || upstreamUrl.username || upstreamUrl.password) {
      throw new Error("Invalid URL");
    }
  } catch {
    return Response.json({ error: "Transaction backend is not configured." }, { status: 500 });
  }

  // Match the existing Apps Script GET contract used by the frontend.
  upstreamUrl.searchParams.set("token", env.APPS_SCRIPT_TOKEN);
  upstreamUrl.searchParams.set("amount", String(amount));
  upstreamUrl.searchParams.set("description", description.trim());
  upstreamUrl.searchParams.set("category", category.trim());

  try {
    const response = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Upstream HTTP error");
    const result = await response.json();
    if (result?.success !== true) throw new Error("Upstream rejected transaction");
    return Response.json({ success: true });
  } catch {
    // Never expose the upstream URL, token, response body, or exception details.
    // Do not retry automatically: Apps Script might already have saved the row.
    return Response.json({ error: "Could not confirm the transaction with Apps Script." }, { status: 502 });
  }
}
