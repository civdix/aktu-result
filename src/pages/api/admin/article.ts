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

function isRequestAuthorized(request: Request, cookies: any): boolean {
  if (verifyAdminRequest(request)) return true;
  const cookieToken = cookies.get('aktu_admin_token')?.value;
  return Boolean(cookieToken && cookieToken === getAdminToken());
}

/**
 * GET /api/admin/article?slug=...
 * Retrieves the full raw article data for editing (including full Markdown content)
 */
export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!isRequestAuthorized(request, cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Admin authentication required.' }),
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  const slug = (url.searchParams.get('slug') || '').trim();
  if (!slug) {
    return new Response(
      JSON.stringify({ success: false, message: 'Article slug is required.' }),
      { status: 400, headers: ANTI_CACHE_HEADERS }
    );
  }

  try {
    const article = await ArticleService.getArticleBySlug(slug, false);
    if (!article) {
      return new Response(
        JSON.stringify({ success: false, message: `Article with slug "${slug}" not found.` }),
        { status: 404, headers: ANTI_CACHE_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ success: true, article }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Failed to fetch article.' }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};

/**
 * POST /api/admin/article
 * Updates an article's title, excerpt, content, category, tags, and status,
 * setting lastModified (updatedAt) to current ISO timestamp.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isRequestAuthorized(request, cookies)) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized: Admin authentication required.' }),
      { status: 401, headers: ANTI_CACHE_HEADERS }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const slug = (body.slug || '').trim();

    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, message: 'Article slug is required for updating.' }),
        { status: 400, headers: ANTI_CACHE_HEADERS }
      );
    }

    let tags: string[] | undefined = undefined;
    if (Array.isArray(body.tags)) {
      tags = body.tags.map((t: any) => String(t).trim()).filter(Boolean);
    } else if (typeof body.tags === 'string') {
      tags = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    const updated = await ArticleService.updateArticle(slug, {
      title: typeof body.title === 'string' ? body.title : undefined,
      excerpt: typeof body.excerpt === 'string' ? body.excerpt : undefined,
      content: typeof body.content === 'string' ? body.content : undefined,
      category: typeof body.category === 'string' ? body.category : undefined,
      tags,
      status: body.status === 'draft' ? 'draft' : (body.status === 'published' ? 'published' : undefined),
      author: typeof body.author === 'string' ? body.author : undefined
    });

    if (!updated) {
      return new Response(
        JSON.stringify({ success: false, message: `Article "${slug}" does not exist.` }),
        { status: 404, headers: ANTI_CACHE_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Article "${updated.title}" successfully updated!`,
        article: updated
      }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Failed to update article.' }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};
