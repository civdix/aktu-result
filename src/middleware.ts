import { sequence } from 'astro:middleware';
import { canonicalRedirectMiddleware } from './middleware/canonical';
import { paginationMiddleware } from './middleware/pagination';

export const onRequest = sequence(canonicalRedirectMiddleware, paginationMiddleware);

