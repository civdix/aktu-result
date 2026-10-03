# ☁️ Cloudflare Deployment & Caching

The production site is proxied through Cloudflare to deliver sub-50ms response times globally, protect backend resources from traffic spikes during result announcements, and ensure high availability.

---

## ⚡ Edge Caching Strategy

| Content Type | Cache-Control Header | Edge Behavior |
| :--- | :--- | :--- |
| **Static Assets** (`/images/*`, `.ico`, `.webp`, `.png`) | `public, max-age=0` (Origin) | Cached at Cloudflare Edge. Revalidated or purged on deployment. |
| **College Pages** (`/college/*`) | `public, max-age=86400, s-maxage=604800` | Cached at Cloudflare edge for 7 days. |
| **Colleges Sitemap** (`/sitemap-colleges.xml`) | `public, max-age=86400, s-maxage=604800` | Cached at Edge for 7 days to preserve crawl budget. |
| **Core Sitemap** (`/sitemap.xml`) | `public, max-age=3600, s-maxage=7200` | Cached for 2 hours at edge. |
| **News Sitemap** (`/sitemap-news.xml`) | `public, max-age=600, s-maxage=1200` | 20-minute edge cache for rapid indexation of fresh circulars. |
| **API Search & DOB** (`/api/search`, `/api/dob`) | `no-store, no-cache, must-revalidate` | Always bypasses cache to fetch live university data. |

---

## 🧹 Automated Cache Purge Hook

The project includes an automatic cache invalidation script configured in `package.json`:

```json
{
  "scripts": {
    "purge": "node -r dotenv/config -e \"fetch('https://api.cloudflare.com/client/v4/zones/' + process.env.CLOUDFLARE_ZONE_ID + '/purge_cache', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ purge_everything: true }) }).then(r=>r.json()).then(d=>console.log(d.success ? '✨ Cloudflare cache purged successfully!' : d))\""
  }
}
```

### Automatic Triggering:
1. **Local / Manual**: Run `npm run purge`.
2. **Server Boot**: In `src/server.ts`, an async post-listen hook executes a cache purge the moment the new version comes online.
3. **GitHub Actions**: `.github/workflows/purge-cloudflare.yml` runs on every push to `main`.

---

## 🛡️ Cloudflare Security & 4xx Health Guidelines

1. **Bot Fight Mode**: Keep Bot Fight Mode configured appropriately or create a WAF custom rule to allow verified search engine crawlers (`(cf.client.bot) -> Skip / Allow`). Challenging Googlebot or Bingbot results in immediate de-indexing.
2. **Handling 4xx Status**:
   * Scanners probing `/wp-login.php`, `/.env`, etc., are harmless and expected (404/403).
   * Internal API routes (`/api/search`, `/api/dob`, `/api/find-roll`) are configured to return `200 OK` on GET requests to prevent artificial 405 error spikes.
   * Legacy routes (such as `/blog`) have permanent 301 redirects to `/news`.
