import type { APIRoute } from 'astro';
import { ArticleService } from '../../../services/article.service';
import { verifyAdminRequest, getAdminToken } from '../../../utils/admin-auth';

export const prerender = false;

const ANTI_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export const GET: APIRoute = async ({ request, cookies, url }) => {
  let isAuthorized = verifyAdminRequest(request);

  if (!isAuthorized) {
    const cookieToken = cookies.get('aktu_admin_token')?.value;
    if (cookieToken && cookieToken === getAdminToken()) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Admin authentication required.' }),
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  try {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const skip = Math.max(parseInt(url.searchParams.get('skip') || '0', 10), 0);
    const category = url.searchParams.get('category') || undefined;
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();

    // Fetch articles
    const { articles, total } = await ArticleService.getRecentArticles(q ? 200 : limit, q ? 0 : skip, category);

    let filtered = articles;
    if (q) {
      filtered = articles.filter(art => 
        art.title.toLowerCase().includes(q) ||
        art.slug.toLowerCase().includes(q) ||
        (art.tags && art.tags.some(t => t.toLowerCase().includes(q))) ||
        (art.excerpt && art.excerpt.toLowerCase().includes(q))
      );
    }

    const paginated = q ? filtered.slice(skip, skip + limit) : filtered;

    return new Response(
      JSON.stringify({
        success: true,
        articles: paginated,
        total: q ? filtered.length : total
      }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Failed to retrieve articles' }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};
