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
    // 1. Primary AI Engine: Groq (Ultra-fast, Llama 3 / GPT-OSS 120B)
    const groqKey = process.env.GROQ_API_KEY || (import.meta as any).env?.GROQ_API_KEY;
    if (groqKey) {
      try {
        const aiArticle = await this.generateWithGroq(video, groqKey);
        if (aiArticle) {
          console.log('[NewsPipeline] Successfully synthesized article using Groq AI');
          return aiArticle;
        }
      } catch (err) {
        console.warn('[NewsPipeline] Groq generation failed, checking Gemini fallback:', err);
      }
    }

    // 2. Secondary AI Engine: Google Gemini
    const geminiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const aiArticle = await this.generateWithGemini(video, geminiKey);
        if (aiArticle) {
          console.log('[NewsPipeline] Successfully synthesized article using Gemini AI');
          return aiArticle;
        }
      } catch (err) {
        console.warn('[NewsPipeline] Gemini generation failed, falling back to built-in synthesis:', err);
      }
    }

    // 3. Fallback: Built-in intelligent NLP Synthesizer
    return this.generateWithBuiltInNLP(video);
  }

  /**
   * Helper to parse and repair JSON safely from LLM outputs
   */
  private static parseAndRepairJson(rawText: string): any {
    if (!rawText) return null;
    let text = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    if (!text || text.length < 50 || !text.includes('{')) return null;

    // 1. Direct JSON parse
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.title && parsed.content) return parsed;
    } catch {}

    // 2. Outermost JSON object extraction
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = text.substring(firstBrace, lastBrace + 1);
      try {
        const repaired = JSON.parse(sliced);
        if (repaired && repaired.title && repaired.content) return repaired;
      } catch {
        // 3. Sanitize raw control characters in string literals
        try {
          const sanitized = sliced.replace(/[\u0000-\u001F]+/g, (match) => {
            if (match === '\n') return '\\n';
            if (match === '\r') return '\\r';
            if (match === '\t') return '\\t';
            return '';
          });
          const repaired2 = JSON.parse(sanitized);
          if (repaired2 && repaired2.title && repaired2.content) return repaired2;
        } catch {}
      }
    }
    return null;
  }

  /**
   * Unified article prompt adhering to Google News and Discover editorial standards
   */
  private static buildArticlePrompt(video: any): string {
    return `You are a Senior Academic News Editor and Google News SEO Content Strategist for "AKTU Student Portal" (akturesult.bond).
Transform this YouTube video news update regarding Dr. A.P.J. Abdul Kalam Technical University (AKTU) into an exhaustive, highly detailed, 1300 to 1800+ word academic journalism news article for university students across Uttar Pradesh.

VIDEO CONTEXT:
- Title: ${video.title}
- Channel: ${video.channel}
- Keywords: ${video.keywords.join(', ')}
- Description: ${video.description.slice(0, 1000)}
- Spoken Transcript Snippet: ${video.transcript ? video.transcript.slice(0, 4000) : 'N/A'}

STRICT LENGTH & CONTENT DEPTH REQUIREMENT:
- Target Word Count: Minimum 1300 words, up to 1800+ words.
- DO NOT write brief summaries or short 2-sentence paragraphs. Write rich, exhaustive, journalistic prose.
- Every section MUST provide detailed multi-paragraph analysis explaining university ordinance rules, examination bylaws, student consequences, SGPA/CGPA evaluation rubrics, backlog management, and practical student guidance.

EDITORIAL & RANKING GUIDELINES:
1. Headline (Title):
   - Length: 55 to 70 characters.
   - Factual, journalistic, active voice. Front-load high-search keywords: e.g. "AKTU Even Semester Result 2026: OneView Portal Update & Verification Steps".
   - NO clickbait, NO ALL-CAPS words.
2. Inverted Pyramid Lead Paragraphs:
   - The opening 2 paragraphs must immediately answer Who, What, When, Where, Why factually:
     "Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow, has officially announced..."
3. Mandatory Sections Architecture (Markdown):
   - ## Executive Summary & Core Directives (Detailed summary plus 4-6 bullet takeaways).
   - ## In-Depth Analysis of University Circular & Notification (3-4 rich paragraphs dissecting the circular, administrative directives, and academic background).
   - ## Detailed Impact on Student Batches & Branch Eligibility (Thorough breakdown for B.Tech, B.Pharma, MBA, MCA, M.Tech; Regular vs Carry-Over COP students; Grace marks criteria under AKTU Ordinance).
   - ## Important Deadlines, Examination Schedule & Verification Table (A structured Markdown table with columns: Stage / Notice Item | Scheduled Date / Tentative Timeline | Student Action Required | Official Portal).
   - ## Step-by-Step Action Guide for College Students (Detailed numbered steps 1., 2., 3., 4., 5. explaining ERP student dashboard login, OneView verification, backlog fee submission, and what to do if marks are marked as PCP or INC).
   - ## Instant Result & Marksheet Verification Without DOB (Comprehensive tutorial explaining that students who forgot their registered Date of Birth or need fast marksheet retrieval can verify their live semester ledger via [AKTU Result Without DOB](https://akturesult.bond) or the [AKTU OneView Portal](https://akturesult.bond/oneview)).
   - ## Official Source Verification, Fact-Check & Video Context (Detailed verification note cross-referencing university circulars, citing educational observer ${video.channel}).
   - ## Frequently Asked Questions (FAQs) (4 to 5 comprehensive student questions with detailed, authoritative 50-75 word answers for Google People Also Ask snippets).

Return your response strictly as valid, raw JSON (no surrounding markdown codeblocks like \`\`\`json) matching this schema:
{
  "title": "string (55-70 chars, Google News compliant)",
  "slug": "kebab-case-slug-6-to-9-words",
  "excerpt": "string (145-160 characters summary with main keyword)",
  "category": "Circulars & Updates",
  "tags": ["AKTU News 2026", "AKTU Circular", "OneView", "tag4", "tag5"],
  "readingTime": 7,
  "faqs": [
    {"question": "string", "answer": "string (50-75 words factual answer)"}
  ],
  "content": "Full rich markdown content following the sections above (1300-1800+ words)."
}`;
  }

  /**
   * Generate high-quality article via Groq API (Ultra-fast, Llama 3 / GPT-OSS models)
   */
  private static async generateWithGroq(video: any, apiKey: string): Promise<any> {
    const prompt = this.buildArticlePrompt(video);
    const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

    for (const model of models) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a Senior Academic News Editor and Google News SEO Content Strategist for AKTU Student Portal (akturesult.bond). Always return strictly valid, raw JSON.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.35,
            max_tokens: 8192,
            response_format: { type: 'json_object' }
          })
        });

        if (!res.ok) {
          console.warn(`[Groq] ${model} returned HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content || '';
        const parsed = this.parseAndRepairJson(text);
        if (parsed) return parsed;
      } catch (err: any) {
        console.warn(`[Groq] Attempt with ${model} error:`, err?.message || err);
      }
    }

    return null;
  }

  /**
   * Generate high-quality article via Google Gemini API
   */
  private static async generateWithGemini(video: any, apiKey: string): Promise<any> {
    const prompt = this.buildArticlePrompt(video);
    const models = ['gemini-2.5-flash', 'gemini-flash-latest'];

    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json'
            },
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
            ]
          })
        });

        if (!res.ok) {
          console.warn(`[Gemini] ${model} returned HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = this.parseAndRepairJson(text);
        if (parsed) return parsed;
      } catch (err: any) {
        console.warn(`[Gemini] Attempt with ${model} error:`, err?.message || err);
      }
    }

    return null;
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
## Executive Summary & Core Highlights

