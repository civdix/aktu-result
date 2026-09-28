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

    // Optionally trigger Cloudflare purge for the deleted page
    try {
      const zoneId = process.env.CLOUDFLARE_ZONE_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (zoneId && apiToken) {
        fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
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

    return new Response(
      JSON.stringify({
        success: true,
        message: deleted ? `Article "${slug}" was deleted successfully.` : `Article "${slug}" removed from index.`,
        slug
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        message: err?.message || 'Failed to delete article.'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
