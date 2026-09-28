import crypto from 'crypto';

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9557030688';

export function getAdminToken(): string {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update('aktu-admin-session-v1').digest('hex');
}

export function verifyAdminPassword(providedPassword?: string | null): boolean {
  if (!providedPassword) return false;
  return providedPassword.trim() === ADMIN_PASSWORD;
}

export function verifyAdminRequest(request: Request): boolean {
  const expectedToken = getAdminToken();

  // 1. Check Authorization Bearer header
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === expectedToken) return true;
  }

  // 2. Check X-Admin-Password header
  const directPassHeader = request.headers.get('X-Admin-Password') || request.headers.get('x-admin-password');
  if (directPassHeader && verifyAdminPassword(directPassHeader)) {
    return true;
  }

  // 3. Check Cookies
  const cookieHeader = request.headers.get('cookie') || '';
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    if (cookies['aktu_admin_token'] === expectedToken) {
      return true;
    }
  }

  return false;
}
