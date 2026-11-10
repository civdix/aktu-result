import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const domain = 'https://akturesult.bond';
  const currentDate = new Date().toISOString().split('T')[0];

  const sitemaps = [
    { loc: `${domain}/sitemap-core.xml`, lastmod: currentDate },
    { loc: `${domain}/sitemap-articles.xml`, lastmod: currentDate },
    { loc: `${domain}/sitemap-news.xml`, lastmod: currentDate },
    { loc: `${domain}/sitemap-colleges.xml`, lastmod: '2026-09-22' }
  ];

  const sitemapEntries = sitemaps
    .map(
      (s) => `  <sitemap>
    <loc>${s.loc}</loc>
    <lastmod>${s.lastmod}</lastmod>
  </sitemap>`
    )
    .join('\n');

  const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</sitemapindex>`.trim();

  return new Response(sitemapIndexXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=7200'
    }
  });
};
