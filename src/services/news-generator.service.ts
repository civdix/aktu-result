import { YoutubeTranscript } from 'youtube-transcript';
import { ArticleService } from './article.service';
import type { Article, ArticleFaq } from '../interfaces/article.interface';

interface CandidateVideo {
  videoId: string;
  title: string;
  channel: string;
  published: string;
  channelId?: string;
}

export class NewsGeneratorService {
  /**
   * Search YouTube for recent AKTU news and circular videos
   */
  static async searchRecentAktuVideos(): Promise<CandidateVideo[]> {
    const searchQueries = [
      'aktu news today',
      'aktu latest circular 2026',
      'aktu result update today',
      'aktu even semester marksheet'
    ];

    const candidates: CandidateVideo[] = [];
    const seenIds = new Set<string>();

    for (const query of searchQueries) {
      try {
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
          }
        });

        const html = await res.text();
        const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
        if (!match) continue;

        const data = JSON.parse(match[1]);
        const contents =
          data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        for (const item of contents) {
          const vr = item.videoRenderer;
          if (vr && vr.videoId && !seenIds.has(vr.videoId)) {
            seenIds.add(vr.videoId);
            const title = vr.title?.runs?.[0]?.text || '';
            const channel = vr.ownerText?.runs?.[0]?.text || '';
            const published = vr.publishedTimeText?.simpleText || '';

            // Focus on educational / AKTU news channels
            if (
              title.toLowerCase().includes('aktu') ||
              title.toLowerCase().includes('btech') ||
              title.toLowerCase().includes('one view') ||
              title.toLowerCase().includes('circular')
            ) {
              candidates.push({
                videoId: vr.videoId,
                title,
                channel,
                published,
                channelId: vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId
              });
            }
          }
        }
      } catch (err) {
        console.warn(`YouTube search error for "${query}":`, err);
      }
    }

    return candidates;
  }

  /**
   * Fetch full transcript and metadata for a YouTube video
   */
  static async getVideoDetailsAndTranscript(videoId: string): Promise<{
    title: string;
    author: string;
    description: string;
    keywords: string[];
    transcript: string;
  }> {
    let title = '';
    let author = 'AKTU News Desk';
    let description = '';
    let keywords: string[] = [];

    // 1. Fetch metadata from watch page
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'hi,en;q=0.9'
        }
      });
      const html = await res.text();
      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
      if (playerMatch) {
        const player = JSON.parse(playerMatch[1]);
        if (player.videoDetails) {
          title = player.videoDetails.title || '';
          author = player.videoDetails.author || 'AKTU Updates';
          description = player.videoDetails.shortDescription || '';
          keywords = player.videoDetails.keywords || [];
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch watch page for ${videoId}:`, err);
    }

    // 2. Extract transcript using youtube-transcript
    let transcript = '';
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      if (items && items.length > 0) {
        transcript = items.map(i => i.text).join(' ');
      }
    } catch (tErr: any) {
      console.log(`Transcript not directly available for ${videoId} (${tErr.message}), falling back to video metadata.`);
    }

    return { title, author, description, keywords, transcript };
  }

  /**
   * Convert YouTube title to a clean, SEO-optimized kebab slug
   */
  static slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
      .replace(/-$/, '');
  }

  /**
   * Generate an in-depth, structured article using Gemini AI if key is set,
   * or using intelligent NLP synthesis if not.
   */
  static async synthesizeArticle(video: {
    videoId: string;
    title: string;
    channel: string;
    description: string;
    transcript: string;
    keywords: string[];
  }): Promise<{
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    tags: string[];
    category: string;
    readingTime: number;
    faqs: ArticleFaq[];
  }> {
    const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const aiArticle = await this.generateWithGemini(video, geminiKey);
        if (aiArticle) return aiArticle;
      } catch (err) {
        console.warn('Gemini generation failed, falling back to built-in synthesis:', err);
      }
    }

    // Built-in intelligent NLP Synthesizer
    return this.generateWithBuiltInNLP(video);
  }

  /**
   * Generate high-quality article via Google Gemini API
   */
  private static async generateWithGemini(video: any, apiKey: string): Promise<any> {
    const prompt = `You are a Senior Academic Journalist and Lead SEO Content Strategist for "AKTU Result Without DOB" (akturesult.bond).
Transform this YouTube video news update regarding Dr. A.P.J. Abdul Kalam Technical University (AKTU) into a comprehensive, highly authoritative, 800-1100 word news article for college students.

VIDEO CONTEXT:
- Title: ${video.title}
- Channel: ${video.channel}
- Keywords: ${video.keywords.join(', ')}
- Description: ${video.description.slice(0, 1000)}
- Spoken Transcript Snippet: ${video.transcript ? video.transcript.slice(0, 4000) : 'N/A'}

GUIDELINES:
1. Target Audience: AKTU B.Tech, B.Pharma, MBA, MCA, and Diploma students in Uttar Pradesh colleges.
2. Tone: Helpful, factual, urgent, informative, and professional.
3. Content Architecture:
   - Engaging, click-worthy H1 title with high search volume keywords (year 2026).
   - Short meta excerpt (140-160 characters).
   - Category: Choose from "Circulars & Updates", "Results & Marksheets", "Exam Schedule", "Student Services".
   - 4-7 relevant tags (e.g., ["AKTU Result", "OneView", "Circular 2026", "COP Exam"]).
   - In-depth Markdown body including:
     * Executive Summary / Key Takeaways box.
     * What the latest circular/announcement details.
     * Impact on B.Tech / B.Pharma / PG student batches.
     * Step-by-step instructions for students.
     * Crucial integration: Mention that students who need to verify their semester grades or find their registered Date of Birth can use the free online tool at [AKTU Result Without DOB](https://akturesult.bond) or the [AKTU OneView Portal](https://akturesult.bond/oneview).
     * Clear table of tentative dates or subject marks criteria if applicable.
     * 3 to 4 Frequently Asked Questions (FAQs) for Google Rich Snippets.

Return your response strictly as valid, raw JSON (no surrounding markdown codeblocks like \`\`\`json) matching this schema:
{
  "title": "string",
  "slug": "kebab-case-slug-6-to-9-words",
  "excerpt": "string (150 chars)",
  "category": "Circulars & Updates",
  "tags": ["tag1", "tag2", "tag3"],
  "readingTime": 4,
  "faqs": [
    {"question": "string", "answer": "string"}
  ],
  "content": "Full markdown content with ## headings, bolding, lists, and links."
}`;

    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 3500
        }
      })
    });

    let json;
    if (res.ok) {
      json = await res.json();
    } else {
      console.warn(`gemini-2.5-flash returned status ${res.status}, falling back to gemini-3.8-flash...`);
      const fallbackRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 3500
          }
        })
      });

      if (!fallbackRes.ok) {
        throw new Error(`Gemini API failed (2.5: ${res.status}, 3.8: ${fallbackRes.status})`);
      }
      json = await fallbackRes.json();
    }

    let text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    return JSON.parse(text);
  }

  /**
   * Built-in NLP article builder that structures transcripts and circular metadata
   */
  private static generateWithBuiltInNLP(video: any): any {
    const rawTitle = video.title.replace(/[|#@_]/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTitle = rawTitle.length > 70 ? rawTitle.slice(0, 68) + '...' : rawTitle;
    const finalTitle = cleanTitle.toLowerCase().includes('aktu') ? cleanTitle : `AKTU Update: ${cleanTitle}`;
    const slug = `${this.slugify(finalTitle)}-${video.videoId.slice(0, 6)}`;

    // Determine category
    let category = 'Circulars & Updates';
    const lower = (video.title + ' ' + video.description).toLowerCase();
    if (lower.includes('result') || lower.includes('oneview') || lower.includes('marksheet')) {
      category = 'Results & Marksheets';
    } else if (lower.includes('exam') || lower.includes('date') || lower.includes('cop') || lower.includes('schedule')) {
      category = 'Exam Schedule';
    } else if (lower.includes('degree') || lower.includes('certificate') || lower.includes('scholarship')) {
      category = 'Student Services';
    }

    // Extract tags
    const tags = ['AKTU News 2026', 'AKTU Circular', category];
    if (lower.includes('btech')) tags.push('AKTU B.Tech');
    if (lower.includes('bpharma')) tags.push('AKTU B.Pharma');
    if (lower.includes('marksheet')) tags.push('OneView Marksheet');
    if (lower.includes('degree')) tags.push('Original Degree');
    if (lower.includes('exam')) tags.push('Carry Over Exam');

    // Synthesize content sections
    const cleanTranscript = video.transcript
      ? video.transcript
          .replace(/फ्रेंड्स स्वागत है आपका हमारे YouTube चैनल.*?\।/g, '')
          .replace(/लाइक और सब्सक्राइब.*?करें/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';

    const content = `
## Executive Summary & Key Highlights

Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow, has issued crucial updates concerning academic schedules, examination guidelines, and official credential distributions for affiliated institutions across Uttar Pradesh.

Here is a summary of the key directives announced in this update:
* **Primary Subject:** ${finalTitle}
* **Target Audience:** All enrolled regular and carry-over students (B.Tech, B.Pharma, MCA, MBA, and affiliated technical courses).
* **Source Attribution:** Reported and verified via education desks and university notices ([Watch Video Breakdown](https://www.youtube.com/watch?v=${video.videoId})).
* **Official Verification Gateway:** Students are advised to verify their marks, SGPA cards, and profile data through the official [AKTU OneView Portal](https://akturesult.bond/oneview).

---

## What the University Notice & Video Report Details

${video.description ? video.description.slice(0, 450).trim() : 'The university administration has issued a formal notification detailing upcoming procedures, timelines, and mandatory instructions for student record management.'}

${cleanTranscript ? `### Spoken Updates from University Observers\n\n> "${cleanTranscript.slice(0, 600)}..."\n\nAccording to the analysis of this update, students are requested to review their academic ledger promptly to prevent discrepancies before final university deadlines.` : ''}

---

## Step-by-Step Instructions for AKTU Students

To ensure that your university records remain in good standing and to verify your latest marksheet status:

1. **Verify Your University Roll Number:** Ensure you have your 10 to 14-digit AKTU Roll Number ready. If you cannot locate it, use our free [AKTU Roll Number Finder](https://akturesult.bond/roll-number-finder).
2. **Inspect Semester Marksheet Online:** Navigate to [AKTU Result Without Date of Birth](https://akturesult.bond) to query your live semester scorecard without needing to input your registered birth date.
3. **Verify Discrepancies Early:** In case of incomplete practical marks (INC), carry-over papers (PCP), or grace allocations, consult your college examination cell immediately before the portal deadline expires.
4. **Download & Archive Official PDF:** Keep a printed copy of your computer-generated OneView grade ledger for placement applications and scholarship submissions.

---

## Important Student Resources & Direct Links

| Service | Direct Link | Purpose |
| :--- | :--- | :--- |
| **Instant Result Lookup** | [Check AKTU Result](https://akturesult.bond) | Instant OneView scorecard without requiring DOB |
| **AKTU OneView Portal** | [AKTU OneView](https://akturesult.bond/oneview) | Direct university marksheet mirror & CAPTCHA gateway |
| **ERP Student Login** | [AKTU ERP Result](https://akturesult.bond/aktu-erp-result) | Student dashboard & circular instructions |
| **Affiliated Colleges Directory** | [AKTU Colleges](https://akturesult.bond/colleges) | College code, institute roster & branch verification |

---

## Frequently Asked Questions (FAQs)

### How can I check my AKTU result if I forgot my registered Date of Birth?
You can use our direct search tool at [AKTU Result Without Date of Birth](https://akturesult.bond) to pull your live semester scorecard using only your University Roll Number.

### Where can I verify official circulars released by the university?
Official circulars are published under the "Circulars" section on the university website (\`aktu.ac.in\`) and within your individual ERP student dashboard (\`erp.aktu.ac.in\`).

### What should I do if my marksheet shows PCP or INC status?
PCP (*Promoted with Carry Over Paper*) means you have a backlog in one or more subjects and must appear for the Carry Over Paper (COP). INC indicates that internal or practical marks are yet to be submitted by your college.
`;

    const excerpt = `Latest AKTU update on ${finalTitle}. Check circular details, examination guidelines, and access your OneView marksheet without DOB online.`.slice(0, 160);

    const faqs: ArticleFaq[] = [
      {
        question: `What are the key points in this AKTU notice?`,
        answer: `The update highlights important examination guidelines, marksheet verification schedules, and student instructions for current semester batches.`
      },
      {
        question: `How can I check my marksheet if I don't remember my Date of Birth?`,
        answer: `You can check your full OneView semester marksheet without requiring your Date of Birth by entering your University Roll Number at https://akturesult.bond.`
      },
      {
        question: `Is this update applicable to all AKTU affiliated colleges?`,
        answer: `Yes, official directives issued by Dr. A.P.J. Abdul Kalam Technical University apply to all affiliated engineering, pharmacy, and management institutions in Uttar Pradesh.`
      }
    ];

    return {
      title: finalTitle,
      slug,
      excerpt,
      content,
      tags,
      category,
      readingTime: Math.max(3, Math.ceil(content.split(/\s+/).length / 200)),
      faqs
    };
  }

  /**
   * Ping IndexNow API to notify Bing, Yandex and other search engines of the new article
   */
  static async pingIndexNow(articleUrl: string): Promise<boolean> {
    try {
      const payload = {
        host: 'akturesult.bond',
        key: 'c79f2e4b8a1d0f5e3b6a9c2d1e4f0a8b',
        keyLocation: 'https://akturesult.bond/c79f2e4b8a1d0f5e3b6a9c2d1e4f0a8b.txt',
        urlList: [articleUrl, 'https://akturesult.bond/sitemap-news.xml']
      };

      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload)
      });

      console.log(`[IndexNow] Pinged ${articleUrl}, status: ${res.status}`);
      return res.ok || res.status === 202;
    } catch (err) {
      console.warn('[IndexNow] Ping failed:', err);
      return false;
    }
  }

  /**
   * Main Pipeline Runner: Searches latest AKTU news, extracts transcript,
   * generates article, saves it, and pings search engines.
   */
  static async publishLatestNewsArticle(): Promise<{
    success: boolean;
    message: string;
    article?: Article;
    candidateCount?: number;
    indexNowPinged?: boolean;
  }> {
    // 1. Fetch recent candidate videos
    const candidates = await this.searchRecentAktuVideos();
    console.log(`[NewsPipeline] Found ${candidates.length} candidate videos from YouTube.`);

    if (candidates.length === 0) {
      return {
        success: false,
        message: 'No recent AKTU videos found in search feed.',
        candidateCount: 0
      };
    }

    // 2. Find the first video that hasn't been published yet
    let targetVideo: CandidateVideo | null = null;
    for (const c of candidates) {
      const alreadyProcessed = await ArticleService.hasVideoBeenProcessed(c.videoId);
      if (!alreadyProcessed) {
        targetVideo = c;
        break;
      }
    }

    if (!targetVideo) {
      return {
        success: true,
        message: 'All recent videos have already been published as articles. No new article required at this time.',
        candidateCount: candidates.length
      };
    }

    console.log(`[NewsPipeline] Selected video for article generation: "${targetVideo.title}" (${targetVideo.videoId})`);

    // 3. Extract details and transcript
    const details = await this.getVideoDetailsAndTranscript(targetVideo.videoId);

    // 4. Synthesize SEO article
    const synthesized = await this.synthesizeArticle({
      videoId: targetVideo.videoId,
      title: details.title || targetVideo.title,
      channel: details.author || targetVideo.channel,
      description: details.description,
      transcript: details.transcript,
      keywords: details.keywords
    });

    const now = new Date().toISOString();

    const newArticle: Article = {
      slug: synthesized.slug,
      title: synthesized.title,
      excerpt: synthesized.excerpt,
      content: synthesized.content,
      tags: synthesized.tags,
      category: synthesized.category,
      sourceVideoId: targetVideo.videoId,
      sourceVideoTitle: targetVideo.title,
      sourceChannel: targetVideo.channel,
      sourceUrl: `https://www.youtube.com/watch?v=${targetVideo.videoId}`,
      author: 'AKTU Student News Desk',
      publishedAt: now,
      updatedAt: now,
      readingTime: synthesized.readingTime,
      views: 1,
      faqs: synthesized.faqs,
      status: 'published'
    };

    // 5. Persist article to DB & local backup
    await ArticleService.saveArticle(newArticle);
    console.log(`[NewsPipeline] Successfully published article: /news/${newArticle.slug}`);

    // 6. Ping search engines for instant indexing
    const articleUrl = `https://akturesult.bond/news/${newArticle.slug}`;
    const pingOk = await this.pingIndexNow(articleUrl);

    return {
      success: true,
      message: `New article generated and published successfully: "${newArticle.title}"`,
      article: newArticle,
      candidateCount: candidates.length,
      indexNowPinged: pingOk
    };
  }
}
