# budget-voice
Voice control budget template

Budget categories are defined once in `shared/categories.mjs` and imported by
both `index.html` and the Worker. Serve the frontend over HTTP(S), including
the `shared/` directory, so its JavaScript module import can load.

The frontend save request explicitly sends only `amount`, `description`, and
`category` to `/api/transactions`. The parser may propose a `date`, but date
persistence is deferred.

Click **Tap to Speak** and describe your transaction. The recognized transcript
is automatically sent to `/api/parse-transaction`. Review or edit the populated amount, description,
and category, then click **Add Transaction** to save. The fields also support
manual entry without AI. Parsing failures preserve existing field values.

For local integration testing, run `npm.cmd run dev` in `backend/`, temporarily
set `WORKER_URL` in `index.html` to `http://localhost:8787`, and serve the
repository root with an HTTP static server. Restore the deployed Worker URL
before publishing. Both parse and save requests use `WORKER_URL`.

Run `npm.cmd --prefix backend test` from the repository root for mocked backend
and frontend flow checks. These tests do not make OpenAI calls or spreadsheet writes.

## Temporary Google OAuth test

The frontend initializes `supabase-js` directly with the project's public URL
and publishable key. Use **Sign in with Google** to start OAuth. After Google
redirects back, the page restores the Supabase session and displays the user's
email and Supabase user ID. **Sign out** clears the browser session.

Before testing, add every frontend URL you use (for example, the deployed URL
and a local HTTP server URL) to **Supabase Dashboard > Authentication > URL
Configuration > Redirect URLs**. Also make sure the Supabase Google provider's
callback URL is registered as an authorized redirect URI in Google Cloud.

Serve the repository root over HTTP(S); opening `index.html` directly as a
`file://` URL will not work with its JavaScript module imports. This test only
changes frontend authentication UI and does not protect or alter transaction
requests.
