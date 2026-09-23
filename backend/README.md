# Voice Budget backend

A minimal JavaScript Cloudflare Worker, configured with `wrangler.jsonc`.

## Run locally

Use a current Node.js LTS release with npm. From the repository root:

```powershell
cd backend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:8787/api/hello or run this in a second terminal:

```powershell
curl.exe http://localhost:8787/api/hello
```

Expected response (HTTP 200, JSON):

```json
{"message":"Voice Budget backend is working"}
```

Unknown paths return HTTP 404. Other methods at `/api/hello` return HTTP 405
with `Allow: GET`. Stop the local server with Ctrl+C.

On macOS or Linux, use `npm` and `curl` instead of `npm.cmd` and `curl.exe`.

This backend runs separately from the existing frontend. No Cloudflare account
is needed for local testing, and running the development server does not deploy
the Worker.

## POST /api/parse-transaction

Accepts a JSON object containing `text`, which must be a non-empty string.
Missing, non-string, or whitespace-only text, malformed JSON, and non-object
bodies return HTTP 400 with a JSON `error` message.

With the local server running, test from PowerShell:

```powershell
'{"text":"Spent $42.17 at Walmart on groceries yesterday"}' | curl.exe -i http://localhost:8787/api/parse-transaction -H "Content-Type: application/json" --data-binary '@-'
```

Every valid request returns HTTP 200 with this fixed placeholder:

```json
{"amount":42.17,"description":"Walmart","category":"Groceries","date":"2026-09-22"}
```

This endpoint does not call OpenAI or Apps Script, save a transaction, or require
secrets. The date is fixed, not calculated from the input. OPTIONS returns HTTP
204; other methods return HTTP 405 with `Allow: POST`. The existing CORS helper
adds headers to successful responses, validation errors, method errors, and
preflight responses, allowing any origin, POST/OPTIONS, and Content-Type.

## POST /api/transactions

Accepts a JSON object with `amount` (a finite number greater than zero),
`description`, and `category` (non-empty strings). Strings are trimmed before
forwarding. Numeric strings such as `"12.50"` are rejected. Exactly these three
fields are required; missing or extra fields (including `token`) are rejected
with HTTP 400 before any upstream request.

The Worker forwards a GET request to the existing Apps Script web app using
`token`, `amount`, `description`, and `category` query parameters, matching the
existing frontend's contract. Apps Script must return JSON with `success: true`.
The Worker follows redirects, allows 15 seconds for the upstream request, and
returns only `{ "success": true }` on success.

### Configure local secrets

Create `backend/.dev.vars` next to `wrangler.jsonc`, replacing these placeholders
privately with your actual HTTPS web app URL and token:

```dotenv
APPS_SCRIPT_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
APPS_SCRIPT_TOKEN="YOUR_SECRET_TOKEN"
```

The existing `.gitignore` excludes `.dev.vars*` and `.env*`. Do not put real
values in source code, this README, or `wrangler.jsonc`. From the repository root,
verify the exclusion before committing:

```powershell
git check-ignore backend/.dev.vars
git status --short
```

The first command should print `backend/.dev.vars`; the second should not list it.
Do not force-add the file. Restart Wrangler after configuring the secrets:

```powershell
cd backend
npm.cmd run dev
```

Keep that terminal open. In another PowerShell terminal, send:

```powershell
$body = @{
  amount = 12.50
  description = "Test coffee"
  category = "Food"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8787/api/transactions" `
  -Method Post -ContentType "application/json" -Body $body
```

Expected response: `{ "success": true }` (PowerShell displays this as an object).
This forwards to the configured Apps Script and can create a real transaction,
even though the Worker runs locally. Use a test Apps Script deployment/sheet
when you do not want to write to your actual budget.

For an invalid-input check, set `amount = 0` and resend. Expect HTTP 400 and
`{ "error": "amount must be a positive number." }`, with no upstream request.

| Status | Meaning |
| --- | --- |
| 200 | Apps Script confirmed success. |
| 400 | Malformed JSON or invalid/missing transaction fields. |
| 405 | Wrong HTTP method; `/api/transactions` requires POST. |
| 500 | Missing token or missing/invalid HTTPS Apps Script URL. |
| 502 | Apps Script rejected the request, failed, timed out, or returned unexpected data. |

Upstream response bodies and exception details are not returned or logged by
the handler. A 502 does not prove nothing was saved; check the sheet before
retrying. The Worker does not automatically retry transaction writes.

### Automated checks without real secrets or writes

From `backend/`:

```powershell
npm.cmd test
```

These tests mock outbound requests and use dummy configuration. They do not
contact Google or require `.dev.vars`.

### Production configuration

Local `.dev.vars` values are not uploaded. From `backend/`, enter each production
value at Wrangler's secret prompt:

```powershell
npx.cmd wrangler secret put APPS_SCRIPT_URL
npx.cmd wrangler secret put APPS_SCRIPT_TOKEN
npm.cmd run deploy
```

`wrangler secret put` updates the deployed Worker immediately; the final command
deploys the endpoint code. No secrets are stored in the repository by these commands.
See [Cloudflare's secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/).

The endpoint has no caller authentication. The Apps Script token authenticates
the Worker to Apps Script; it does not restrict who can call the Worker endpoint.
The frontend in `index.html` POSTs JSON to the public Worker URL configured in
`WORKER_URL`. Deploy the Worker changes before using the updated frontend:
the transaction route answers browser OPTIONS preflight requests and includes
CORS headers on success and error responses. It allows any origin without
credentials, matching this public endpoint's current lack of authentication.
For local frontend testing, temporarily set `WORKER_URL` to
`http://localhost:8787` while Wrangler is running.
