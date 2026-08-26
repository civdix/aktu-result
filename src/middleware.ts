import { sequence } from 'astro:middleware';
import { paginationMiddleware } from './middleware/pagination';

export const onRequest = sequence(paginationMiddleware);
