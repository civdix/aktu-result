import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const domain = 'https://akturesult.bond';
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Core Pages (News articles are kept separately in /sitemap-news.xml)
  const coreUrls = [
    { loc: `${domain}/`, priority: '1.0', changefreq: 'daily', lastmod: today },
    { loc: `${domain}/news`, priority: '0.95', changefreq: 'daily', lastmod: today },
    { loc: `${domain}/oneview`, priority: '0.95', changefreq: 'daily', lastmod: today },
    { loc: `${domain}/aktu-result-without-date-of-birth`, priority: '0.95', changefreq: 'daily', lastmod: today },
    { loc: `${domain}/aktu-erp-result`, priority: '0.95', changefreq: 'daily', lastmod: today },
    { loc: `${domain}/roll-number-finder`, priority: '0.90', changefreq: 'weekly', lastmod: '2026-09-20' },
    { loc: `${domain}/colleges`, priority: '0.90', changefreq: 'weekly', lastmod: '2026-09-20' },
    { loc: `${domain}/aktu-affiliated-cse-college`, priority: '0.85', changefreq: 'weekly', lastmod: '2026-09-20' },
    { loc: `${domain}/how-it-works`, priority: '0.80', changefreq: 'weekly', lastmod: '2026-09-19' },
    { loc: `${domain}/faq`, priority: '0.80', changefreq: 'weekly', lastmod: '2026-09-19' },
    { loc: `${domain}/api`, priority: '0.80', changefreq: 'weekly', lastmod: '2026-09-19' },
    { loc: `${domain}/download-app`, priority: '0.80', changefreq: 'weekly', lastmod: '2026-09-19' },
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
