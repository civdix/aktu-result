import type { APIRoute } from 'astro';
import { verifyAdminRequest } from '../../../utils/admin-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const authenticated = verifyAdminRequest(request);
  return new Response(
    JSON.stringify({ authenticated }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
