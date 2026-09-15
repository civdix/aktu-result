import type { APIRoute } from 'astro';
import colleges from '../../data/colleges.json';
import { slugifyCollege } from '../../utils/slugify';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const searchParam = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim().toLowerCase();
    const codeParam = (url.searchParams.get('code') || '').trim().toLowerCase();

    let list = colleges.map(c => ({
      code: c.code,
      name: c.name,
      CGId: c.CGId,
      CGCode: c.CGCode,
      slug: slugifyCollege(c.name, c.code)
    }));

    if (codeParam) {
      const cleanCode = codeParam.replace(/^0+/, '');
      list = list.filter(c => c.code.toLowerCase() === codeParam || (cleanCode && c.code.replace(/^0+/, '') === cleanCode));
    } else if (searchParam) {
      list = list.filter(c => c.name.toLowerCase().includes(searchParam) || c.code.toLowerCase().includes(searchParam));
    }

    // Optional pagination
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    
    if (pageParam || limitParam) {
      const page = Math.max(1, parseInt(pageParam || '1', 10) || 1);
      const limit = Math.max(1, parseInt(limitParam || '20', 10) || 20);
      const total = list.length;
      const skip = (page - 1) * limit;
      const paginated = list.slice(skip, skip + limit);

      return new Response(
        JSON.stringify({
          success: true,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          colleges: paginated
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: list.length,
        colleges: list
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve colleges'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
