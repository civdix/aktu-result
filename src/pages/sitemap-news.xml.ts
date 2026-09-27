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
  const today = now.toISOString().split('T')[0];
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const xmlUrls = [
    `  <url>
    <loc>${domain}/news</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.95</priority>
  </url>`
  ];

  for (const item of articles) {
    const pubDate = new Date(item.publishedAt || item.updatedAt || now);
    const pubIso = pubDate.toISOString();
    const lastMod = (item.updatedAt || item.publishedAt || today).split('T')[0];
    const safeTitle = escapeXml(item.title);

    // If published within the last 48 hours or recent, include official Google News tags
    let newsBlock = '';
    if (pubDate >= fortyEightHoursAgo || articles.length <= 10) {
      newsBlock = `
    <news:news>
      <news:publication>
        <news:name>AKTU Student News</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubIso}</news:publication_date>
      <news:title>${safeTitle}</news:title>
    </news:news>`;
    }

    xmlUrls.push(`  <url>
    <loc>${domain}/news/${item.slug}</loc>${newsBlock}
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`);
  }

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
