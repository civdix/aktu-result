import type { APIRoute } from 'astro';
import { NewsGeneratorService } from '../../../services/news-generator.service';
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

export const POST: APIRoute = async ({ request, cookies }) => {
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
    const result = await NewsGeneratorService.publishLatestNewsArticle();
    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.message,
        url: result.url || null,
        slug: result.slug || null,
        title: result.title || null
      }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || 'Error occurred while generating article.'
      }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};
