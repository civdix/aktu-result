import type { APIRoute } from 'astro';
import { redisService } from '../../../services/redis.service';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const slug = (url.searchParams.get('slug') || '').trim();
    const visitorId = (url.searchParams.get('vid') || '').trim();

    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing slug' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Default to at least 1 reader
    let count = 1;
    if (visitorId) {
      count = await redisService.recordLiveReader(slug, visitorId);
    } else {
      count = await redisService.getLiveReaders(slug);
    }

    return new Response(
      JSON.stringify({
        success: true,
        slug,
        count: Math.max(1, count)
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'CDN-Cache-Control': 'no-store',
          'Cloudflare-CDN-Cache-Control': 'no-store'
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: true, count: 1 }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      }
    );
  }
};
