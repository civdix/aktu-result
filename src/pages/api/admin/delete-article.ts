import type { APIRoute } from 'astro';
import { ArticleService } from '../../../services/article.service';
import { verifyAdminRequest, verifyAdminPassword } from '../../../utils/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const slug = (body.slug || '').trim();
    const providedPass = body.password;

    // Check authorization: Bearer token / cookie OR direct password in payload
    const isAuthorized = verifyAdminRequest(request) || (providedPass && verifyAdminPassword(providedPass));

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Unauthorized: Admin authentication required.'
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!slug) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Article slug is required for deletion.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Perform deletion from DB and local filesystem
    const deleted = await ArticleService.deleteArticle(slug);

    // Trigger Cloudflare purge for the deleted page
    try {
      const zoneId = process.env.CLOUDFLARE_ZONE_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (zoneId && apiToken) {
        await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            purge_everything: true
          })
        }).catch(() => {});
      }
    } catch {}

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
    headers.set('CDN-Cache-Control', 'no-store');
    headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return new Response(
      JSON.stringify({
        success: true,
        message: deleted ? `Article "${slug}" was deleted successfully.` : `Article "${slug}" removed from index.`,
        slug
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || 'Failed to delete article.'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    );
  }
};
