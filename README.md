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
