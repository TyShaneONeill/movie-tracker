-- July 2026 security audit — storage lane. Both photo buckets were still
-- PUBLIC (storage.buckets.public = true), so anyone could fetch any user's
-- journey photos / ticket stubs via the /object/public/<bucket>/<path> URL —
-- and ticket stubs leak location. The client already resolves display URLs via
-- createSignedUrl (lib/ticket-photo-url.ts → SignedPhoto), verified on-device
-- 2026-07-03 (photos load), so flipping the buckets private only kills the
-- anonymous public-URL path; owner display is unaffected.
--
-- journey-photos additionally had a `{public}` SELECT policy (anyone could sign
-- any object) — replace with owner-only, matching ticket-photos (which already
-- has an owner-only SELECT from 20260607220702; it only needed the bucket flag).
--
-- All journey-photo render surfaces are owner-context (journey screens, movie
-- detail, edit sheets); friend/public profiles route to public Movie Details,
-- never to another user's journey — so owner-only SELECT breaks no cross-user view.

UPDATE "storage"."buckets" SET "public" = false
 WHERE "id" IN ('journey-photos', 'ticket-photos');

DROP POLICY IF EXISTS "Journey photos are publicly readable" ON "storage"."objects";

CREATE POLICY "Users can read their own journey photos"
  ON "storage"."objects"
  FOR SELECT TO "authenticated"
  USING (
    "bucket_id" = 'journey-photos'
    AND ("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text"
  );
