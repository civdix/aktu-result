import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const domain = 'https://akturesult.bond';
  const currentDate = new Date().toISOString().split('T')[0];

  // 1. Core Static Pages
  const coreUrls = [
    { loc: `${domain}/`, priority: '1.0', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides`, priority: '0.95', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/news`, priority: '0.95', changefreq: 'daily', lastmod: currentDate },
    { loc: `${domain}/oneview`, priority: '0.95', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/aktu-result-without-date-of-birth`, priority: '0.95', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/aktu-erp-result`, priority: '0.95', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/roll-number-finder`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/assessment-simulator`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/colleges`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/aktu-affiliated-cse-college`, priority: '0.85', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/how-it-works`, priority: '0.80', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/faq`, priority: '0.80', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/api`, priority: '0.80', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/download-app`, priority: '0.80', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/about`, priority: '0.70', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/contact`, priority: '0.70', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/disclaimer`, priority: '0.60', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/privacy-policy`, priority: '0.60', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/terms`, priority: '0.60', changefreq: 'monthly', lastmod: currentDate }
  ];

  // 2. Informative Student Guides
  const guideUrls = [
    { loc: `${domain}/guides/how-to-check-aktu-results`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/how-to-check-aktu-oneview`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-result-not-showing`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/how-to-find-old-aktu-result`, priority: '0.85', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-result-troubleshooting`, priority: '0.85', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/common-portal-errors`, priority: '0.85', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-sgpa-calculation`, priority: '0.90', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-cgpa-calculation`, priority: '0.90', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-grading-system`, priority: '0.90', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-marksheet-guide`, priority: '0.85', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-carry-over-cop-back-paper`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-revaluation-scrutiny-challenge`, priority: '0.90', changefreq: 'weekly', lastmod: currentDate },
    { loc: `${domain}/guides/verify-aktu-marksheet-records`, priority: '0.85', changefreq: 'monthly', lastmod: currentDate },
    { loc: `${domain}/guides/aktu-result-faqs`, priority: '0.85', changefreq: 'monthly', lastmod: currentDate }
  ];

  const allUrls = [...coreUrls, ...guideUrls];

  const xmlUrls = allUrls.map(
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
