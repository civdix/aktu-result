import { defineMiddleware } from 'astro:middleware';

/**
 * Canonical SEO Redirect Middleware
 * Automatically performs an HTTP 301 Permanent Redirect:
 * 1. From alternate hosts to the apex domain (e.g. www.akturesult.bond -> https://akturesult.bond)
 * 2. From http:// to https://
 * 3. From trailing-slash paths to slashless paths
 * to prevent duplicate content indexing and consolidate search engine rankings.
 */
export const canonicalRedirectMiddleware = defineMiddleware(async (context, next) => {
  const rawHost = context.request.headers.get('x-forwarded-host') 
    || context.request.headers.get('host') 
    || context.url.hostname;

  // Skip local development
  if (!rawHost || rawHost.includes('localhost') || rawHost.includes('127.0.0.1') || rawHost.startsWith('0.0.0.0')) {
    return next();
  }

  const hostWithoutPort = rawHost.split(',')[0].trim().split(':')[0].toLowerCase();
  const canonicalHost = 'akturesult.bond';

  // Recognize Cloudflare and standard reverse-proxy HTTPS indicators
  const cfVisitor = context.request.headers.get('cf-visitor');
  const forwardedProto = context.request.headers.get('x-forwarded-proto');
  const forwardedSsl = context.request.headers.get('x-forwarded-ssl');

  const isHttps = (cfVisitor && cfVisitor.includes('"scheme":"https"'))
    || (forwardedProto && forwardedProto.toLowerCase().includes('https'))
    || (forwardedSsl && forwardedSsl.toLowerCase() === 'on')
    || context.url.protocol === 'https:';

  const isHttp = !isHttps;

  const hasTrailingSlash = context.url.pathname.length > 1 && context.url.pathname.endsWith('/');
  if (hostWithoutPort !== canonicalHost || isHttp || hasTrailingSlash) {
    const cleanPath = hasTrailingSlash
      ? context.url.pathname.replace(/\/+$/, '')
      : context.url.pathname;
    const targetUrl = `https://${canonicalHost}${cleanPath || '/'}${context.url.search}`;
    
    // Avoid self-redirect loops
    if (hostWithoutPort !== canonicalHost || !isHttps || hasTrailingSlash) {
      return context.redirect(targetUrl, 301);
    }
  }

  return next();
});
