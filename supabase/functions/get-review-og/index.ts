import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================================================
// Helpers
// ============================================================================

/** HTML-escape user content to prevent XSS in generated HTML. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Truncate text to a max length, adding ellipsis if needed. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

// ============================================================================
// Fallback HTML
// ============================================================================

function buildFallbackHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PocketStubs — Your Movie Companion</title>

  <!-- OpenGraph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="PocketStubs — Your Movie Companion">
  <meta property="og:description" content="Track movies, write reviews, and discover what friends are watching.">
  <meta property="og:url" content="https://pocketstubs.com">
  <meta property="og:site_name" content="PocketStubs">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="PocketStubs — Your Movie Companion">
  <meta name="twitter:description" content="Track movies, write reviews, and discover what friends are watching.">

  <!-- Redirect to app -->
  <meta http-equiv="refresh" content="0;url=https://pocketstubs.com">
</head>
<body>
  <p>Redirecting to PocketStubs...</p>
  <p><a href="https://pocketstubs.com">Click here if not redirected</a></p>
</body>
</html>`;
}

// ============================================================================
// Review OG HTML
// ============================================================================

interface ReviewOgData {
  id: string;
  title: string;
  reviewText: string;
  rating: number;
  movieTitle: string;
  posterPath: string | null;
  reviewerName: string;
}

function buildReviewHtml(data: ReviewOgData): string {
  const {
    id,
    title: reviewTitle,
    reviewText,
    movieTitle,
    posterPath,
    reviewerName,
  } = data;

  const safeReviewerName = escapeHtml(reviewerName);
  const safeMovieTitle = escapeHtml(movieTitle);
  const safeReviewTitle = escapeHtml(reviewTitle);
  const safeDescription = escapeHtml(truncate(reviewText, 200));
  const ogTitle = `${safeReviewTitle} — ${safeMovieTitle}`;
  const pageTitle = `${safeReviewerName}&#039;s review of ${safeMovieTitle} | PocketStubs`;
  const reviewUrl = `https://pocketstubs.com/review/${id}`;
  const imageUrl = posterPath
    ? `https://image.tmdb.org/t/p/w500${escapeHtml(posterPath)}`
    : '';

  const imageMetaTags = imageUrl
    ? `\n  <meta property="og:image" content="${imageUrl}">\n  <meta name="twitter:image" content="${imageUrl}">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>

  <!-- OpenGraph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${reviewUrl}">
  <meta property="og:site_name" content="PocketStubs">${imageMetaTags}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${safeDescription}">

  <!-- Redirect to app -->
  <meta http-equiv="refresh" content="0;url=${reviewUrl}">
</head>
<body>
  <p>Redirecting to PocketStubs...</p>
  <p><a href="${reviewUrl}">Click here if not redirected</a></p>
</body>
</html>`;
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    // Parse review ID from query params
    const url = new URL(req.url);
    const reviewId = url.searchParams.get('id');

    if (!reviewId) {
      return new Response(buildFallbackHtml(), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Use service role to bypass RLS
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the review
    const { data: review, error: reviewError } = await supabase
      .from('reviews')
      .select('id, title, review_text, rating, movie_title, poster_path, visibility, user_id')
      .eq('id', reviewId)
      .single();

    if (reviewError || !review || review.visibility !== 'public') {
      return new Response(buildFallbackHtml(), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Fetch reviewer profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', review.user_id)
      .single();

    const reviewerName = profile?.full_name || profile?.username || 'A PocketStubs user';

    const html = buildReviewHtml({
      id: review.id,
      title: review.title || 'Review',
      reviewText: review.review_text || '',
      rating: review.rating,
      movieTitle: review.movie_title || 'Unknown Movie',
      posterPath: review.poster_path,
      reviewerName,
    });

    return new Response(html, {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'text/html; charset=utf-8' },
    });

  } catch (error) {
    console.error('[get-review-og] Unhandled error:', error);
    return new Response(buildFallbackHtml(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
});
