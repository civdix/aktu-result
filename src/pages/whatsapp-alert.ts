import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': 'https://chat.whatsapp.com/LoCFMpg5yyHIkd3gcywACo',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
};
