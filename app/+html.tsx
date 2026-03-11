import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no"
        />

        <title>CineTrak - Track Your Movie Journey</title>
        <meta
          name="description"
          content="Your personal movie tracker. Log films, rate them, build your collection, and track your cinematic journey."
        />
        <meta name="theme-color" content="#09090b" />

        {/* Open Graph */}
        <meta property="og:title" content="CineTrak - Track Your Movie Journey" />
        <meta
          property="og:description"
          content="Your personal movie tracker. Log films, rate them, build your collection, and track your cinematic journey."
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CineTrak" />
        <meta property="og:url" content="https://cinetrak.app" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="CineTrak - Track Your Movie Journey" />
        <meta
          name="twitter:description"
          content="Your personal movie tracker. Log films, rate them, build your collection, and track your cinematic journey."
        />

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="CineTrak" />

        {/* Google AdSense */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5311715630678079"
          crossOrigin="anonymous"
        />

        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        <noscript>
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              padding: '40px 20px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              color: '#e4e4e7',
              backgroundColor: '#09090b',
              minHeight: '100vh',
            }}
          >
            <h1>CineTrak - Track Your Movie Journey</h1>
            <p>
              Your personal movie tracker. Discover trending films, log what
              you&apos;ve watched, rate and review movies, and track your
              cinematic journey over time.
            </p>
            <h2>Discover Movies</h2>
            <p>
              Browse trending movies, now playing in theaters, and upcoming
              releases. Explore detailed movie pages with cast information,
              trailers, ratings, and reviews from the community.
            </p>
            <h2>Track Your Watchlist</h2>
            <p>
              Build your personal movie collection. Mark films as watched, add
              them to your watchlist, and never forget a recommendation again.
              See your stats and viewing habits at a glance.
            </p>
            <h2>Movie Journeys</h2>
            <p>
              Create themed movie journeys — curated lists of films tied
              together by genre, director, era, or any theme you choose. Share
              your journeys with friends and discover new ones from the
              community.
            </p>
            <h2>Connect with Friends</h2>
            <p>
              Follow other movie lovers, see what they&apos;re watching, and
              share your reviews. CineTrak is a social platform for film
              enthusiasts who love discovering and discussing movies together.
            </p>
            <p>
              <a href="https://cinetrak.app" style={{ color: '#6d28d9' }}>
                Visit CineTrak
              </a>{' '}
              to start tracking your movie journey today. Available on iOS,
              Android, and web.
            </p>
          </div>
        </noscript>
      </body>
    </html>
  );
}
