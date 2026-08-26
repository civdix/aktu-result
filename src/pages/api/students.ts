import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Retrieve pagination values populated by the pagination middleware
    const { page, limit, skip } = locals.pagination || { page: 1, limit: 10, skip: 0 };
    
    // Fetch paginated student records and total count from database
    const { students, total } = await DatabaseService.getStudentsPaginated(skip, limit);
    
    return new Response(
      JSON.stringify({
        success: true,
        data: students,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to retrieve students from database'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
