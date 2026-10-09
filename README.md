# Dream Poker Reservation

Separate mobile-first booking application for Dream Poker Da Nang.

## Architecture
- Next.js web application (player and cashier interfaces)
- Standalone deployment, independent of `poker-agent-solution`
- Planned shared Supabase backend, with server-side authorization and transactional seat allocations
- Korean, English and Vietnamese user interface

## Current implementation
The first version is a **prototype** with browser-local test reservations. It does not send a real reservation to the poker room. The public booking process must not be opened for real guests until the shared backend, notifications, cashier authentication and concurrency-safe seat allocation are in place.

## Run
`npm install && npm run dev`

## Next steps
1. Integrate existing Supabase project with locked-down row-level policies and booking RPCs.
2. Add authenticated cashier/operator roles and immutable reservation audit events.
3. Implement live game availability, transactional confirmation, and push notifications.
4. Connect the approved booking state to the existing operations dashboard.
