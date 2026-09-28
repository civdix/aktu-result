import type { APIRoute } from 'astro';
import { verifyAdminPassword, getAdminToken } from '../../../utils/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body.password || '';

    if (!verifyAdminPassword(password)) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid admin password. Access denied.'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const token = getAdminToken();

    cookies.set('aktu_admin_token', token, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin authentication successful',
        token
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message || 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
