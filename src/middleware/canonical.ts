import { defineMiddleware } from 'astro:middleware';

/**
 * Canonical SEO Redirect Middleware
 * Automatically performs an HTTP 301 Permanent Redirect from www to non-www (apex) domain
 * to prevent duplicate content indexing and consolidate search engine rankings.
 */
export const canonicalRedirectMiddleware = defineMiddleware(async (context, next) => {
  const rawHost = context.request.headers.get('x-forwarded-host') 
    || context.request.headers.get('host') 
    || context.url.hostname;

  if (rawHost && rawHost.toLowerCase().startsWith('www.')) {
    const cleanHost = rawHost.replace(/^www\./i, '');
    const proto = context.request.headers.get('x-forwarded-proto') || 'https';
    const targetUrl = `${proto}://${cleanHost}${context.url.pathname}${context.url.search}`;
    
    return context.redirect(targetUrl, 301);
  }

  return next();
});
