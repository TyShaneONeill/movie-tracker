/**
 * generate-movie-pages.js
 *
 * Fetches popular movies from TMDB and generates static HTML pages
 * for SEO purposes. Also updates the sitemap with movie page URLs.
 *
 * Usage:
 *   TMDB_API_KEY=your_key node scripts/generate-movie-pages.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY) {
  console.error('Error: TMDB_API_KEY environment variable is required.');
  console.error('Usage: TMDB_API_KEY=your_key node scripts/generate-movie-pages.js');
  process.exit(1);
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const SITE_URL = 'https://pocketstubs.com';
const ADSENSE_ID = 'ca-pub-5311715630678079';
const RATE_LIMIT_MS = 300;
const POPULAR_PAGES = 13;
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'movie');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Promise wrapper around https.get that returns parsed JSON.
 */
function fetchJSON(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, function (res) {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }

      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON from ' + url + ': ' + e.message));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Delay for rate limiting.
 */
function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * Generate a URL-safe slug from a movie title.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format a number with commas (e.g. 35234 -> "35,234").
 */
function formatNumber(n) {
  if (n == null) return '0';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Find the best trailer from a list of TMDB video results.
 * Prefers official YouTube trailers, then any trailer, then teasers, then any YouTube video.
 */
function findBestTrailer(videos) {
  if (!videos || !videos.results || videos.results.length === 0) return null;

  var youtubeVideos = videos.results.filter(function (v) { return v.site === 'YouTube'; });

  var officialTrailer = youtubeVideos.find(function (v) {
    return v.type === 'Trailer' && v.official === true;
  });
  if (officialTrailer) return officialTrailer;

  var anyTrailer = youtubeVideos.find(function (v) { return v.type === 'Trailer'; });
  if (anyTrailer) return anyTrailer;

  var teaser = youtubeVideos.find(function (v) { return v.type === 'Teaser'; });
  if (teaser) return teaser;

  return youtubeVideos[0] || null;
}

/**
 * Get the US certification (MPAA rating) from release_dates if available.
 */
function getCertification(movie) {
  if (!movie.release_dates || !movie.release_dates.results) return '';
  var us = movie.release_dates.results.find(function (r) { return r.iso_3166_1 === 'US'; });
  if (!us || !us.release_dates) return '';
  for (var i = 0; i < us.release_dates.length; i++) {
    if (us.release_dates[i].certification) return us.release_dates[i].certification;
  }
  return '';
}

/**
 * Get today's date as YYYY-MM-DD.
 */
function todayISO() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

/**
 * Generate the full HTML string for a movie page.
 */
function generateMovieHTML(movie, credits, trailer) {
  var title = escapeHTML(movie.title || 'Unknown Title');
  var year = movie.release_date ? movie.release_date.substring(0, 4) : '';
  var slug = slugify(movie.title || 'movie');
  var canonicalURL = SITE_URL + '/movie/' + slug + '-' + movie.id;

  // Overview / description
  var genreNames = (movie.genres || []).map(function (g) { return g.name; });
  var rawOverview = movie.overview || '';
  var overview = rawOverview
    ? rawOverview
    : (movie.title || 'Unknown Title') + ' (' + year + ') \u2014 a ' + (genreNames.join(', ') || 'film') + ' film.';
  var truncatedOverview = overview.length > 160 ? overview.substring(0, 157) + '...' : overview;
  var metaDescription = escapeHTML(truncatedOverview);

  // Poster
  var posterPath = movie.poster_path
    ? IMAGE_BASE + '/w500' + movie.poster_path
    : '';

  // Runtime
  var runtime = movie.runtime || 0;
  var runtimeStr = runtime > 0 ? runtime + ' min' : '';

  // Certification
  var certification = getCertification(movie);

  // Meta line parts
  var metaParts = [year, runtimeStr, certification].filter(Boolean);
  var metaLine = metaParts.join(' &bull; ');

  // Tagline
  var tagline = movie.tagline ? escapeHTML(movie.tagline) : '';

  // Rating
  var rating = movie.vote_average ? movie.vote_average.toFixed(1) : '0.0';
  var voteCount = movie.vote_count || 0;

  // Cast (top 20)
  var cast = credits && credits.cast ? credits.cast.slice(0, 20) : [];

  // Crew - directors, writers, producers, composers, cinematographers
  var crewRoles = ['Director', 'Writer', 'Screenplay', 'Producer', 'Original Music Composer', 'Director of Photography'];
  var crewMap = new Map();
  if (credits && credits.crew) {
    for (var ci = 0; ci < credits.crew.length; ci++) {
      var member = credits.crew[ci];
      if (crewRoles.indexOf(member.job) !== -1) {
        var key = member.name + '-' + member.job;
        if (!crewMap.has(key)) {
          crewMap.set(key, { name: member.name, job: member.job });
        }
      }
    }
  }
  var crewList = Array.from(crewMap.values());

  // Directors for "About" paragraph
  var directors = crewList
    .filter(function (c) { return c.job === 'Director'; })
    .map(function (c) { return c.name; });
  var directorStr = directors.length > 0 ? directors.join(' and ') : 'an unknown director';

  // Top 5 actors for "About" paragraph
  var topActors = cast.slice(0, 5).map(function (c) { return c.name; });
  var actorStr = topActors.length > 0 ? topActors.join(', ') : 'various actors';
  var totalCast = credits && credits.cast ? credits.cast.length : 0;

  // Genre string
  var genreStr = genreNames.length > 0
    ? genreNames.join(', ').toLowerCase()
    : 'film';

  // JSON-LD structured data
  var jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    'name': movie.title || 'Unknown Title',
    'description': overview
  };

  if (posterPath) {
    jsonLd.image = posterPath;
  }
  if (movie.release_date) {
    jsonLd.datePublished = movie.release_date;
  }
  if (genreNames.length > 0) {
    jsonLd.genre = genreNames;
  }
  if (runtime > 0) {
    jsonLd.duration = 'PT' + runtime + 'M';
  }
  if (voteCount > 0 && movie.vote_average > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': rating,
      'bestRating': '10',
      'worstRating': '0',
      'ratingCount': voteCount
    };
  }
  if (directors.length > 0) {
    if (directors.length === 1) {
      jsonLd.director = { '@type': 'Person', 'name': directors[0] };
    } else {
      jsonLd.director = directors.map(function (d) {
        return { '@type': 'Person', 'name': d };
      });
    }
  }
  jsonLd.url = canonicalURL;

  var topActorsForSchema = cast.slice(0, 10);
  if (topActorsForSchema.length > 0) {
    jsonLd.actor = topActorsForSchema.map(function (a) {
      return { '@type': 'Person', 'name': a.name };
    });
  }

  // Build cast HTML
  var castHTML = '';
  for (var i = 0; i < cast.length; i++) {
    var c = cast[i];
    var actorName = escapeHTML(c.name);
    var character = escapeHTML(c.character);
    var photoHTML;
    if (c.profile_path) {
      photoHTML = '<img class="cast-photo" src="' + IMAGE_BASE + '/w185' + c.profile_path + '" alt="' + actorName + '" width="48" height="48" loading="lazy">';
    } else {
      photoHTML = '<div class="cast-photo" aria-label="' + actorName + '"></div>';
    }
    castHTML +=
      '\n            <div class="cast-member">\n' +
      '              ' + photoHTML + '\n' +
      '              <div>\n' +
      '                <div class="cast-name">' + actorName + '</div>\n' +
      '                <div class="cast-character">as ' + character + '</div>\n' +
      '              </div>\n' +
      '            </div>';
  }

  // Build crew HTML
  var crewHTML = '';
  for (var j = 0; j < crewList.length; j++) {
    var cm = crewList[j];
    crewHTML += '\n            <div class="crew-item"><strong>' + escapeHTML(cm.name) + '</strong> <span class="crew-role">&mdash; ' + escapeHTML(cm.job) + '</span></div>';
  }

  // Build genres HTML
  var genresHTML = '';
  for (var g = 0; g < (movie.genres || []).length; g++) {
    genresHTML += '\n              <span class="genre-tag">' + escapeHTML(movie.genres[g].name) + '</span>';
  }

  // Poster img tag (omit entirely if no poster)
  var posterImgTag = posterPath
    ? '<img class="movie-poster" src="' + posterPath + '" alt="' + title + ' poster" width="200" loading="lazy">'
    : '';

  // Tagline block
  var taglineBlock = tagline
    ? '\n            <p class="tagline">&ldquo;' + tagline + '&rdquo;</p>'
    : '';

  // About paragraph
  var aboutParagraph = title + ' is a ' + year + ' ' + genreStr + ' film directed by ' + escapeHTML(directorStr) + '. ';
  if (runtime > 0) {
    aboutParagraph += 'With a runtime of ' + runtime + ' minutes, the film has earned';
  } else {
    aboutParagraph += 'The film has earned';
  }
  aboutParagraph += ' an audience rating of ' + rating + ' out of 10 based on ' + formatNumber(voteCount) + ' votes on TMDB. The film stars ' + escapeHTML(actorStr) + ' among its cast of ' + totalCast + ' credited actors.';

  // OG image
  var ogImage = posterPath || '';

  // Cast section
  var castSection = '';
  if (cast.length > 0) {
    castSection =
      '\n        <h2>Cast</h2>\n' +
      '        <div class="cast-grid">' + castHTML + '\n' +
      '        </div>\n';
  }

  // Crew section
  var crewSection = '';
  if (crewList.length > 0) {
    crewSection =
      '\n        <h2>Crew</h2>\n' +
      '        <div class="crew-list">' + crewHTML + '\n' +
      '        </div>\n';
  }

  // OG image tags
  var ogImageTag = ogImage ? '\n    <meta property="og:image" content="' + ogImage + '">' : '';
  var twitterImageTag = ogImage ? '\n    <meta name="twitter:image" content="' + ogImage + '">' : '';

  var html =
'<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>' + title + ' (' + year + ') - CineTrak</title>\n' +
'    <meta name="description" content="' + metaDescription + '">\n' +
'    <link rel="canonical" href="' + canonicalURL + '">\n' +
'    <meta property="og:title" content="' + title + ' (' + year + ') - CineTrak">\n' +
'    <meta property="og:description" content="' + metaDescription + '">\n' +
'    <meta property="og:type" content="video.movie">\n' +
'    <meta property="og:url" content="' + canonicalURL + '">\n' +
'    <meta property="og:site_name" content="CineTrak">' + ogImageTag + '\n' +
'    <meta name="twitter:card" content="summary_large_image">\n' +
'    <meta name="twitter:title" content="' + title + ' (' + year + ') - CineTrak">\n' +
'    <meta name="twitter:description" content="' + metaDescription + '">' + twitterImageTag + '\n' +
'    <!-- Google AdSense -->\n' +
'    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_ID + '" crossorigin="anonymous"></script>\n' +
'    <style>\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        body {\n' +
'            font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;\n' +
'            background: #09090b;\n' +
'            color: #fafafa;\n' +
'            min-height: 100vh;\n' +
'            padding: 40px 20px;\n' +
'            line-height: 1.7;\n' +
'        }\n' +
'        .container { max-width: 700px; margin: 0 auto; }\n' +
'        h1 { font-size: 2rem; margin-bottom: 0.5rem; }\n' +
'        h2 { font-size: 1.25rem; margin: 2rem 0 1rem; color: #e11d48; }\n' +
'        p, li { color: #d4d4d8; margin-bottom: 1rem; }\n' +
'        ul { padding-left: 1.5rem; margin-bottom: 1rem; }\n' +
'        a { color: #e11d48; text-decoration: none; }\n' +
'        a:hover { text-decoration: underline; }\n' +
'        .back { display: inline-block; margin-bottom: 2rem; color: #a1a1aa; }\n' +
'        .footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; }\n' +
'        .footer-links { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 1rem; }\n' +
'        .footer-links a { color: #a1a1aa; font-size: 0.9rem; }\n' +
'        .footer-links a:hover { color: #e11d48; }\n' +
'        .footer p { color: #52525b; font-size: 0.8rem; }\n' +
'        /* Movie-specific styles */\n' +
'        .movie-hero { display: flex; gap: 24px; margin-bottom: 2rem; }\n' +
'        .movie-poster { width: 200px; border-radius: 8px; flex-shrink: 0; }\n' +
'        .movie-meta { color: #a1a1aa; margin-bottom: 0.5rem; }\n' +
'        .tagline { font-style: italic; color: #a1a1aa; margin-bottom: 1rem; }\n' +
'        .rating { display: inline-flex; align-items: center; gap: 6px; background: rgba(225,29,72,0.15); color: #e11d48; padding: 4px 12px; border-radius: 16px; font-weight: 600; margin-bottom: 1rem; }\n' +
'        .vote-count { font-weight: 400; font-size: 0.85rem; color: #a1a1aa; }\n' +
'        .genres { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 1rem; }\n' +
'        .genre-tag { background: rgba(255,255,255,0.08); color: #d4d4d8; padding: 4px 12px; border-radius: 16px; font-size: 0.85rem; }\n' +
'        .cast-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 2rem; }\n' +
'        .cast-member { display: flex; align-items: center; gap: 10px; }\n' +
'        .cast-photo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #27272a; }\n' +
'        .cast-name { font-weight: 500; color: #fafafa; }\n' +
'        .cast-character { font-size: 0.85rem; color: #a1a1aa; }\n' +
'        .crew-list { margin-bottom: 2rem; }\n' +
'        .crew-item { margin-bottom: 0.5rem; }\n' +
'        .crew-role { color: #a1a1aa; font-size: 0.9rem; }\n' +
'        .cta-section { text-align: center; margin: 3rem 0; }\n' +
'        .cta-button { display: inline-block; background: #e11d48; color: #fff; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 1rem; text-decoration: none; }\n' +
'        .cta-button:hover { background: #be123c; text-decoration: none; }\n' +
'        @media (max-width: 600px) {\n' +
'            .movie-hero { flex-direction: column; align-items: center; text-align: center; }\n' +
'            .movie-poster { width: 160px; }\n' +
'            .cast-grid { grid-template-columns: 1fr; }\n' +
'        }\n' +
'    </style>\n' +
'    <script type="application/ld+json">\n' +
'    ' + JSON.stringify(jsonLd, null, 2).replace(/\n/g, '\n    ') + '\n' +
'    </script>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="container">\n' +
'        <a href="/" class="back">&larr; Back to CineTrak</a>\n' +
'\n' +
'        <div class="movie-hero">\n' +
'            ' + posterImgTag + '\n' +
'            <div>\n' +
'                <h1>' + title + '</h1>\n' +
'                <p class="movie-meta">' + metaLine + '</p>' + taglineBlock + '\n' +
'                <div class="rating">&#9733; ' + rating + ' / 10 <span class="vote-count">(' + formatNumber(voteCount) + ' votes)</span></div>\n' +
'                <div class="genres">' + genresHTML + '\n' +
'                </div>\n' +
'            </div>\n' +
'        </div>\n' +
'\n' +
'        <h2>Synopsis</h2>\n' +
'        <p>' + escapeHTML(overview) + '</p>\n' +
'\n' +
'        <h2>About This Film</h2>\n' +
'        <p>' + aboutParagraph + '</p>\n' +
castSection +
crewSection +
'\n' +
'        <div class="cta-section">\n' +
'            <h2>Track This Movie</h2>\n' +
'            <p>Add ' + title + ' to your watchlist or log it as watched on CineTrak. Track every movie you watch, rate your favorites, and build your personal movie journey.</p>\n' +
'            <a href="/" class="cta-button">Open CineTrak</a>\n' +
'        </div>\n' +
'\n' +
'        <footer class="footer">\n' +
'            <div class="footer-links">\n' +
'                <a href="/about">About</a>\n' +
'                <a href="/privacy">Privacy</a>\n' +
'                <a href="/terms">Terms</a>\n' +
'                <a href="/support">Support</a>\n' +
'            </div>\n' +
'            <p>&copy; 2026 CineTrak. All rights reserved.</p>\n' +
'            <p style="margin-top: 0.5rem; font-size: 0.75rem; color: #3f3f46;">Movie data provided by <a href="https://www.themoviedb.org/" style="color: #52525b;">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>\n' +
'        </footer>\n' +
'    </div>\n' +
'</body>\n' +
'</html>';

  return { html: html, slug: slug + '-' + movie.id };
}

