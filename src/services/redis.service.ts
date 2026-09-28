import Redis from 'ioredis';

class RedisService {
  private client: Redis | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        console.warn('[Redis] REDIS_URL not configured in environment, in-memory deduplication will fallback.');
        return;
      }
      const parsedUrl = new URL(redisUrl);
      const isTls = redisUrl.startsWith('rediss://') || parsedUrl.protocol === 'rediss:';

      const options: any = {
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true,
        retryStrategy(times: number) {
          return Math.min(times * 200, 3000);
        }
      };

      if (isTls || parsedUrl.hostname.includes('layerbase.dev')) {
        options.tls = {
          servername: parsedUrl.hostname
        };
      }

      this.client = new Redis(redisUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        // Log quietly so it doesn't pollute server output or crash runtime
        console.warn('[Redis] Connection warning:', err.message);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.isConnected = false;
      });
    } catch (err: any) {
      console.warn('[Redis] Failed to initialize client:', err.message);
      this.client = null;
    }
  }

  private async getActiveClient(): Promise<Redis | null> {
    if (!this.client) return null;

    if (!this.isConnected && !this.isConnecting) {
      this.isConnecting = true;
      try {
        await this.client.connect();
        this.isConnected = true;
      } catch (err: any) {
        console.warn('[Redis] Connection attempt failed:', err.message);
        this.isConnected = false;
      } finally {
        this.isConnecting = false;
      }
    }

    return this.isConnected ? this.client : null;
  }

  /**
   * Check and record unique view using Redis SET with NX and TTL (default 24 hours / 86400s)
   * Returns true if view is unique (first time recorded in window), false otherwise.
   */
  async isUniqueView(slug: string, identifier: string, ttlSeconds: number = 86400): Promise<boolean> {
    try {
      const client = await this.getActiveClient();
      if (!client) return true; // graceful fallback if Redis unavailable

      const key = `view:${slug}:${identifier}`;
      // SET key 1 EX ttl NX -> returns 'OK' if key did not exist, null if it already existed
      const result = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      console.warn('[Redis] isUniqueView check failed:', err);
      return true;
    }
  }

  /**
   * Fast in-memory counter increment for an article
   */
  async incrementArticleViews(slug: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 0;

      const key = `article:views:${slug}`;
      const views = await client.incr(key);
      return views;
    } catch (err) {
      console.warn('[Redis] incrementArticleViews failed:', err);
      return 0;
    }
  }

  /**
   * Retrieve real-time in-memory views count for an article
   */
  async getArticleViews(slug: string): Promise<number | null> {
    try {
      const client = await this.getActiveClient();
      if (!client) return null;

      const key = `article:views:${slug}`;
      const val = await client.get(key);
      return val !== null ? parseInt(val, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Initialize in-memory counter from persistent storage if not already present
   */
  async seedArticleViewsIfEmpty(slug: string, fallbackViews: number): Promise<void> {
    try {
      const client = await this.getActiveClient();
      if (!client) return;

      const key = `article:views:${slug}`;
      await client.set(key, fallbackViews.toString(), 'NX');
    } catch {
      // ignore
    }
  }
}

export const redisService = new RedisService();
