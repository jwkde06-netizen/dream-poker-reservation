# Local status broadcast guards — integration pending

This is a tested planning/outbox component, **not an activated broadcaster**.
It does not schedule jobs, subscribe to Telegram, read WhatsApp, fetch the LAN
dashboard or control KakaoTalk. Production routes and existing accounting bots
are unchanged. A connected local CUA worker and authorized event adapter are
still required. The Codex local scheduling tool returned a connection error
during setup; no recurring job was confirmed.

## Intended flow

1. An Asia/Ho_Chi_Minh hourly scheduler emits an event at the exact local hour;
   or an authenticated Telegram adapter emits a staff buy-in receipt event.
   Verify chat identity, staff identity and receipt classification upstream.
   Other receipts (F&B, rebuy, screenshots) must never imply another table.
2. Call `Outbox.enqueue(event, now)` with stable source chat/message IDs. Keep
   the SQLite file on a persistent, private local path. Do not commit it.
3. Obtain fresh visible observations through CUA from the exact dashboard URL
   and WhatsApp MM 한국방. Normalize only actual observed data. Capture source
   evidence IDs internally; never place internal messages, player identities,
   financial receipts or evidence IDs in the public announcement.
4. Call `prepare(snapshot, now)`. The dashboard observation must follow the
   trigger. Both observations expire after 120 seconds. Missing/ambiguous data,
   zero active tables, old MM notices and expired schedules require review.
   Do not fall back to a cached public post. A 120-second coalescing delay
   retains pending events; call prepare again with fresh observations before
   the 180-second trigger deadline. Do not silently substitute hourly polling
   for a requested Telegram event subscription.
5. Inspect KakaoTalk's exact room title and recent messages; if a matching post
   already exists, stop and reconcile instead of sending. Check for restriction
   warnings. Paste the returned body into the correct composer and observe it.
6. Immediately before Return, call `mark_submitted` with the observed room,
   composer and current timestamp. If it raises, DO NOT press Return.
   A successful call reserves the sole submission, then the local CUA worker
   presses Return once. This must be a sequential, single-worker operation.
7. Read the actual outgoing message bubble, not merely the composer or a toast.
   Call `verify` with its exact text and stable observed bubble ID. A send that
   has not been verified blocks all subsequent automatic sends, including
   after restart. A prepared send left by a crash also blocks dispatch.

## Recovery and limits

- Never blindly resend after timeout, logout, OS input interruption or missing
  acknowledgment. Inspect the public room and reconcile the outbox manually.
- An operator must reconcile blocked sends/stale events against actual chat
  history before changing their state. There is intentionally no automatic
  retry, unlock or catch-up burst. Keep the evidence of that reconciliation.
- If KakaoTalk displays any restriction warning, stop the local dispatcher and
  disable its scheduler/event subscription. Do not change accounts or bypass
  warnings. A successful test does not establish long-term platform approval.
- `prepare` serializes SQLite claims; `mark_submitted` uses a conditional update
  so only one worker can submit a particular send. SQLite should remain local,
  not on a shared network filesystem. Do not run multiple databases for the
  same room. The caller must also maintain a durable mapping from source room
  IDs to the configured names; display names alone are not authentication.
- Receipts with no change to confirmed public status are suppressed. Hourly
  announcements still occur even if status is unchanged. A new table is counted
  only from the dashboard. Duplicate old/new games on one table count once.
- MM schedule notices expire at the **earliest** scheduled start. Read today's
  latest explicit start/stop message then, rather than declaring a game active
  just because the scheduled time passed. Contradictory notices require review.
- All timestamps must include a timezone. Rendering uses Vietnam local time.
  The CUA worker should prepare a new plan if composition takes over 60 seconds;
  stale composer plans cannot be submitted.

## Verification

Python 3.9+ standard library only:

```sh
python3 -m unittest discover -s tools/status_broadcast -v
```

Fixtures cover the observed dashboard arrangement (tables 4, 5, 12, 13; a
separate tournament on 10; waiting games reusing 12/13) and MM's same-day
time-attack holiday / evening cash schedule. No real messages are sent by tests.
No credentials, receipt images or real Telegram message identifiers are stored
in fixtures.
