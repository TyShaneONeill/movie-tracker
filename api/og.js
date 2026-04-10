const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = async function handler(req, res) {
  const { type = 'movie', id } = req.query;

  if (!id || !/^\d+$/.test(id)) {
    res.status(400).send('Missing or invalid id');
    return;
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    res.status(500).send('Missing TMDB_API_KEY');
    return;
  }

  const tmdbType = type === 'tv' ? 'tv' : 'movie';
  const tmdbUrl = `https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${apiKey}`;

  try {
    const data = await fetchJSON(tmdbUrl);

    const title = escapeHtml(data.title || data.name || 'PocketStubs');
    const description = escapeHtml(
      data.overview
        ? data.overview.slice(0, 200) + (data.overview.length > 200 ? '\u2026' : '')
        : 'Track movies and TV shows on PocketStubs.'
    );
    const image = data.poster_path
      ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
      : 'https://pocketstubs.com/pwa-icon-512.png';
    const pageUrl = `https://pocketstubs.com/${tmdbType}/${id}`;
    const pageTitle = `${title} - PocketStubs`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${pageTitle}</title>
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="${tmdbType === 'tv' ? 'video.tv_show' : 'video.movie'}">
  <meta property="og:site_name" content="PocketStubs">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(pageUrl)}">${title} on PocketStubs</a>\u2026</p>
</body>
</html>`);
  } catch (err) {
    // TMDB fetch failed — serve fallback OG rather than erroring
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <meta property="og:title" content="PocketStubs - Track Movies &amp; TV Shows">
  <meta property="og:image" content="https://pocketstubs.com/pwa-icon-512.png">
  <meta property="og:site_name" content="PocketStubs">
  <meta http-equiv="refresh" content="0;url=https://pocketstubs.com">
</head><body></body></html>`);
  }
};
