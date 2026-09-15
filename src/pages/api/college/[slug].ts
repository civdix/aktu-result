import type { APIRoute } from 'astro';
import colleges from '../../../data/colleges.json';
import { slugifyCollege, findCollegeBySlug } from '../../../utils/slugify';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return new Response(
      JSON.stringify({ success: false, error: 'Slug parameter is required', code: 400 }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const college = findCollegeBySlug(slug, colleges);
  if (!college) {
    return new Response(
      JSON.stringify({ success: false, error: 'College not found', code: 404 }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      college: {
        code: college.code,
        name: college.name,
        CGId: college.CGId,
        CGCode: college.CGCode,
        slug: slugifyCollege(college.name, college.code)
      }
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};