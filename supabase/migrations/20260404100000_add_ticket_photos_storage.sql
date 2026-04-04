-- Create the ticket-photos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-photos',
  'ticket-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload their own ticket photos
CREATE POLICY "Users can upload their own ticket photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: ticket photos are publicly readable
CREATE POLICY "Ticket photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ticket-photos');

-- RLS: users can update their own ticket photos
CREATE POLICY "Users can update their own ticket photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ticket-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add ticket_image_url column to theater_visits
ALTER TABLE theater_visits
ADD COLUMN IF NOT EXISTS ticket_image_url TEXT;
