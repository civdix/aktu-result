import { sequence } from 'astro:middleware';
import { canonicalRedirectMiddleware } from './middleware/canonical';
import { paginationMiddleware } from './middleware/pagination';
import { cacheControlMiddleware } from './middleware/cache';

export const onRequest = sequence(canonicalRedirectMiddleware, paginationMiddleware, cacheControlMiddleware);


