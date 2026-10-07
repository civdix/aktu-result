import type { APIRoute } from 'astro';
import { PushNotificationService } from '../../../services/push-notification.service';

export const prerender = false;

export const GET: APIRoute = async () => {
  const publicKey = PushNotificationService.getPublicKey();
  return new Response(
    JSON.stringify({
      success: true,
      publicKey
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    }
  );
};
