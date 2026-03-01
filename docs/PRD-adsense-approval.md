# PRD: Google AdSense Approval for CineTrak Web

## Problem Statement

CineTrak has been **rejected from Google AdSense twice** with the following policy violation:

> **"Google-served ads on screens without publisher-content"**

This means Google's crawler visited `cinetrak.app`, found the AdSense `<script>` tag in the `<head>`, but saw no meaningful content in the `<body>`. From Google's perspective, we're trying to serve ads on an empty page.

### Why This Happens

CineTrak is a React Native / Expo app exported as a **client-side SPA** (Single Page Application). The entire UI renders via JavaScript after the page loads. When a bot or crawler visits the site:

1. The server returns `index.html` -- a shell with `<head>` tags and an empty `<body>` containing only a React root `<div>`.
2. The AdSense script loads and registers the page for ads.
3. The bot does **not execute JavaScript**, so it never sees the app's actual content.
4. Result: Google sees a page with an ad script and zero content -- a clear policy violation.

This is a structural problem. No amount of meta tags, `<noscript>` blocks, or clever workarounds will fully solve it. The site needs **bot-visible, text-heavy content pages** to pass AdSense review.

### How Approved Sites Solve This

Sites like Letterboxd pass AdSense review because they use **server-side rendering (SSR)**. When a bot visits `letterboxd.com/film/the-godfather/`, it receives fully rendered HTML containing:

- Movie synopsis (hundreds of words)
- User reviews (thousands of words)
- Cast, crew, and production details
- Related lists and editorial content

CineTrak currently has **zero bot-visible content pages**. Every route serves the same empty HTML shell.

---

## Google AdSense Content Requirements

Based on Google's publisher policies and patterns from approved sites:

| Requirement | CineTrak Status |
|---|---|
| Substantial text content on pages serving ads | None (empty shell) |
| Multiple pages with unique content | None (SPA, single HTML file) |
| 800+ words per content page (recommended) | N/A |
| Content parseable without JavaScript | No (client-side only) |
| Original, valuable content | App has it, but bots can't see it |
| Clear site navigation | Only visible after JS executes |
| Privacy Policy page | Exists as markdown, not as a web page |
| About/Contact information | None |

**What Google does NOT count as "content":**
- Interactive tools and apps
- Image galleries or video embeds
- Login walls
- Placeholder or auto-generated text
- `<noscript>` fallback text (helps, but insufficient alone)

---

## Phased Approach

### Phase 0: Noscript Fallback (Completed)

