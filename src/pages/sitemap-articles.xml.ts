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
  const domain = 'https://akturesult.bond';
  const currentDate = new Date().toISOString().split('T')[0];

  let newsArticles: Array<{ slug: string; updatedAt: string; publishedAt: string }> = [];
  try {
    newsArticles = await ArticleService.getAllArticleSlugs();
  } catch (err) {
    console.warn('[Sitemap Articles] Failed to fetch article slugs:', err);
  }

  const xmlUrls = newsArticles.map((item) => {
    const lastMod = (item.updatedAt || item.publishedAt || currentDate).split('T')[0];
    const safeSlug = escapeXml(item.slug);
    return `  <url>
    <loc>${domain}/news/${safeSlug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`;
  });

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlUrls.join('\n')}
</urlset>`.trim();

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=3600'
    }
  });
};
