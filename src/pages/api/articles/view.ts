import type { APIRoute } from 'astro';
import crypto from 'crypto';
import { redisService } from '../../../services/redis.service';
import { ArticleService } from '../../../services/article.service';

export const prerender = false;

const ANTI_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0'
};

export const POST: APIRoute = async ({ request, url }) => {
  try {
    let body: any = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else {
      const text = await request.text().catch(() => '');
      try {
        body = JSON.parse(text);
      } catch {
        body = { slug: url.searchParams.get('slug') };
      }
    }

    const slug = (body.slug || url.searchParams.get('slug') || '').trim();
    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, message: 'Article slug is required' }),
        { status: 200, headers: ANTI_CACHE_HEADERS }
      );
    }

    // Generate anonymized hash identifier for visitor
    const clientIp = request.headers.get('cf-connecting-ip') || 
                     request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                     request.headers.get('x-real-ip') || 
                     '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'generic';
    const visitorHash = crypto
      .createHash('sha256')
      .update(`${clientIp}::${userAgent.slice(0, 60)}`)
      .digest('hex')
      .slice(0, 20);

    // Redis deduplication check: 24 hours (86,400 seconds)
    const isUnique = await redisService.isUniqueView(slug, visitorHash, 86400);

    if (isUnique) {
      // Background non-blocking increment
      const views = await ArticleService.incrementViews(slug);
      return new Response(
        JSON.stringify({ success: true, counted: true, views }),
        { status: 200, headers: ANTI_CACHE_HEADERS }
      );
    }

    // Already viewed within the last 24 hours
    return new Response(
      JSON.stringify({ success: true, counted: false, reason: 'already_viewed_last_24h' }),
      { status: 200, headers: ANTI_CACHE_HEADERS }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Server error' }),
      { status: 500, headers: ANTI_CACHE_HEADERS }
    );
  }
};

export const GET: APIRoute = async (context) => {
  return POST(context);
};