**PR:** [#154](https://github.com/TyShaneONeill/movie-tracker/pull/154) -- `fix: add noscript content for AdSense compliance`

**What it does:** Adds a `<noscript>` block in `app/+html.tsx` with descriptive text about CineTrak. Bots that don't execute JS will see this content alongside the AdSense script.

**Why it's not enough:** Google's guidelines explicitly state that `<noscript>` content is a fallback signal, not a substitute for real content pages. This is a necessary foundation but will not pass review on its own.

**Status:** PR open, ready to merge.

---

### Phase 1: Static Content Pages (Immediate Priority)

**Goal:** Create bot-crawlable, text-heavy pages that exist as real HTML files in the `public/` directory. These are served as static files by Vercel, bypassing the SPA entirely.

#### 1.1 Required Pages

Create these as standalone HTML files in `public/`:

| Page | Path | Content | Min. Word Count |
|---|---|---|---|
| **About** | `/about.html` | What CineTrak is, features, mission, how it works | 1000 |
| **Privacy Policy** | `/privacy.html` | Full privacy policy (already written in `docs/PRIVACY_POLICY.md`) | Existing (~1500) |
| **Terms of Service** | `/terms.html` | Usage terms, acceptable use, disclaimers | 800 |
| **Contact** | `/contact.html` | Support info, feedback channels, social links | 500 |

#### 1.2 Page Requirements

Each static page must:

- Be a complete, standalone HTML document (not reliant on the SPA)
- Include the AdSense script in `<head>` (same client ID: `ca-pub-5311715630678079`)
- Have proper `<title>`, `<meta description>`, and Open Graph tags
- Use a consistent, simple design (header with CineTrak branding, content, footer)
- Link to other static pages and back to the main app (`/`)
- Be genuinely useful content, not filler

#### 1.3 Vercel Routing

Update `vercel.json` to serve static pages before the SPA catch-all:

```json
{
  "rewrites": [
    { "source": "/about", "destination": "/about.html" },
    { "source": "/privacy", "destination": "/privacy.html" },
    { "source": "/terms", "destination": "/terms.html" },
    { "source": "/contact", "destination": "/contact.html" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

#### 1.4 Navigation & Discoverability

- Add a footer to static pages linking to: About, Privacy, Terms, Contact
- Add `<link rel="canonical" href="https://cinetrak.app/about" />` etc. to each page
- Ensure the SPA's footer/settings also links to these pages

**Acceptance Criteria:**
- [ ] All four static pages exist in `public/` and are accessible at their URLs
- [ ] Each page contains substantial, original text content (check word counts)
- [ ] Each page includes the AdSense script
- [ ] `curl https://cinetrak.app/about` returns full HTML content (no JS needed)
- [ ] Pages link to each other and to the main app
- [ ] Vercel routing serves static pages correctly without falling through to the SPA

---

### Phase 2: SEO Infrastructure

**Goal:** Help Google's crawler discover and index all content pages.

#### 2.1 robots.txt

Create `public/robots.txt`:

```
User-agent: *
Allow: /
Allow: /about
Allow: /privacy
Allow: /terms
Allow: /contact

Sitemap: https://cinetrak.app/sitemap.xml
```

#### 2.2 Sitemap

Create `public/sitemap.xml` listing all content pages:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://cinetrak.app/</loc><priority>1.0</priority></url>
  <url><loc>https://cinetrak.app/about</loc><priority>0.8</priority></url>
  <url><loc>https://cinetrak.app/privacy</loc><priority>0.5</priority></url>
  <url><loc>https://cinetrak.app/terms</loc><priority>0.5</priority></url>
  <url><loc>https://cinetrak.app/contact</loc><priority>0.5</priority></url>
</urlset>
```

#### 2.3 Structured Data

Add JSON-LD structured data to the homepage `<noscript>` block or a static landing snippet:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "CineTrak",
  "description": "Track your movie journey...",
  "url": "https://cinetrak.app",
  "applicationCategory": "Entertainment"
}
```

**Acceptance Criteria:**
- [ ] `robots.txt` is accessible at `https://cinetrak.app/robots.txt`
- [ ] `sitemap.xml` is accessible and lists all content pages
- [ ] Google Search Console can fetch and parse the sitemap (manual verification)
- [ ] Structured data validates in Google's Rich Results Test

---

### Phase 3: Content-Rich Movie Pages (Short-Term)

**Goal:** Create bot-crawlable movie content pages so the site has many unique, text-heavy pages -- the single biggest factor in AdSense approval.

#### 3.1 Pre-Rendered Movie Pages

Use Expo's static rendering or a build-time script to generate HTML pages for popular movies. Each page should contain:

- Movie title, year, runtime, rating
- Full synopsis/overview (from TMDB)
- Cast and crew list
- Genre tags
- A link to "Track this movie on CineTrak" (back to the SPA)

**Approach Options (choose one):**

| Option | Effort | Content Volume | Maintenance |
|---|---|---|---|
| **A. Build-time static generation** | Medium | Fixed set (top 200-500 movies) | Re-run build to update |
| **B. Vercel Edge/Serverless SSR** | High | Unlimited (on-demand) | Self-maintaining |
| **C. Static HTML template + TMDB API at build** | Medium | Fixed set | Cron job or manual rebuild |

**Recommended:** Option A or C. Generate static HTML for the top 200-500 popular/trending movies during the build step. This gives Google hundreds of unique, content-rich pages to crawl without requiring SSR infrastructure.

#### 3.2 Movie Page Structure

```
/movie/the-godfather-238.html     (slug + TMDB ID)
/movie/inception-27205.html
/movie/parasite-496243.html
...
```

Each page: ~500-1000 words of real content (synopsis + cast + crew + metadata).

#### 3.3 Update Sitemap

Extend `sitemap.xml` to include all pre-rendered movie pages (or generate it dynamically during build).

**Acceptance Criteria:**
- [ ] At least 100 movie pages exist as bot-crawlable HTML
- [ ] Each movie page has 500+ words of unique content
- [ ] Movie pages include proper meta tags and structured data
- [ ] Movie pages are listed in the sitemap
- [ ] `curl https://cinetrak.app/movie/inception-27205` returns full HTML content

---

### Phase 4: Editorial Content (Long-Term, if needed)

**Goal:** If Phases 1-3 are insufficient for approval, add editorial/blog content. This is what separates content-rich sites (Letterboxd, IMDb) from pure tools.

#### 4.1 Content Ideas

- "Best Movies of [Year]" lists
- "Movies Like [Popular Movie]" recommendation pages
- Genre guides ("Best Sci-Fi Movies of All Time")
- "How to Use CineTrak" tutorial/guide
- Movie news or industry highlights (curated, not auto-generated)

#### 4.2 Implementation

- Static markdown files converted to HTML at build time
- 5-10 articles would be sufficient to demonstrate "publisher content"
- Each article: 1000+ words, original writing

**Acceptance Criteria:**
- [ ] At least 5 editorial pages published
- [ ] Each page has 1000+ words of original content
- [ ] Pages are indexed and appear in Google Search results

---

## Ad Placement Strategy

Once approved, ads should be placed thoughtfully to maintain user experience:

| Location | Ad Type | Notes |
|---|---|---|
| Static content pages (about, privacy, etc.) | Display ad (banner) | One per page, below the fold |
| Movie detail pages (static) | Display ad | Between synopsis and cast section |
| Within the SPA | Not initially | Focus approval on static pages first |

**Do NOT** place ads on:
- Login/signup screens
- Empty states or loading screens
- Pages with minimal content
- Modals or overlays

---

## Implementation Priority & Timeline

| Phase | Effort | Impact on Approval | Target |
|---|---|---|---|
| Phase 0: Noscript block | Done (PR #154) | Low (necessary but insufficient) | Immediate |
| Phase 1: Static content pages | 1-2 days | Medium (establishes "publisher content") | Week 1 |
| Phase 2: SEO infrastructure | Half day | Medium (helps bots find content) | Week 1 |
| Phase 3: Movie pages | 2-3 days | High (hundreds of unique content pages) | Week 2-3 |
| Phase 4: Editorial | 3-5 days | High (if still rejected) | Only if needed |

**Recommended submission strategy:**
1. Merge PR #154 and deploy.
2. Complete Phases 1 and 2, deploy, then submit for AdSense re-review.
3. If rejected again, complete Phase 3 and resubmit.
4. Phase 4 is the nuclear option -- only pursue if the first three phases fail.

---

## Definition of Done

**AdSense approval is the only success metric.** Specifically:

1. Google AdSense application is **approved** for `cinetrak.app`.
2. At least one ad unit renders on the live site.
3. No policy violation emails from Google within 30 days of approval.

### Verification Before Each Submission

Before requesting AdSense re-review, verify:

- [ ] `curl https://cinetrak.app/about` returns 1000+ words of HTML content
- [ ] `curl https://cinetrak.app/privacy` returns the full privacy policy
- [ ] `curl https://cinetrak.app/terms` returns terms of service
- [ ] `curl https://cinetrak.app/robots.txt` is valid
- [ ] `curl https://cinetrak.app/sitemap.xml` lists all content pages
- [ ] Google's [Mobile-Friendly Test](https://search.google.com/test/mobile-friendly) can render the static pages
- [ ] Google Search Console shows pages as indexed (may take days)
- [ ] AdSense script (`ca-pub-5311715630678079`) is present on all content pages
- [ ] No pages serve ads without substantial content visible in the HTML source

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Static pages still insufficient for approval | Medium | Phase 3 adds hundreds of unique content pages |
| TMDB content flagged as non-original | Low | Add original CineTrak context, feature descriptions, and CTAs alongside TMDB data |
| Google requires SSR for the entire site | Low | Phase 3 movie pages + static pages cover the crawlable surface; the SPA is just the app |
| AdSense review takes weeks | High | Submit early, iterate; each rejection includes specific feedback |
| Vercel routing conflicts | Low | Test static pages vs. SPA catch-all routing before deploy |

---

## References

- [Google AdSense Program Policies](https://support.google.com/adsense/answer/48182)
- [Google Publisher Content Policy](https://support.google.com/publisherpolicies/answer/11112688)
- [PR #154 -- noscript content](https://github.com/TyShaneONeill/movie-tracker/pull/154)
- [WEB-LAUNCH.md](./WEB-LAUNCH.md) -- web deployment plan
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) -- existing privacy policy content
- CineTrak domain: `https://cinetrak.app`
- AdSense publisher ID: `ca-pub-5311715630678079`
