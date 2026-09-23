import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  APPS_SCRIPT_URL: "https://example.invalid/exec",
  APPS_SCRIPT_TOKEN: "test-only-placeholder",
};
const transaction = { amount: 12.5, description: " Coffee & cake ", category: " Food " };
const request = (body) => new Request("http://localhost/api/transactions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const originalFetch = globalThis.fetch;
let calls = 0;

try {
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url.origin, "https://example.invalid");
    assert.equal(url.searchParams.get("token"), env.APPS_SCRIPT_TOKEN);
    assert.equal(url.searchParams.get("amount"), "12.5");
    assert.equal(url.searchParams.get("description"), "Coffee & cake");
    assert.equal(url.searchParams.get("category"), "Food");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "follow");
    return Response.json({ success: true, privateDetail: "not exposed" });
  };
  const response = await worker.fetch(request(transaction), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(calls, 1);

  for (const body of [null, [], {}, "text", 123, true,
    ...["amount", "description", "category"].map(field => {
      const incomplete = { ...transaction };
      delete incomplete[field];
      return incomplete;
    }),
    ...["token", "APPS_SCRIPT_URL", "extra", "__proto__", "constructor"].map(field => ({
      ...transaction, [field]: "unexpected",
    })),
    ...[0, -1, "12.5", null, true, [], {}].map(amount => ({ ...transaction, amount })),
    ...["", "  ", null, 123, false, [], {}].flatMap(value => [
      { ...transaction, description: value }, { ...transaction, category: value },
    ])]) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
  }
  for (const raw of ["{", "", '{"amount":1e400,"description":"x","category":"y"}']) {
    assert.equal((await worker.fetch(new Request("http://localhost/api/transactions", {
      method: "POST", body: raw,
    }), env)).status, 400);
  }
  for (const config of [{}, { ...env, APPS_SCRIPT_TOKEN: " " },
    { ...env, APPS_SCRIPT_URL: "invalid" }, { ...env, APPS_SCRIPT_URL: "http://example.invalid" }]) {
    assert.equal((await worker.fetch(request(transaction), config)).status, 500);
  }
  assert.equal(calls, 1, "Invalid input and configuration must not reach Apps Script");
  const preflight = await worker.fetch(new Request("http://localhost/api/transactions", {
    method: "OPTIONS",
    headers: { Origin: "https://example.invalid", "Access-Control-Request-Method": "POST" },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(preflight.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(preflight.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.equal(calls, 1, "Preflight must not contact Apps Script");
  const invalid = await worker.fetch(request({}), env);
  assert.equal(invalid.headers.get("Access-Control-Allow-Origin"), "*");

  for (const upstream of [
    () => new Response("private error", { status: 500 }),
    () => new Response("<html>Login required</html>"),
    () => Response.json({ success: false, error: env.APPS_SCRIPT_TOKEN }),
    () => Response.json(null),
    () => { throw new Error(env.APPS_SCRIPT_TOKEN); },
    () => { throw new DOMException("Timed out", "TimeoutError"); },
  ]) {
    globalThis.fetch = async () => upstream();
    const failure = await worker.fetch(request(transaction), env);
    assert.equal(failure.status, 502);
    assert.equal(failure.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(await failure.json(), { error: "Could not confirm the transaction with Apps Script." });
  }
  const method = await worker.fetch(new Request("http://localhost/api/transactions"), env);
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "POST");
  const hello = await worker.fetch(new Request("http://localhost/api/hello"));
  assert.deepEqual(await hello.json(), { message: "Voice Budget backend is working" });
  assert.equal((await worker.fetch(new Request("http://localhost/unknown"))).status, 404);
  const helloPost = await worker.fetch(new Request("http://localhost/api/hello", { method: "POST" }));
  assert.equal(helloPost.status, 405);
  assert.equal(helloPost.headers.get("Allow"), "GET");
  console.log("Passed: forwarding, validation, secret configuration, upstream failures, and existing routes.");
} finally {
  globalThis.fetch = originalFetch;
}
