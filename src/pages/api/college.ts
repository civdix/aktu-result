import type { APIRoute } from 'astro';
import colleges from '../../data/colleges.json';
import { slugifyCollege, findCollegeBySlug } from '../../utils/slugify';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const codeOrSlug = url.searchParams.get('code') || url.searchParams.get('slug') || url.searchParams.get('q');
  
  if (!codeOrSlug) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Please specify code or slug parameter, e.g. ?code=001 or ?slug=anand-engineering-college-agra-001',
        code: 400
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const college = findCollegeBySlug(codeOrSlug, colleges);
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
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const codeOrSlug = body?.code || body?.slug || body?.collegeCode;
    if (!codeOrSlug) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing code or slug in request body', code: 400 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const college = findCollegeBySlug(codeOrSlug, colleges);
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
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};