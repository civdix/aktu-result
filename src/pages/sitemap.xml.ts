import type { APIRoute } from 'astro';
import { ArticleService } from '../services/article.service';

export const prerender = false;

export const GET: APIRoute = async () => {
  const domain = 'https://akturesult.bond';

  // 1. Fetch dynamic news articles so they are indexed permanently
  let newsArticles: Array<{ slug: string; updatedAt: string; publishedAt: string }> = [];
  try {
    newsArticles = await ArticleService.getAllArticleSlugs();
  } catch (err) {
    console.warn('[Sitemap] Failed to fetch article slugs:', err);
  }

  // Determine latest news update date for /news hub
  const latestNewsDate = newsArticles.length > 0
    ? (newsArticles[0].updatedAt || newsArticles[0].publishedAt || '2026-09-29').split('T')[0]
    : '2026-09-29';

  // 2. Core Pages with legitimate revision dates (avoids Google lastmod spoofing penalties)
  const coreUrls = [
    { loc: `${domain}/`, priority: '1.0', changefreq: 'weekly', lastmod: '2026-09-29' },
    { loc: `${domain}/news`, priority: '0.95', changefreq: 'daily', lastmod: latestNewsDate },
    { loc: `${domain}/oneview`, priority: '0.95', changefreq: 'weekly', lastmod: '2026-09-29' },
    { loc: `${domain}/aktu-result-without-date-of-birth`, priority: '0.95', changefreq: 'weekly', lastmod: '2026-09-29' },
    { loc: `${domain}/aktu-erp-result`, priority: '0.95', changefreq: 'weekly', lastmod: '2026-09-29' },
    { loc: `${domain}/roll-number-finder`, priority: '0.90', changefreq: 'weekly', lastmod: '2026-09-29' },
    { loc: `${domain}/colleges`, priority: '0.90', changefreq: 'weekly', lastmod: '2026-09-22' },
    { loc: `${domain}/aktu-affiliated-cse-college`, priority: '0.85', changefreq: 'weekly', lastmod: '2026-09-20' },
    { loc: `${domain}/how-it-works`, priority: '0.80', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/faq`, priority: '0.80', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/api`, priority: '0.80', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/download-app`, priority: '0.80', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/about`, priority: '0.60', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/contact`, priority: '0.60', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/privacy-policy`, priority: '0.30', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/terms`, priority: '0.30', changefreq: 'monthly', lastmod: '2026-09-19' },
    { loc: `${domain}/disclaimer`, priority: '0.30', changefreq: 'monthly', lastmod: '2026-09-19' }
  ];

  const xmlUrls = coreUrls.map(
    (item) => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`
  );

  // 3. Append dynamic news articles with true lastmod
  for (const item of newsArticles) {
    const lastMod = (item.updatedAt || item.publishedAt || '2026-09-29').split('T')[0];
    xmlUrls.push(`  <url>
    <loc>${domain}/news/${item.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`);
  }

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlUrls.join('\n')}
</urlset>`.trim();

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=7200'
    }
  });
};
