# Player social login

The public reservation page uses a separate `dream-player-auth-v1` Supabase session, PKCE, and Google/Kakao OAuth. There is no password or separate player registration form. The existing staff password session and Telegram workflow stay separate.

Apply `supabase/player_social_login.sql` before deploying. It records the authenticated `auth.uid()` when creating a reservation and lets authenticated users SELECT their own rows. The existing `reservations_member_user` index supports these lookups. The existing staff policy stays in place. Roles are never assigned from OAuth metadata. Guest bookings keep their private device tokens; account bookings are retrieved through RLS and are not persisted in the guest token list.

## Provider setup (required before real login)

The buttons check `/api/player-login/providers` and stay disabled until the corresponding Supabase provider is enabled. Do not treat the buttons as evidence of a working provider connection.

In both provider applications, register this exact OAuth callback:

`https://sncvmxhhsocuamjjwgvz.supabase.co/auth/v1/callback`

- Google Cloud: create a Web OAuth client and configure the consent screen for Dream Poker Reservations. Use only OpenID identity/email/profile scopes. Configure production audience/publishing so ordinary players can sign in, not only listed test users. Enter its client ID and client secret in Supabase Auth → Sign In / Providers → Google.
- Kakao Developers: configure the existing reservation app (or create a dedicated app), enable Kakao Login, set the callback above, and enter the REST API key and client secret in Supabase Auth → Kakao. Use the least profile permissions required. Allow users without an email in Supabase if the Kakao app cannot request `account_email`. Do not request message-sending permissions.
- Keep OAuth secrets in the provider/Supabase consoles only. Never use `NEXT_PUBLIC_*` for a client secret or a service role key.
- Kakao app `1618224` uses optional `profile_nickname` only. Supabase's default Kakao scopes also request `account_email` and `profile_image`, producing KOE205 for this app. Pass `queryParams: { scope: "profile_nickname" }` (singular) to override the upstream OAuth scope; the SDK's plural `scopes` option only appends scopes. The local Python flow uses the same singular parameter. Keep **Allow users without an email** enabled.
- Google Cloud project: `master-chariot-512409-d5` (Dream Poker Reservations), Web client: Dream Poker Reservations Web. Credentials remain only in the consoles.
- In Supabase Auth → URL Configuration, keep the existing staff/password-recovery URLs and add these exact redirect URLs:
  - `https://dream-poker-reservation.vercel.app/auth/player/callback`
  - `http://127.0.0.1:8775/auth/callback` (local Python app)
  - `http://localhost:8775/auth/callback` (only if this host is used)
- The Site URL should be `https://dream-poker-reservation.vercel.app`. Avoid wildcard production redirects.

Google: https://supabase.com/docs/guides/auth/social-login/auth-google
Kakao: https://supabase.com/docs/guides/auth/social-login/auth-kakao

## Verification after activation

1. Each provider must return to the reservation form without losing entered data. Cancelling must return a clear failure message without creating a booking.
2. A booking made while signed in must appear on another device signed in to the same account; staff/Telegram confirmation must update its status.
3. Signing out must hide account-only bookings. A different player must never see those bookings.
4. A guest must still be able to reserve and look up their device-saved booking.
5. Google and Kakao accounts are distinct unless Supabase explicitly links the identities. Do not infer the same person by their name or manually merge accounts.

`tests/player-social-login.sql` verifies ownership, RLS isolation, denied direct writes, and guest compatibility in one rolled-back transaction. It sends no Telegram notification because the outbox inserts never commit. Live provider authentication still requires completing the console configuration and testing with the owner.