// ---------------------------------------------------------------------------
// Sitemap update
// ---------------------------------------------------------------------------

/**
 * Update the sitemap with movie page URLs, preserving existing non-movie entries.
 */
function updateSitemap(generatedPages) {
  var sitemapPath = path.join(PUBLIC_DIR, 'sitemap.xml');
  var existingContent = '';

  try {
    existingContent = fs.readFileSync(sitemapPath, 'utf-8');
  } catch (e) {
    existingContent = '';
  }

  // Extract non-movie <url> blocks from existing sitemap
  var nonMovieEntries = [];
  if (existingContent) {
    var urlBlockRegex = /<url>[\s\S]*?<\/url>/g;
    var match;
    while ((match = urlBlockRegex.exec(existingContent)) !== null) {
      var block = match[0];
      if (block.indexOf('/movie/') === -1) {
        nonMovieEntries.push(block);
      }
    }
  }

  // Generate movie <url> entries
  var today = todayISO();
  var movieEntries = generatedPages.map(function (slug) {
    return '  <url>\n' +
      '    <loc>' + SITE_URL + '/movie/' + slug + '</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>monthly</changefreq>\n' +
      '    <priority>0.7</priority>\n' +
      '  </url>';
  });

  // Re-format existing entries consistently
  var formattedNonMovie = nonMovieEntries.map(function (block) {
    var lines = block.trim().split('\n').map(function (line) {
      return '    ' + line.trim();
    });
    lines[0] = '  <url>';
    lines[lines.length - 1] = '  </url>';
    return lines.join('\n');
  });

  var sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    formattedNonMovie.join('\n') + '\n' +
    movieEntries.join('\n') + '\n' +
    '</urlset>\n';

  fs.writeFileSync(sitemapPath, sitemap, 'utf-8');
  console.log('Sitemap updated with ' + generatedPages.length + ' movie pages and ' + nonMovieEntries.length + ' existing entries.');
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main() {
  var startTime = Date.now();

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('Created output directory: ' + OUTPUT_DIR);
  }

  // Step 1: Fetch popular movie IDs across multiple pages
  console.log('Fetching ' + POPULAR_PAGES + ' pages of popular movies from TMDB...');
  var movieIds = new Set();
  var movieBasicInfo = new Map();

  for (var page = 1; page <= POPULAR_PAGES; page++) {
    console.log('Fetching popular movies page ' + page + '/' + POPULAR_PAGES + '...');
    try {
      var url = TMDB_BASE + '/movie/popular?api_key=' + TMDB_API_KEY + '&language=en-US&page=' + page;
      var data = await fetchJSON(url);
      if (data.results) {
        for (var r = 0; r < data.results.length; r++) {
          var movie = data.results[r];
          if (!movieIds.has(movie.id)) {
            movieIds.add(movie.id);
            movieBasicInfo.set(movie.id, movie.title);
          }
        }
      }
    } catch (err) {
      console.warn('Warning: Failed to fetch popular page ' + page + ': ' + err.message);
    }
    await sleep(RATE_LIMIT_MS);
  }

  console.log('Found ' + movieIds.size + ' unique popular movies.');

  // Step 2: Fetch details for each movie and generate HTML
  var generatedPages = [];
  var movieIdArray = Array.from(movieIds);
  var successCount = 0;
  var skipCount = 0;

  for (var i = 0; i < movieIdArray.length; i++) {
    var movieId = movieIdArray[i];
    var basicTitle = movieBasicInfo.get(movieId) || ('ID ' + movieId);
    console.log('[' + (i + 1) + '/' + movieIdArray.length + '] ' + basicTitle + ' (ID: ' + movieId + ')');

    try {
      var detailUrl = TMDB_BASE + '/movie/' + movieId + '?api_key=' + TMDB_API_KEY + '&language=en-US&append_to_response=credits,videos,release_dates';
      var movieData = await fetchJSON(detailUrl);

      if (!movieData || !movieData.id) {
        console.warn('  Warning: No data returned for movie ' + movieId + ', skipping.');
        skipCount++;
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      var credits = movieData.credits || { cast: [], crew: [] };
      var trailer = findBestTrailer(movieData.videos);

      var result = generateMovieHTML(movieData, credits, trailer);

      var filePath = path.join(OUTPUT_DIR, result.slug + '.html');
      fs.writeFileSync(filePath, result.html, 'utf-8');
      generatedPages.push(result.slug);
      successCount++;
    } catch (err) {
      console.warn('  Warning: Failed to process movie ' + movieId + ' (' + basicTitle + '): ' + err.message);
      skipCount++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Step 3: Update sitemap
  console.log('\nUpdating sitemap...');
  updateSitemap(generatedPages);

  // Summary
  var elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\nGenerated ' + successCount + ' movie pages in ' + elapsed + 's');
  if (skipCount > 0) {
    console.log('Skipped ' + skipCount + ' movies due to errors.');
  }
}

// Run
main().catch(function (err) {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
