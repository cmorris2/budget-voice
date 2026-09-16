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

Other paths return HTTP 404. Other methods at `/api/hello` return HTTP 405
with `Allow: GET`. Stop the local server with Ctrl+C.

On macOS or Linux, use `npm` and `curl` instead of `npm.cmd` and `curl.exe`.

This backend runs separately from the existing frontend. No Cloudflare account
is needed for local testing, and running the development server does not deploy
the Worker.
