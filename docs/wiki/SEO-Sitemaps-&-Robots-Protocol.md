# 🌐 SEO, Sitemaps & Robots Protocol

Search Engine Optimization is critical for `akturesult.bond` to maintain top rankings for high-intent student queries such as *"AKTU result without date of birth"*, *"oneview aktu"*, and *"AKTU roll number finder"*.

---

## 🤖 `robots.txt` Architecture (RFC 9309 Compliant)

The Robots Exclusion Protocol ([RFC 9309](https://datatracker.ietf.org/doc/html/rfc9309)) strictly defines valid directives: `User-agent`, `Allow`, `Disallow`, and `Sitemap`.

### Why Non-Standard Directives Fail
Custom directives like `Content-Signal:` or `Agentmap:` cause Google Search Console's parser to throw **"Syntax not understood"** errors, creating crawler uncertainty and potentially throttling indexation.

### Production `public/robots.txt`:
```text
User-agent: *
Allow: /

User-agent: Googlebot-Image
Allow: /

# Disallow AI scrapers from training on site content (RFC 9309 compliant)
User-agent: GPTBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Bytespider
Disallow: /

# Agent & AI Content Directives (Informational metadata)
# Content-Signal: ai-train=no, search=yes, ai-input=no
# Agentmap: https://akturesult.bond/.well-known/ai-catalog.json

# XML Sitemaps
Sitemap: https://akturesult.bond/sitemap.xml
Sitemap: https://akturesult.bond/sitemap-colleges.xml
Sitemap: https://akturesult.bond/sitemap-news.xml
```

> [!NOTE]
> `Google-Extended` tells Google not to use your content for Gemini/Vertex training, while keeping `Googlebot` fully permitted to crawl and rank pages in Google Search.

---

## 🗺️ Multi-Sitemap Architecture

The portal divides URL indexation across three distinct sitemaps to optimize search engine crawl budgets:

| Sitemap | URL | Purpose & Update Frequency |
| :--- | :--- | :--- |
| **Core Sitemap** | `/sitemap.xml` | Core static tools (`/`, `/oneview`, `/aktu-result-without-date-of-birth`, etc.) and permanent index of all published news articles. |
| **Colleges Sitemap** | `/sitemap-colleges.xml` | Programmatic sitemap indexing dedicated pages for **865+ colleges** (`/college/[slug]`). |
| **Google News Sitemap** | `/sitemap-news.xml` | Dedicated Google News format containing `<news:news>` tags strictly for articles published within the last **48 hours**. |

### Preventing `lastmod` Spoofing
Google penalizes websites that dynamically output the current date (`today`) as `lastmod` on every request.
* **Core Pages**: Assigned stable, legitimate dates reflecting real feature releases.
* **News Hub (`/news`)**: Dynamically pulls the timestamp of the latest published article.
* **Colleges Catalog**: Uses the catalog dataset revision date (`2026-09-22`).
* **Articles**: Uses each article's authentic `updatedAt || publishedAt` date.

---

## 🏷️ Canonical & Meta Tag Standards

In [`src/layouts/Layout.astro`](file:///D:/New%20folder%20%283%29/AKTU-DOB-FINDER/src/layouts/Layout.astro):

```html
<!-- Normalized Canonical Tag -->
<link rel="canonical" href="https://akturesult.bond/path" />

<!-- Robots Index Directives -->
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />

<!-- Open Graph & Twitter Cards -->
<meta property="og:type" content="website" />
<meta property="og:title" content="AKTU Result Without Date of Birth..." />
<meta property="og:image" content="https://akturesult.bond/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />

<!-- Google News & Discover Microdata -->
<link rel="ai-catalog" href="/.well-known/ai-catalog.json" />
<link rel="api-catalog" href="/.well-known/api-catalog" />
```
