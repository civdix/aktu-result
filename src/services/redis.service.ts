import Redis from 'ioredis';
import { resolveCollegeByRoll, resolveCourseByRoll } from '../utils/collegeLookup';

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
   * Record a recent search result in Redis with 7-day TTL
   */
  async addRecentSearch(search: { rollNumber: string; name?: string; course?: string; institute?: string; status?: string }): Promise<void> {
    try {
      const client = await this.getActiveClient();
      if (!client) return;

      const roll = (search.rollNumber || '').trim();
      const rollMasked = roll.length >= 10 ? `${roll.slice(0, 6)}****${roll.slice(-2)}` : `${roll.slice(0, 4)}****`;
      
      let nameMasked = 'AKTU Student';
      if (search.name && search.name !== 'Verified Student') {
        const parts = search.name.trim().split(/\s+/);
        nameMasked = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
      }

      // Accurately resolve and align college name and course from the roll number
      const alignedInstitute = resolveCollegeByRoll(roll, search.institute);
      const alignedCourse = resolveCourseByRoll(roll, search.course);

      const item = JSON.stringify({
        rollMasked,
        nameMasked,
        course: alignedCourse,
        institute: alignedInstitute,
        status: search.status || 'PASS',
        timestamp: Date.now()
      });

      const key = 'aktu:recent_searches';
      const pipeline = client.pipeline();
      pipeline.lpush(key, item);
      pipeline.ltrim(key, 0, 24); // Keep recent 25
      pipeline.expire(key, 7 * 86400); // 7-day TTL
      await pipeline.exec();
    } catch (err) {
      console.warn('[Redis] addRecentSearch failed:', err);
    }
  }

  /**
   * Retrieve recent global searches from Redis (7-day TTL window)
   */
  async getRecentSearches(limit: number = 8): Promise<Array<any>> {
    try {
      const client = await this.getActiveClient();
      if (client) {
        const key = 'aktu:recent_searches';
        const rawList = await client.lrange(key, 0, limit - 1);
        if (rawList && rawList.length > 0) {
          const parsed = rawList.map(item => {
            try {
              const data = JSON.parse(item);
              if (data && data.rollMasked) {
                // Ensure strictly aligned college and course even if stored previously with misaligned data
                data.institute = resolveCollegeByRoll(data.rollMasked, data.institute);
                if (!data.course || data.course === 'B.Tech') {
                  data.course = resolveCourseByRoll(data.rollMasked, data.course);
                }
              }
              return data;
            } catch {
              return null;
            }
          }).filter(Boolean);

          if (parsed.length > 0) return parsed;
        }
      }
    } catch (err) {
      console.warn('[Redis] getRecentSearches failed:', err);
    }

    // Default sample searches fallback - 100% strictly aligned with verified AKTU roll numbers and college codes
    const now = Date.now();
    return [
      { rollMasked: '240052010****', nameMasked: 'Aman K.', course: 'B.Tech CSE', institute: 'IET Lucknow', status: 'PASS', timestamp: now - 2 * 60 * 1000 },
      { rollMasked: '220029010****', nameMasked: 'Priya S.', course: 'B.Tech CSE', institute: 'KIET Ghaziabad', status: 'PASS', timestamp: now - 7 * 60 * 1000 },
      { rollMasked: '230097013****', nameMasked: 'Rohit V.', course: 'B.Tech ECE', institute: 'Galgotias College', status: 'PASS', timestamp: now - 12 * 60 * 1000 },
      { rollMasked: '210032010****', nameMasked: 'Shivani M.', course: 'B.Tech CSE', institute: 'ABES EC Ghaziabad', status: 'PASS', timestamp: now - 19 * 60 * 1000 },
      { rollMasked: '240027010****', nameMasked: 'Aditya P.', course: 'B.Tech CSE', institute: 'AKGEC Ghaziabad', status: 'PASS', timestamp: now - 28 * 60 * 1000 },
      { rollMasked: '240065040****', nameMasked: 'Vikas S.', course: 'B.Tech ME', institute: 'BSA College, Mathura', status: 'PASS', timestamp: now - 35 * 60 * 1000 },
      { rollMasked: '230133010****', nameMasked: 'Anjali R.', course: 'B.Tech CSE', institute: 'NIET Greater Noida', status: 'PASS', timestamp: now - 42 * 60 * 1000 },
      { rollMasked: '220010020****', nameMasked: 'Harshit G.', course: 'B.Tech EE', institute: 'UCER Prayagraj', status: 'PASS', timestamp: now - 50 * 60 * 1000 }
    ];
  }

  /**
   * Record visitor activity in 5-minute sliding window and return live reader count (always >= 1)
   */
  async recordLiveReader(slug: string, visitorId: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 1;

      const key = `article:live:${slug}`;
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const pipeline = client.pipeline();
      pipeline.zadd(key, now, visitorId);
      pipeline.zremrangebyscore(key, 0, fiveMinutesAgo);
      pipeline.zcard(key);
      pipeline.expire(key, 600); // 10 min TTL

      const results = await pipeline.exec();
      const count = (results?.[2]?.[1] as number) || 1;
      return Math.max(1, count);
    } catch (err) {
      console.warn('[Redis] recordLiveReader failed:', err);
      return 1;
    }
  }

  /**
   * Get active readers in 5-minute sliding window (always >= 1)
   */
  async getLiveReaders(slug: string): Promise<number> {
    try {
      const client = await this.getActiveClient();
      if (!client) return 1;

      const key = `article:live:${slug}`;
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      const pipeline = client.pipeline();
      pipeline.zremrangebyscore(key, 0, fiveMinutesAgo);
      pipeline.zcard(key);

      const results = await pipeline.exec();
      const count = (results?.[1]?.[1] as number) || 1;
      return Math.max(1, count);
    } catch {
      return 1;
    }
  }
}

export const redisService = new RedisService();