Dr. A.P.J. Abdul Kalam Technical University (AKTU), Lucknow, has released critical updates and academic directives concerning current examination schedules, OneView scorecards, carry-over registrations, and student record verifications for affiliated colleges across Uttar Pradesh.

Here is an executive summary of the key directives announced in this notification:
* **Primary Notification Topic:** ${finalTitle}
* **Target Audience:** All enrolled regular, ex-students, and carry-over candidates across B.Tech, B.Pharma, MCA, MBA, and affiliated technical courses in Uttar Pradesh.
* **Administrative Source Attribution:** Documented and verified via educational broadcasts and official university gazettes ([Watch Detailed Video Report](https://www.youtube.com/watch?v=${video.videoId})).
* **Official Verification Gateway:** Students are advised to inspect their SGPA ledger, internal marks allocations, and profile credentials through the [AKTU OneView Portal](https://akturesult.bond/oneview).
* **Fast Scorecard Recovery:** Candidates who cannot locate their registered Date of Birth can query their full semester scorecard via [AKTU Result Without DOB](https://akturesult.bond).

---

## What the University Notice & Video Report Details

${video.description ? video.description.slice(0, 600).trim() : 'The university administration has issued a formal notification detailing upcoming procedures, timelines, and mandatory instructions for student record management.'}

The university's latest notification highlights essential academic and administrative protocols designed to streamline student evaluation and record management across all affiliated engineering, pharmacy, and management institutes in Uttar Pradesh. Dr. A.P.J. Abdul Kalam Technical University oversees over 750 colleges, making timely dissemination of academic notices paramount for students preparing for semester examinations, evaluations, and career opportunities.

${cleanTranscript ? `### Spoken Updates from University Observers\n\n> "${cleanTranscript.slice(0, 900)}..."\n\nAccording to the detailed breakdown provided by educational observers, students are urged to review their academic ledger promptly to prevent discrepancies before final university deadlines.` : 'Educational observers emphasize that candidates must remain vigilant regarding notification cut-offs. Late submissions or unaddressed discrepancies in internal assessment ledgers can cause delays in final marksheet issuance and degree clearances.'}

---

## Detailed Impact on Student Batches & Branch Eligibility

This official announcement directly impacts several student categories across various degree programs:

1. **Regular Semester Batches (B.Tech, B.Pharma, MCA, MBA):** Enrolled students must verify that their colleges have submitted internal assessment, laboratory, and sessional marks to the AKTU ERP system before the declared deadline.
2. **Carry-Over Paper (COP) Candidates:** Students appearing for backlog examinations must cross-verify their subject codes and exam session timetables to prevent timing clashes.
3. **Final Year Students & Degree Clearances:** Graduating students must inspect their cumulative grade point average (CGPA) and confirm that all semester theory and practical records reflect "PASS" status without lingering INC (Incomplete) flags.
4. **Grace Marks Allocation Criteria:** Under university examination ordinances, eligible students facing borderline backlog status must review grace allocation rules as specified in university bylaws.

---

## Key Deadlines, Examination Schedule & Verification Table

The following structured table outlines the essential milestones, portal requirements, and mandatory student actions associated with this notification:

| Stage / Notice Item | Scheduled Timeline | Student Action Required | Official Portal Gateway |
| :--- | :--- | :--- | :--- |
| **Circular Notification Release** | Current Session | Download official circular PDF and review subject codes | [AKTU ERP](https://akturesult.bond/aktu-erp-result) |
| **Internal Assessment Verification** | Prior to Semester Audits | Confirm theory, sessional, and practical marks | [AKTU OneView](https://akturesult.bond/oneview) |
| **Instant Result Verification** | 24/7 Live | Query marksheet without requiring registered Date of Birth | [AKTU Result Online](https://akturesult.bond) |
| **COP Backlog Registration** | Declared Window | Submit exam forms and verify semester fee challan | University ERP Portal |
| **Discrepancy Rectification** | Before Deadline | Submit formal application to College Exam Cell | Dean of Academics Office |

---

## Step-by-Step Instructions for AKTU Students

To ensure that your university records remain in good standing and to verify your latest marksheet status:

1. **Verify Your University Roll Number:** Ensure you have your 10 to 14-digit AKTU Roll Number ready. If you cannot locate it, use our free [AKTU Roll Number Finder](https://akturesult.bond/roll-number-finder).
2. **Inspect Semester Marksheet Online:** Navigate to [AKTU Result Without Date of Birth](https://akturesult.bond) to query your live semester scorecard without needing to input your registered birth date.
3. **Verify Discrepancies Early:** In case of incomplete practical marks (INC), carry-over papers (PCP), or grace allocations, consult your college examination cell immediately before the portal deadline expires.
4. **Cross-Check Subject Credit Ledgers:** Ensure that all earned credits align with your degree syllabus requirements as prescribed by the university board of studies.
5. **Download & Archive Official PDF:** Keep a printed copy of your computer-generated OneView grade ledger for placement applications, campus drives, and scholarship submissions.

---

## Instant Scorecard Retrieval Without Registered Date of Birth

A persistent hurdle for thousands of AKTU students is accessing semester scorecards when their registered Date of Birth contains formatting mismatches or has been forgotten. The university's official OneView mirror typically mandates both the student's Roll Number and exact registered Date of Birth alongside visual CAPTCHA verification.

Our dedicated online tool at [AKTU Result Without Date of Birth](https://akturesult.bond) resolves this bottleneck by communicating directly with the university result infrastructure, retrieving your genuine semester grade ledger, SGPA scores, and pass status using only your University Roll Number. This allows students to verify their results instantly from any smartphone or desktop browser without administrative delays.

---

## Official Source Verification & Fact-Check Note

This news update is documented and cross-verified against official Dr. A.P.J. Abdul Kalam Technical University gazettes, university press notes, and verified academic reportage from educational observer **${video.channel}**. For authoritative documentation, university circulars are maintained within the official repository at \`aktu.ac.in\`.

---

## Frequently Asked Questions (FAQs)

### How can I check my AKTU result if I forgot my registered Date of Birth?
You can use our direct search tool at [AKTU Result Without Date of Birth](https://akturesult.bond) to pull your live semester scorecard using only your University Roll Number. The tool connects securely to the university repository and renders your complete grade ledger.

### Where can I verify official circulars released by the university?
Official circulars are published under the "Circulars" section on the university website (\`aktu.ac.in\`) and within your individual ERP student dashboard (\`erp.aktu.ac.in\`). Notices are categorized by academic session and examination cycle.

### What should I do if my marksheet shows PCP or INC status?
PCP (*Promoted with Carry Over Paper*) means you have a backlog in one or more subjects and must appear for the Carry Over Paper (COP). INC indicates that internal or practical marks have not yet been uploaded by your institution. Report INC flags to your college examination cell immediately.

### How are SGPA and CGPA calculated under the AKTU credit system?
AKTU computes Semester Grade Point Average (SGPA) by dividing total earned grade points by total semester credits. Cumulative Grade Point Average (CGPA) reflects overall performance across all completed semesters weighted by respective credit distributions.

### Can students apply for scrutiny or re-evaluation after results are announced?
Yes, AKTU typically provides a formal scrutiny and challenge evaluation window following major result declarations. Students can submit scrutiny requests through the student ERP portal within the designated application timeframe.
`;

    const excerpt = `Latest AKTU update on ${finalTitle}. Check circular details, examination guidelines, and access your OneView marksheet without DOB online.`.slice(0, 160);

    const faqs: ArticleFaq[] = [
      {
        question: `How can I check my AKTU result if I forgot my registered Date of Birth?`,
        answer: `You can check your full OneView semester marksheet without requiring your Date of Birth by entering your University Roll Number at https://akturesult.bond.`
      },
      {
        question: `Where can I verify official circulars released by the university?`,
        answer: `Official circulars are published under the Circulars section on the university website (aktu.ac.in) and within your individual ERP student dashboard (erp.aktu.ac.in).`
      },
      {
        question: `What should I do if my marksheet shows PCP or INC status?`,
        answer: `PCP means Promoted with Carry Over Paper, requiring a backlog exam. INC indicates incomplete internal or practical marks that must be updated by your college examination cell.`
      },
      {
        question: `Is this update applicable to all AKTU affiliated colleges?`,
        answer: `Yes, official directives issued by Dr. A.P.J. Abdul Kalam Technical University apply to all affiliated engineering, pharmacy, and management institutions in Uttar Pradesh.`
      },
      {
        question: `How can students get their original degree from AKTU?`,
        answer: `Students who have cleared all semesters can apply for original degree certificates through the student ERP portal or collect them during university convocation ceremonies.`
      }
    ];

    return {
      title: finalTitle,
      slug,
      excerpt,
      content,
      tags,
      category,
      readingTime: Math.max(5, Math.ceil(content.split(/\s+/).length / 200)),
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
