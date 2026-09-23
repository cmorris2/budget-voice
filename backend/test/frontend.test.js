import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { allowedCategories } from "../../shared/categories.mjs";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/import .*?from .*?;/, "");
const elements = new Map();
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
  elements.set(id, { value: "", disabled: false, listeners: {}, options: [],
    addEventListener(type, handler) { this.listeners[type] = handler; },
    append(option) { this.options.push(option); },
    reportValidity() { return true; },
    reset() { for (const id of ["amount", "description", "category"]) elements.get(id).value = ""; }
  });
}
const el = id => elements.get(id);
const requests = [];
let respond;
let recognition;
let starts = 0;
class SpeechRecognition {
  constructor() { recognition = this; }
  start() { starts++; }
}
vm.runInNewContext(source, {
  categories: allowedCategories,
  document: { getElementById: el, createElement: () => ({}) },
  window: { SpeechRecognition }, console, AbortSignal,
  fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return respond(); }
});
const parse = (text = "Spent $42.17 at Walmart") => {
  el("speakButton").listeners.click();
  const pending = recognition.onresult({ results: [[{ transcript: text }]] });
  recognition.onend();
  return pending;
};
const submit = () => el("transactionForm").listeners.submit({ preventDefault() {} });
const parsed = { amount: 42.17, description: "<b>Walmart</b>", category: "Food", date: "2026-09-22" };
assert.deepEqual(el("category").options.map(o => o.value), [...allowedCategories]);
assert.equal(elements.has("parseButton"), false);
assert.equal(elements.has("transactionText"), false);
await parse(" ");
assert.equal(requests.length, 0, "Empty text must not call the API");
let finish;
respond = () => new Promise(resolve => { finish = resolve; });
const pending = parse();
assert.equal(el("speakButton").disabled, true);
assert.equal(el("addButton").disabled, true);
const startsBeforeDuplicate = starts;
el("speakButton").listeners.click();
assert.equal(starts, startsBeforeDuplicate);
assert.equal(requests.length, 1, "Duplicate parsing must be blocked");
assert.ok(requests[0].url.endsWith("/api/parse-transaction"));
assert.deepEqual(requests[0].body, { text: "Spent $42.17 at Walmart" });
finish({ ok: true, json: async () => parsed });
await pending;
assert.equal(el("description").value, parsed.description, "Text must be assigned safely as a value");
assert.equal(el("amount").value, "42.17");
assert.equal(el("category").value, "Food");
assert.equal(requests.length, 1, "Parsing must not save");
assert.equal(el("speakButton").disabled, false);
el("amount").value = "45";
el("description").value = "Edited merchant";
el("category").value = "Other";
respond = async () => ({ ok: true, json: async () => ({ success: true }) });
await submit();
assert.ok(requests[1].url.endsWith("/api/transactions"));
assert.deepEqual(requests[1].body, { amount: 45, description: "Edited merchant", category: "Other" });
// Manual entry works without any prior AI result.
el("amount").value = "12"; el("description").value = "Manual"; el("category").value = "Car";
await submit();
assert.equal(requests[2].body.description, "Manual");
el("description").value = "Keep me";
respond = async () => ({ ok: false, json: async () => ({ error: "Unavailable" }) });
await parse();
assert.equal(el("description").value, "Keep me");
assert.equal(el("addButton").disabled, false);
assert.equal(el("description").disabled, false);
respond = () => new Promise(resolve => { finish = resolve; });
const editedPending = parse();
el("description").value = "New manual edit";
el("transactionForm").listeners.input();
finish({ ok: true, json: async () => parsed });
await editedPending;
assert.equal(el("description").value, "New manual edit", "Late AI results must not overwrite edits");
el("speakButton").listeners.click();
assert.equal(el("addButton").disabled, true);
recognition.onerror({ error: "not-allowed" });
recognition.onend();
assert.equal(el("speakButton").disabled, false);
assert.equal(el("addButton").disabled, false);
el("speakButton").listeners.click();
recognition.onend();
assert.match(el("status").innerText, /No speech was heard/);
assert.equal(el("description").value, "New manual edit");
console.log("Passed: speech-to-AI, loading, review/edit, manual entry, three-field save, failures, and stale results.");
