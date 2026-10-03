import type { APIRoute } from 'astro';
import { ArticleService } from '../services/article.service';

export const prerender = false;

function escapeXml(unsafe: string): string {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const articles = await ArticleService.getAllArticleSlugs();
  const domain = 'https://akturesult.bond';
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Filter for articles published within the last 48 hours per Google News standards
  let newsEligibleArticles = articles.filter(item => {
    const pubDate = new Date(item.publishedAt || item.updatedAt || 0);
    return pubDate >= fortyEightHoursAgo;
  });

  // If no articles published in the last 48h, provide the top 5 most recent articles
  if (newsEligibleArticles.length === 0 && articles.length > 0) {
    newsEligibleArticles = articles.slice(0, 5);
  }

  // Google News sitemaps must strictly contain ONLY article URLs with <news:news> blocks
  const xmlUrls = newsEligibleArticles.map(item => {
    const pubDate = new Date(item.publishedAt || item.updatedAt || now);
    const pubIso = pubDate.toISOString();
    const lastMod = (item.updatedAt || item.publishedAt || now.toISOString()).split('T')[0];
    const safeTitle = escapeXml(item.title);

    return `  <url>
    <loc>${domain}/news/${item.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>AKTU Student News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubIso}</news:publication_date>
      <news:title>${safeTitle}</news:title>
    </news:news>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`;
  });

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${xmlUrls.join('\n')}
</urlset>`.trim();

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=1200'
    }
  });
};
