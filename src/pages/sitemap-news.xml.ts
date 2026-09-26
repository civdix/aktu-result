import type { APIRoute } from 'astro';
import { ArticleService } from '../services/article.service';

export const prerender = false;

export const GET: APIRoute = async () => {
  const articles = await ArticleService.getAllArticleSlugs();
  const domain = 'https://akturesult.bond';
  const today = new Date().toISOString().split('T')[0];

  const xmlUrls = [
    `  <url>
    <loc>${domain}/news</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.90</priority>
  </url>`
  ];

  for (const item of articles) {
    const lastMod = (item.updatedAt || today).split('T')[0];
    xmlUrls.push(`  <url>
    <loc>${domain}/news/${item.slug}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>daily</changefreq>
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
      'Cache-Control': 'public, max-age=1800, s-maxage=3600'
    }
  });
};
