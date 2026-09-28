import type { APIRoute } from 'astro';
import { verifyAdminRequest, getAdminToken } from '../../../utils/admin-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  let authenticated = verifyAdminRequest(request);

  if (!authenticated) {
    const cookieToken = cookies.get('aktu_admin_token')?.value;
    if (cookieToken && cookieToken === getAdminToken()) {
      authenticated = true;
    }
  }

  return new Response(
    JSON.stringify({ authenticated }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
        'CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  );
};
