import type { APIRoute } from 'astro';
import branches from '../../data/branches.json';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const searchParam = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim().toLowerCase();
    const codeParam = (url.searchParams.get('code') || '').trim().toLowerCase();

    let list = branches;

    if (codeParam) {
      list = list.filter(b => b.code.toLowerCase() === codeParam);
    } else if (searchParam) {
      list = list.filter(b => b.name.toLowerCase().includes(searchParam) || b.code.toLowerCase().includes(searchParam));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: list.length,
        branches: list
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
        }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve branches'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};