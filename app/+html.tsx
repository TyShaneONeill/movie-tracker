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
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
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
      <body>{children}</body>
    </html>
  );
}
