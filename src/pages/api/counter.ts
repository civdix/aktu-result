import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const count = await DatabaseService.getFetchCounter();
    return new Response(
      JSON.stringify({
        success: true,
        count
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      }
    );
  } catch (error: any) {
    console.error("Failed to retrieve counter:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to retrieve counter",
        code: 500
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
