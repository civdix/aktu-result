import type { APIRoute } from 'astro';
import { redisService } from '../../services/redis.service';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const searches = await redisService.getRecentSearches(8);
    return new Response(
      JSON.stringify({
        success: true,
        searches: searches || []
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        searches: []
      }),
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
