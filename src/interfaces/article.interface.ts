export interface ArticleFaq {
  question: string;
  answer: string;
}

export interface Article {
  _id?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string; // Markdown or sanitized HTML
  tags: string[];
  category: string;
  sourceVideoId?: string;
  sourceVideoTitle?: string;
  sourceChannel?: string;
  sourceUrl?: string;
  author: string;
  publishedAt: string; // ISO 8601 string
  updatedAt: string;
  readingTime: number; // in minutes
  views?: number;
  faqs?: ArticleFaq[];
  featuredImage?: string;
  status: 'published' | 'draft';
}
