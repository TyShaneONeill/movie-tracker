/**
 * SignedPhoto
 *
 * Renders a journey/ticket photo, resolving the stored URL to a short-lived
 * signed URL when it points at the private `ticket-photos` bucket. Non-ticket
 * photos (journey-photos bucket, AI art, TMDB, local URIs) pass straight
 * through, so this is safe to use for ALL journey photos.
 *
 * Two renderers are supported to match existing call-site conventions:
 * - default: React Native `Image` (uses `resizeMode`)
 * - `expoImage`: `expo-image` `Image` (uses `contentFit`/`transition`)
 */

import React, { useEffect, useState } from 'react';
import { Image as RNImage, type ImageProps as RNImageProps } from 'react-native';
import { Image as ExpoImage, type ImageProps as ExpoImageProps } from 'expo-image';

import { resolveJourneyPhotoUrl } from '@/lib/ticket-photo-url';

type SignedPhotoProps =
  | ({ uri: string; expoImage?: false } & Omit<RNImageProps, 'source'>)
  | ({ uri: string; expoImage: true } & Omit<ExpoImageProps, 'source'>);

export function SignedPhoto({ uri, expoImage, ...imageProps }: SignedPhotoProps) {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResolvedUri(null);

    resolveJourneyPhotoUrl(uri)
      .then((signed) => {
        if (active) setResolvedUri(signed);
      })
      .catch(() => {
        // resolveJourneyPhotoUrl never rejects, but guard anyway: fall back to raw uri.
        if (active) setResolvedUri(uri);
      });

    return () => {
      active = false;
    };
  }, [uri]);

  // Render nothing until resolved so we never flash a broken (404) public URL.
  if (!resolvedUri) return null;

  if (expoImage) {
    return <ExpoImage source={{ uri: resolvedUri }} {...(imageProps as Omit<ExpoImageProps, 'source'>)} />;
  }

  return <RNImage source={{ uri: resolvedUri }} {...(imageProps as Omit<RNImageProps, 'source'>)} />;
}
