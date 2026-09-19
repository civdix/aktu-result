import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': 'https://t.me/+B1IibFFFftc0NjNl',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
};
