import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = { OPENAI_API_KEY: "test-only-secret" };
const url = "http://localhost/api/parse-transaction";
const transaction = { amount: 42.17, description: "Walmart", category: "Food", date: "2026-09-22" };
const request = (body) => new Request(url, { method: "POST", body: JSON.stringify(body) });
const envelope = (value) => ({ status: "completed", output: [
  { type: "reasoning", summary: [] },
  { type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] },
] });
const originalFetch = globalThis.fetch;
const expectedCategories = [
  "Food", "Gifts/Tithe", "Health/Medical", "Home", "Car", "Personal", "Pets",
  "Home Making", "Fun(Travel)", "Debt", "Savings Account", "Gym", "Subscriptions", "Hygiene", "Other",
];
let calls = 0;
try {
  globalThis.fetch = async (target, options) => {
    calls++;
    assert.equal(target, "https://api.openai.com/v1/responses");
    assert.equal(options.headers.Authorization, `Bearer ${env.OPENAI_API_KEY}`);
    assert.equal(options.redirect, "manual");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.4-nano");
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.deepEqual(body.text.format.schema.required, Object.keys(transaction));
    assert.deepEqual(body.text.format.schema.properties.category, { type: "string", enum: expectedCategories });
    assert.ok(body.instructions.includes(JSON.stringify(expectedCategories)));
    assert.match(body.instructions, /use Other/);
    assert.match(body.instructions, /Today is \d{4}-\d{2}-\d{2} in America\/Chicago/);
    assert.equal(body.input[0].content, "Spent $42.17 at Walmart yesterday");
    assert.ok(!options.body.includes(env.OPENAI_API_KEY));
    return Response.json(envelope(transaction));
  };
  const success = await worker.fetch(request({ text: "Spent $42.17 at Walmart yesterday" }), env);
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), transaction);
  assert.equal(success.headers.get("Access-Control-Allow-Origin"), "*");
  for (const body of [null, [], {}, { text: "" }, { text: "  " }, { text: 4 }, { text: "a".repeat(2001) }]) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
  }
  assert.equal((await worker.fetch(new Request(url, { method: "POST", body: "{" }), env)).status, 400);
  assert.equal((await worker.fetch(request({ text: "coffee" }), {})).status, 500);
  for (const method of ["GET", "OPTIONS"]) {
    const response = await worker.fetch(new Request(url, { method }), env);
    assert.equal(response.status, method === "OPTIONS" ? 204 : 405);
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  }
  assert.equal(calls, 1, "Invalid requests and preflight must not make outbound calls");
  for (const category of expectedCategories) {
    globalThis.fetch = async () => Response.json(envelope({ ...transaction, category }));
    const response = await worker.fetch(request({ text: "expense" }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).category, category);
  }
  const cases = [
    [() => new Response(null, { status: 302, headers: { Location: "https://example.invalid" } }), 502],
    [() => new Response(env.OPENAI_API_KEY, { status: 401 }), 502],
    [() => new Response(env.OPENAI_API_KEY, { status: 429 }), 503],
    [() => { throw new DOMException(env.OPENAI_API_KEY, "TimeoutError"); }, 504],
    [() => { throw new Error(env.OPENAI_API_KEY); }, 502],
    [() => new Response("not JSON"), 502],
    [() => Response.json({ status: "incomplete", output: [] }), 502],
    [() => Response.json({ status: "completed", output: [] }), 502],
    [() => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: env.OPENAI_API_KEY }] }] }), 422],
    [() => Response.json(envelope({ ...transaction, amount: null })), 422],
    [() => Response.json(envelope({ ...transaction, category: null })), 422],
    ...[{ amount: -1 }, { amount: "42" }, { description: " " }, { category: "Groceries" },
      { category: "Health/medical" }, { category: "other" }, { category: "Food " },
      { date: "2026-02-30" }, { date: "yesterday" }, { extra: true }].map(change =>
      [() => Response.json(envelope({ ...transaction, ...change })), 502]),
  ];
  for (const [upstream, status] of cases) {
    globalThis.fetch = async target => {
      assert.equal(target, "https://api.openai.com/v1/responses", "Parsing must never call Apps Script");
      return upstream();
    };
    const response = await worker.fetch(request({ text: "expense" }), env);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.ok(!(await response.text()).includes(env.OPENAI_API_KEY));
  }
  console.log("Passed: structured parsing, validation, CORS, refusals, safe upstream errors, and no spreadsheet writes.");
} finally {
  globalThis.fetch = originalFetch;
}
