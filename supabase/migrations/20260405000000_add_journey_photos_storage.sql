-- Create the journey-photos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journey-photos',
  'journey-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload their own journey photos
CREATE POLICY "Users can upload own journey photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'journey-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: journey photos are publicly readable
CREATE POLICY "Journey photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'journey-photos');

-- RLS: users can delete own journey photos
CREATE POLICY "Users can delete own journey photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'journey-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
