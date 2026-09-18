# Squadlore_Travel_Proj — backend API layer

This is the API layer that sits between the mobile apps and Supabase.
It's built so that later, migrating the location/realtime hot path to
a custom Node/Go + Redis backend means changing what's *inside* the
service classes below — not rewriting routes or mobile clients.

## The one rule that matters

**Never call `supabase` directly outside of `src/db/supabaseClient.ts`
and the service classes in `src/services/`.** Route handlers only call
service methods. This is what keeps the migration path open.

## Structure

```
src/
  db/
    schema.sql          - the Postgres/PostGIS schema (run in Supabase SQL editor)
    supabaseClient.ts   - the ONLY file that imports the Supabase SDK
  services/
    PackService.ts      - Packs/Toli: create, invite, pause/resume, member cap
    TripService.ts      - Trips within a Pack/Toli
    LocationService.ts  - location pings (highest write volume - first migration target)
    MediaService.ts     - photo/video upload, tagging, non-destructive edits
  routes/
    packs.ts
    trips.ts
  index.ts              - Express server entry point
```

## Getting started

1. Create a Supabase project at supabase.com
2. In the Supabase SQL editor, run `src/db/schema.sql`
3. Copy `.env.example` to `.env` and fill in your Supabase URL + key:
   - In the dashboard: **Settings** (bottom-left gear icon) > **API Keys**
   - As of late 2025, Supabase renamed these keys. Use the **Secret key**
     (starts with `sb_secret_...`) - this is the replacement for the old
     `service_role` key. If your project still shows the old naming, use
     `service_role` instead - both work the same way here.
   - Do NOT use the **Publishable key** (`sb_publishable_...` / old `anon`
     key) - it's low-privilege and meant for client-side/public use, and
     this backend needs full access.
4. `npm install`
5. `npm run dev`
6. Hit `GET http://localhost:4000/health` to confirm it's running

## The client UI

There's now a minimal web client at `public/index.html`, served directly by
this same server (same origin - no CORS issues, no separate hosting needed).
Once the server is running, anyone can open:

```
http://YOUR_VM_EXTERNAL_IP:4000
```

...on their phone or laptop and: identify themselves by name + phone,
create or open a Pack/Toli, invite others by phone number, start a trip,
share their live location, upload photos, end the trip, and view the
resulting Memory Stream on a real map (route line + bubbles).

**Known MVP shortcut, worth knowing:** photos are stored as base64 data
URLs directly in Postgres for now, not real object storage. This is fine
for testing with a handful of photos on one trip, but should be swapped
for S3-compatible/Supabase Storage (per the PRD's tech stack) before this
goes further than a small trial - base64-in-Postgres doesn't scale.

## Testing the full MVP loop

Once the server is running (`npm run dev`), in a second terminal run:

```
npx ts-node scripts/test-loop.ts
```

This walks through the exact loop we wanted to validate first:
create two users -> create a Pack/Toli -> add a member -> start a
Trip -> log location pings along a route -> upload photos -> end the
trip -> generate a bare-bones Memory Stream (route + bubbles). It
prints the resulting Memory Stream JSON so you can see the shape of
the data before any UI exists.

If every step prints and you see "Full loop completed successfully"
at the end, the MVP backend loop works end to end. The client UI
described above is the human-facing version of this same loop.

## What's deliberately NOT here yet

- No real auth/SMS verification (the `/users` route is a stand-in for
  testing - build real phone verification before any real user's
  data touches this)
- No video calling, local discovery, or monetization - later phases
- `find_pack_by_exact_members` exists as a SQL function but isn't
  wired into a route yet - add a route once you're ready to build the
  "suggest an existing Pack/Toli" flow

## What's been verified

This project has been installed (`npm install`) and typechecked
(`npx tsc --noEmit`) successfully - it compiles cleanly. It has NOT
been run against a live Supabase project yet, since that needs your
own account and credentials. That's the next step below.

## Suggested first milestone

Create a Pack/Toli -> start a Trip -> record a few location pings and
photos -> generate the Memory Stream. That's the whole MVP loop, end
to end, before a single screen of UI exists - and it's exactly what
`scripts/test-loop.ts` does for you.
