import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 301,
    headers: {
      'Location': '/aktu-affiliated-cse-college',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
