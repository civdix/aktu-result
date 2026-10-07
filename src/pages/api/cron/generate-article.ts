import type { APIRoute } from 'astro';
import { NewsGeneratorService } from '../../../services/news-generator.service';

export const prerender = false;

const VALID_SECRET = process.env.CRON_SECRET || (import.meta as any).env?.CRON_SECRET || '';

function isAuthorized(request: Request, url: URL): boolean {
  if (!VALID_SECRET) return false;
  // 1. Check Bearer token in Authorization header
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === VALID_SECRET) return true;
  }

  // 2. Check query parameter ?secret=... or ?key=...
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('key');
  if (querySecret && querySecret === VALID_SECRET) {
    return true;
  }

  return false;
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorized(request, url)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: Invalid or missing cron secret. Provide ?secret=... or Authorization: Bearer header.'
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
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
        title: result.title || null,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Cron Error] Failed to generate article:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal Server Error during article generation'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request, url }) => {
  return GET({ request, url } as any);
};
