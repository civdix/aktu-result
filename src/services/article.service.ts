import fs from 'fs';
import path from 'path';
import { DatabaseService } from '../database/database.service';
import type { Article } from '../interfaces/article.interface';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'articles');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Failed to ensure data/articles directory:', err);
  }
}

export class ArticleService {
  /**
   * Save article to MongoDB and sync to local JSON backup
   */
  static async saveArticle(article: Article): Promise<Article> {
    ensureDataDir();

    // 1. Write local JSON file backup
    try {
      const filePath = path.join(DATA_DIR, `${article.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(article, null, 2), 'utf-8');
    } catch (fsErr) {
      console.warn(`Failed to write local article backup for ${article.slug}:`, fsErr);
    }

    // 2. Persist to MongoDB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const collection = db.collection<Article>('articles');
        await collection.updateOne(
          { slug: article.slug },
          { $set: article },
          { upsert: true }
        );
      }
    } catch (dbErr) {
      console.warn(`MongoDB save failed for article ${article.slug}, relying on local file:`, dbErr);
    }

    return article;
  }

  /**
   * Check if a video has already been converted to an article
   */
  static async hasVideoBeenProcessed(videoId: string): Promise<boolean> {
    if (!videoId) return false;

    // Check DB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const doc = await db.collection<Article>('articles').findOne({ sourceVideoId: videoId });
        if (doc) return true;
      }
    } catch (e) {
      // Fallback to local files
    }

    // Check local files
    ensureDataDir();
    try {
      if (fs.existsSync(DATA_DIR)) {
        const files = fs.readdirSync(DATA_DIR);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed.sourceVideoId === videoId) return true;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return false;
  }

  /**
   * Retrieve article by its unique slug
   */
  static async getArticleBySlug(slug: string): Promise<Article | null> {
    // 1. Try DB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const doc = await db.collection<Article>('articles').findOne({ slug, status: 'published' });
        if (doc) return doc;
      }
    } catch (e) {
      // ignore DB failure and fallback
    }

    // 2. Fallback to local file
    ensureDataDir();
    try {
      const filePath = path.join(DATA_DIR, `${slug}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed: Article = JSON.parse(raw);
        if (parsed.status === 'published') return parsed;
      }
    } catch (e) {
      console.warn(`Failed to read local article ${slug}:`, e);
    }

    return null;
  }

  /**
   * Retrieve recent published articles with optional pagination and category filtering
   */
  static async getRecentArticles(limit: number = 10, skip: number = 0, category?: string): Promise<{ articles: Article[]; total: number }> {
    // 1. Try DB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const collection = db.collection<Article>('articles');
        const filter: any = { status: 'published' };
        if (category && category !== 'All') {
          filter.category = category;
        }

        const total = await collection.countDocuments(filter);
        const articles = await collection
          .find(filter)
          .sort({ publishedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        if (articles.length > 0 || total > 0) {
          return { articles, total };
        }
      }
    } catch (e) {
      // fallback
    }

    // 2. Fallback to local file directory
    ensureDataDir();
    try {
      if (fs.existsSync(DATA_DIR)) {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        let localArticles: Article[] = [];

        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
            const art: Article = JSON.parse(raw);
            if (art.status === 'published') {
              if (!category || category === 'All' || art.category === category) {
                localArticles.push(art);
              }
            }
          } catch (err) {
            // ignore corrupt file
          }
        }

        // Sort descending by publishedAt
        localArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

        const total = localArticles.length;
        const sliced = localArticles.slice(skip, skip + limit);
        return { articles: sliced, total };
      }
    } catch (e) {
      console.warn('Failed reading local articles directory:', e);
    }

    return { articles: [], total: 0 };
  }

  /**
   * Get all published article slugs and modification timestamps (for XML Sitemap)
   */
  static async getAllArticleSlugs(): Promise<Array<{ slug: string; updatedAt: string }>> {
    // 1. Try DB
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        const docs = await db
          .collection<Article>('articles')
          .find({ status: 'published' }, { projection: { slug: 1, updatedAt: 1, publishedAt: 1 } })
          .sort({ publishedAt: -1 })
          .toArray();

        if (docs.length > 0) {
          return docs.map(d => ({
            slug: d.slug,
            updatedAt: d.updatedAt || d.publishedAt || new Date().toISOString()
          }));
        }
      }
    } catch (e) {
      // fallback
    }

    // 2. Fallback to local directory
    ensureDataDir();
    try {
      if (fs.existsSync(DATA_DIR)) {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        const slugs: Array<{ slug: string; updatedAt: string }> = [];

        for (const file of files) {
          try {
            const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
            const art: Article = JSON.parse(raw);
            if (art.status === 'published' && art.slug) {
              slugs.push({
                slug: art.slug,
                updatedAt: art.updatedAt || art.publishedAt || new Date().toISOString()
              });
            }
          } catch (err) {
            // ignore
          }
        }
        return slugs;
      }
    } catch (e) {
      // ignore
    }

    return [];
  }

  /**
   * Increment view counter for an article
   */
  static async incrementViews(slug: string): Promise<void> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (db) {
        await db.collection('articles').updateOne(
          { slug },
          { $inc: { views: 1 } }
        );
      }
    } catch (e) {
      // ignore
    }
  }
}
