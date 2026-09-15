import type { APIRoute } from 'astro';
import colleges from '../data/colleges.json';
import { slugifyCollege } from '../utils/slugify';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const baseUrl = site ? site.toString().replace(/\/$/, '') : 'https://akturesult.bond';
  const today = new Date().toISOString().split('T')[0];

  const urls = colleges.map(c => {
    const slug = slugifyCollege(c.name, c.code);
    return `  <url>
    <loc>${baseUrl}/college/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'
    }
  });
};