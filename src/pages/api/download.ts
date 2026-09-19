import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/apk/AKTU-Result-v1.0.0.apk',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
};
