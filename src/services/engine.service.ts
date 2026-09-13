/**
 * AKTU Engine Service
 * Provides high-speed automated DOB and student detail retrieval using official public state portals (DigiShakti UP)
 * with OCR.space automation and session validation.
 */
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { ProxyAgent } from 'undici';
import colleges from '../data/colleges.json';
import aktuColleges from '../data/AKTUCollege.json';

dotenv.config();

const DIGISHAKTI_BASE_URL = 'https://aadhaar.digishaktiup.in';
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36';

const OCR_KEYS = [
  'K88729517588957',
  'K82974418488957',
  'K81357662588957',
  'K89196924288957',
  'helloworld'
];

export interface EngineSession {
  sessionId: string;
  token: string;
  cookies: string;
  captchaUrl: string;
  redirectUrl?: string;
  cgid?: number;
  collegeName?: string;
}

export interface EngineDobResult {
  success: boolean;
  dob?: string;
  student?: {
    name: string;
    fatherName?: string;
    motherName?: string;
    course?: string;
    college?: string;
    enrollmentNo?: string;
  };
  needsManualCaptcha?: boolean;
  captchaImageBase64?: string;
  session?: EngineSession;
  error?: string;
  isCaptchaError?: boolean;
}

// Build fast college lookup map from merged colleges.json
interface CollegeItem {
  code: string;
  name: string;
  CGId?: number | null;
  CGCode?: string | null;
}

const collegeMap = new Map<string, { id: number; name: string }>();

const addKeys = (raw: string, cgid: number, name: string) => {
  if (!raw) return;
  collegeMap.set(raw.toUpperCase(), { id: cgid, name });
  const num = raw.replace(/^AK/i, '').replace(/^0+/, '');
  if (num) {
    collegeMap.set(num, { id: cgid, name });
    collegeMap.set(num.padStart(3, '0'), { id: cgid, name });
    collegeMap.set(num.padStart(4, '0'), { id: cgid, name });
    collegeMap.set('AK' + num, { id: cgid, name });
    collegeMap.set('AK' + num.padStart(3, '0'), { id: cgid, name });
  }
};

for (const d of colleges as CollegeItem[]) {
  if (!d.CGId) continue;
  const rawCode = (d.code || '').trim();
  const cgCode = (d.CGCode || '').trim();
  if (rawCode) addKeys(rawCode, d.CGId, d.name);
  if (cgCode) addKeys(cgCode, d.CGId, d.name);
}

for (const d of (aktuColleges as any[])) {
  if (!d.CGId) continue;
  const cgCode = (d.CGCode || '').trim();
  const name = d.CGName || '';
  if (cgCode) addKeys(cgCode, d.CGId, name);
}

export function resolveCollegeFromRoll(rollNumber: string): { id: number; name: string } | null {
  const clean = rollNumber.trim();
  let code = '';
  if (clean.length === 13) {
    code = clean.substring(2, 6);
  } else if (clean.length === 10) {
    code = clean.substring(2, 5);
  } else if (clean.length > 6) {
    code = clean.substring(2, 6);
  }
  if (!code) return null;

  const num = code.replace(/^0+/, '');
  const candidates = [
    code,
    num,
    'AK' + num,
    'AK' + code,
    num.padStart(3, '0'),
    num.padStart(4, '0')
  ];

  for (const candidate of candidates) {
    const found = collegeMap.get(candidate.toUpperCase());
    if (found) {
      return found;
    }
  }

  return null;
}

if (typeof process !== 'undefined') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function parseCookies(response: Response, cookieMap = new Map<string, string>()): Map<string, string> {
  let setCookies: string[] = [];
  if (typeof (response.headers as any).getSetCookie === 'function') {
    setCookies = (response.headers as any).getSetCookie();
  } else {
    const sc = response.headers.get('set-cookie');
    if (sc) setCookies = [sc];
  }
  for (const c of setCookies) {
    const firstPart = c.split(';')[0];
    const [k, ...v] = firstPart.split('=');
    if (k) cookieMap.set(k.trim(), v.join('=').trim());
  }
  return cookieMap;
}

function getCookieHeader(cookieMap: Map<string, string>): string {
  return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function fetchWithCookies(
  url: string,
  options: RequestInit = {},
  cookieMap: Map<string, string>,
  maxRedirects = 10
): Promise<{ res: Response; finalUrl: string }> {
  let currentUrl = url;
  let currentOptions = { ...options };

  for (let i = 0; i < maxRedirects; i++) {
    const headers: Record<string, string> = {};
    if (currentOptions.headers) {
      if (currentOptions.headers instanceof Headers) {
        currentOptions.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(currentOptions.headers)) {
        for (const [k, v] of currentOptions.headers) headers[k] = v;
      } else {
        Object.assign(headers, currentOptions.headers);
      }
    }

    if (cookieMap.size > 0) {
      headers['Cookie'] = getCookieHeader(cookieMap);
    }
    if (!headers['User-Agent']) {
      headers['User-Agent'] = USER_AGENT;
    }

    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    const fetchOptions: any = {
      ...currentOptions,
      headers,
      redirect: 'manual'
    };
    if (proxyUrl) {
      try {
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      } catch (proxyErr: any) {
        console.warn('[EngineService] Could not initialize ProxyAgent:', proxyErr.message);
      }
    }

    const res = await fetch(currentUrl, fetchOptions);

    parseCookies(res, cookieMap);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { res, finalUrl: currentUrl };
      currentUrl = loc.startsWith('http') ? loc : new URL(loc, currentUrl).toString();
      currentOptions = { method: 'GET' };
      continue;
    }

    return { res, finalUrl: currentUrl };
  }
  throw new Error('Too many redirects while communicating with university gateway');
}

export class AktuEngineService {
  private static localCache = new Map<string, { dob: string; student: any }>([
    [
      '2100650100103',
      {
        dob: '12/03/2003',
        student: {
          name: 'TUSHAR GAUTAM',
          fatherName: 'Mr DEVESH KUMAR GAUTAM',
          motherName: 'Mrs BABY GAUTAM',
          course: 'B.Tech. Computer Science & Engineering',
          college: 'B.S.A. COLLEGE OF ENGINEERING & TECHNOLOGY,MATHURA [AK65]',
          enrollmentNo: '2100650100103'
        }
      }
    ],
    [
      '2200650100100',
      {
        dob: '15/04/2003',
        student: {
          name: 'Shivam Dixit',
          fatherName: 'Bhola Dixit',
          motherName: 'Archana Dixit',
          course: 'B.Tech. Computer Science & Engineering',
          college: 'B.S.A. COLLEGE OF ENGINEERING & TECHNOLOGY,MATHURA [AK65]',
          enrollmentNo: '2200650100100'
        }
      }
    ]
  ]);

  private static generateDeviceId(): string {
    const randomHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `dev_${randomHex()}${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}-${randomHex()}${randomHex()}${randomHex()}`;
  }

  /**
   * Start a session for the given roll number
   */
  static async startSession(
    rollNumber: string,
    deviceId?: string,
    userCgid?: number
  ): Promise<{
    cached: boolean;
    dob?: string;
    session?: EngineSession;
    imageBuffer?: Buffer;
    captchaImageBase64?: string;
    error?: string;
  }> {
    const trimmedRoll = rollNumber.trim();
    if (this.localCache.has(trimmedRoll)) {
      const cached = this.localCache.get(trimmedRoll)!;
      return {
        cached: true,
        dob: cached.dob,
        session: undefined
      };
    }

    try {
      const cgidObj = userCgid ? { id: userCgid, name: '' } : resolveCollegeFromRoll(trimmedRoll);
      const cgid = cgidObj?.id || 10992;
      const collegeName = cgidObj?.name || '';

      const cookieMap = new Map<string, string>();

      const { res: resPage, finalUrl: redirectUrl } = await fetchWithCookies(
        `${DIGISHAKTI_BASE_URL}/`,
        { method: 'GET' },
        cookieMap
      );

      const html2 = await resPage.text();
      const tokenMatch = html2.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)
        || html2.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i);
      const token = tokenMatch ? tokenMatch[1] : '';

      // Download captcha image
      const { res: resCap } = await fetchWithCookies(
        `${DIGISHAKTI_BASE_URL}/EPramaan/GetCaptchaimage?query=${Math.random()}`,
        {
          headers: {
            'Referer': redirectUrl
          }
        },
        cookieMap
      );

      const arrayBuffer = await resCap.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      const cleanImageBuffer = await this.preprocessCaptcha(imageBuffer);
      const captchaImageBase64 = 'data:image/png;base64,' + cleanImageBuffer.toString('base64');

      const sessionId = 'dsh_' + Math.random().toString(36).substring(2, 12);

      return {
        cached: false,
        session: {
          sessionId,
          token,
          cookies: getCookieHeader(cookieMap),
          redirectUrl,
          cgid,
          collegeName,
          captchaUrl: '/EPramaan/GetCaptchaimage'
        },
        imageBuffer,
        captchaImageBase64
      };
    } catch (err: any) {
      const detailed = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
      console.error('[EngineService] Error starting DigiShakti session:', detailed);
      return { cached: false, error: detailed };
    }
  }

  /**
   * Preprocess captcha image with Sharp to remove grid lines and background noise
   */
  static async preprocessCaptcha(imageBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .resize({ width: 300 })
        .grayscale()
        .threshold(128)
        .png()
        .toBuffer();
    } catch (e: any) {
      console.warn('[EngineService] Sharp image preprocessing failed, using raw buffer:', e.message);
      return imageBuffer;
    }
  }

  /**
   * Download the security token image
   */
  static async downloadCaptchaImage(
    captchaUrl: string,
    deviceId?: string,
    sessionCookies?: string,
    redirectUrl?: string
  ): Promise<Buffer | null> {
    try {
      const fullUrl = captchaUrl.startsWith('http') ? captchaUrl : `${DIGISHAKTI_BASE_URL}${captchaUrl}`;
      const cookieMap = new Map<string, string>();
      if (sessionCookies) {
        for (const part of sessionCookies.split(';')) {
          const eq = part.indexOf('=');
          if (eq > 0) cookieMap.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
        }
      }

      const { res: response } = await fetchWithCookies(
        fullUrl,
        {
          headers: redirectUrl ? { 'Referer': redirectUrl } : {}
        },
        cookieMap
      );

      if (!response.ok) {
        console.error('[EngineService] Failed downloading captcha image:', response.status);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      console.error('[EngineService] Error downloading captcha image:', err.message);
      return null;
    }
  }

  /**
   * Solve image using OCR.space API with automatic key rotation and image binarization
   */
  static async solveCaptchaWithOcr(imageBuffer: Buffer): Promise<string | null> {
    const cleanBuffer = await this.preprocessCaptcha(imageBuffer);
    const base64Image = 'data:image/png;base64,' + cleanBuffer.toString('base64');

    for (const key of OCR_KEYS) {
      for (const engine of ['2', '1']) {
        try {
          const formData = new FormData();
          formData.append('base64Image', base64Image);
          formData.append('language', 'eng');
          formData.append('isOverlayRequired', 'false');
          formData.append('OCREngine', engine);
          formData.append('scale', 'true');

          const res = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            headers: { 'apikey': key },
            body: formData
          });

          if (!res.ok) continue;

          const data = await res.json();
          if (data && data.ParsedResults && data.ParsedResults.length > 0) {
            const text = data.ParsedResults[0].ParsedText?.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
            if (text && text.length === 5) {
              console.log(`[EngineService] Solved captcha using key ${key} (engine ${engine}): ${text}`);
              return text;
            }
          }
        } catch (e: any) {
          console.warn(`[EngineService] OCR failed with key ${key}:`, e.message);
        }
      }
    }
    return null;
  }

  /**
   * Submit the verification payload to DigiShakti
   */
  static async verifySession(
    session: EngineSession,
    rollNumber: string,
    captchaText: string,
    deviceId?: string
  ): Promise<EngineDobResult> {
    try {
      const trimmedRoll = rollNumber.trim();
      const postBody = new URLSearchParams({
        __RequestVerificationToken: session.token,
        UniDeptBoardId: '5',
        CGId: String(session.cgid || 10992),
        EnrollNo: trimmedRoll,
        Captcha: captchaText.trim().toUpperCase(),
        ResidenceType: 'I',
        CountryId: '',
        hdnCountryId: '0'
      });

      const cookieMap = new Map<string, string>();
      if (session.cookies) {
        for (const part of session.cookies.split(';')) {
          const eq = part.indexOf('=');
          if (eq > 0) cookieMap.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
        }
      }

      const { res: response } = await fetchWithCookies(
        `${DIGISHAKTI_BASE_URL}/EPramaan/SendServiceToEpramaan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': DIGISHAKTI_BASE_URL,
            'Referer': session.redirectUrl || `${DIGISHAKTI_BASE_URL}/`
          },
          body: postBody.toString()
        },
        cookieMap
      );

      const updatedCookies = getCookieHeader(cookieMap);
      const html = await response.text();

      if (html.includes('Invalid Captcha Entered')) {
        // Extract new RequestVerificationToken generated on submit failure
        const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)
          || html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i);
        const nextToken = tokenMatch ? tokenMatch[1] : session.token;

        const updatedSession: EngineSession = {
          ...session,
          token: nextToken,
          cookies: updatedCookies
        };

        const freshBuffer = await this.downloadCaptchaImage(
          `/EPramaan/GetCaptchaimage?query=${Math.random()}`,
          deviceId,
          updatedCookies,
          session.redirectUrl
        );

        const cleanFreshBuffer = freshBuffer ? await this.preprocessCaptcha(freshBuffer) : null;

        return {
          success: false,
          needsManualCaptcha: true,
          isCaptchaError: true,
          captchaImageBase64: cleanFreshBuffer ? 'data:image/png;base64,' + cleanFreshBuffer.toString('base64') : undefined,
          session: updatedSession,
          error: 'Invalid security code. Please enter the new code shown.'
        };
      }

      if (html.includes('Please enter a valid Enrollment Number')) {
        return {
          success: false,
          error: `Enrollment number ${trimmedRoll} was not found in university portal records.`
        };
      }

      const $ = cheerio.load(html);
      let dob = '';
      let name = '';
      let fatherName = '';
      let motherName = '';
      let course = '';
      let enrollmentNo = trimmedRoll;

      $('tr').each((_, tr) => {
        $(tr).find('th, td').each((_, cell) => {
          const header = $(cell).text().trim().toLowerCase();
          const val = $(cell).next('td, th').text().trim() || $(cell).next().text().trim();
          if (!val) return;

          if (header.includes("student's dob") || header === 'dob' || header.includes('date of birth')) {
            dob = val;
          } else if (header.includes("student's name")) {
            name = val;
          } else if (header.includes("father's name")) {
            fatherName = val;
          } else if (header.includes("mother's name")) {
            motherName = val;
          } else if (header.includes("student's course") || header === 'course') {
            course = val;
          } else if (header.includes('enrollment no') || header.includes('enrollment') || header.includes('enroll no')) {
            enrollmentNo = val;
          }
        });
      });

      if (!enrollmentNo || enrollmentNo === trimmedRoll) {
        const inputEnroll = $('input[name="EnrollNo"]').val() || $('input[id*="Enroll"]').val();
        if (inputEnroll) enrollmentNo = String(inputEnroll).trim();
      }

      if (dob) {
        const studentInfo = {
          name: name || 'Verified Student',
          fatherName,
          motherName,
          course,
          college: session.collegeName || '',
          enrollmentNo: enrollmentNo || trimmedRoll
        };

        this.localCache.set(trimmedRoll, { dob: dob.trim(), student: studentInfo });

        // Automatically save fetched DOB to database (do not save result/semesters)
        try {
          const { DatabaseService } = await import('../database/database.service');
          await DatabaseService.saveDobToDatabase({
            applicationNumber: trimmedRoll,
            dob: dob.trim(),
            name: studentInfo.name,
            fatherName: studentInfo.fatherName,
            motherName: studentInfo.motherName,
            course: studentInfo.course,
            institute: studentInfo.college,
            enrollmentNumber: studentInfo.enrollmentNo
          });
          console.log(`[EngineService] Saved DOB (${dob.trim()}) for ${trimmedRoll} directly to DB.`);
        } catch (dbErr: any) {
          console.warn('[EngineService] Could not save DOB to DB:', dbErr.message);
        }

        return {
          success: true,
          dob: dob.trim(),
          student: studentInfo
        };
      }

      return {
        success: false,
        error: 'Student record could not be extracted from university portal records.'
      };
    } catch (err: any) {
      const detailed = err.cause?.message ? `${err.message} (${err.cause.message})` : err.message;
      console.error('[EngineService] Error verifying session:', detailed);
      return { success: false, error: detailed };
    }
  }

  /**
   * Main High-Level Function: Find DOB for roll number automatically
   */
  static async findDob(rollNumber: string, userCgid?: number): Promise<EngineDobResult> {
    const trimmedRoll = rollNumber.trim();
    if (this.localCache.has(trimmedRoll)) {
      const cached = this.localCache.get(trimmedRoll)!;
      console.log(`[EngineService] Found cached DOB for roll ${trimmedRoll}: ${cached.dob}`);
      return {
        success: true,
        dob: cached.dob,
        student: cached.student
      };
    }

    // Check MongoDB first so we never have to fetch twice
    try {
      const { DatabaseService } = await import('../database/database.service');
      const dbStudent = await DatabaseService.findInDatabase(trimmedRoll);
      if (dbStudent && dbStudent.dob && dbStudent.dob !== '--') {
        const studentInfo = {
          name: dbStudent.name || 'Verified Student',
          fatherName: dbStudent.fatherName || '',
          motherName: (dbStudent as any).motherName || '',
          course: dbStudent.course || '',
          college: dbStudent.institute || '',
          enrollmentNo: dbStudent.enrollmentNumber || trimmedRoll
        };
        this.localCache.set(trimmedRoll, { dob: dbStudent.dob, student: studentInfo });
        console.log(`[EngineService] Found MongoDB cached record for roll ${trimmedRoll}`);
        return {
          success: true,
          dob: dbStudent.dob,
          student: studentInfo
        };
      }
    } catch (dbErr: any) {
      // Database lookup error, proceed with engine
    }

    const deviceId = this.generateDeviceId();
    console.log(`[EngineService] Initiating university gateway lookup for roll: ${trimmedRoll}`);

    // Step 1: Start Session
    const sessionRes = await this.startSession(trimmedRoll, deviceId, userCgid);
    if (sessionRes.error) {
      return { success: false, error: sessionRes.error };
    }

    if (sessionRes.cached && sessionRes.dob) {
      return {
        success: true,
        dob: sessionRes.dob
      };
    }

    if (!sessionRes.session || !sessionRes.imageBuffer) {
      return { success: false, error: 'Could not obtain verification session' };
    }

    const session = sessionRes.session;
    let activeSession = session;

    // Step 2: Solve with OCR Attempt 1
    const solvedCaptcha = await this.solveCaptchaWithOcr(sessionRes.imageBuffer);
    if (solvedCaptcha) {
      console.log(`[EngineService] Attempting verify with OCR solution: ${solvedCaptcha}`);
      const verifyRes = await this.verifySession(activeSession, trimmedRoll, solvedCaptcha, deviceId);
      if (verifyRes.success) {
        return verifyRes;
      }
      console.warn(`[EngineService] OCR verify attempt 1 failed (${verifyRes.error}).`);

      // If failed due to a non-captcha error (e.g. Enrollment number not found), return immediately!
      if (!verifyRes.isCaptchaError) {
        return verifyRes;
      }

      // If failed due to captcha, verifySession has ALREADY downloaded the next captcha and token!
      if (verifyRes.isCaptchaError && verifyRes.session && verifyRes.captchaImageBase64) {
        activeSession = verifyRes.session;
        const base64Data = verifyRes.captchaImageBase64.replace(/^data:image\/\w+;base64,/, '');
        const freshBuffer = Buffer.from(base64Data, 'base64');
        const solvedCaptcha2 = await this.solveCaptchaWithOcr(freshBuffer);
        if (solvedCaptcha2) {
          console.log(`[EngineService] Attempting verify with OCR solution 2: ${solvedCaptcha2}`);
          const verifyRes2 = await this.verifySession(activeSession, trimmedRoll, solvedCaptcha2, deviceId);
          if (verifyRes2.success) {
            return verifyRes2;
          }
          if (!verifyRes2.isCaptchaError) {
            return verifyRes2;
          }
          if (verifyRes2.session) {
            activeSession = verifyRes2.session;
          }
          if (verifyRes2.captchaImageBase64) {
            return {
              success: false,
              needsManualCaptcha: true,
              isCaptchaError: true,
              captchaImageBase64: verifyRes2.captchaImageBase64,
              session: activeSession,
              error: 'Security code requires verification.'
            };
          }
        }

        // OCR attempt 2 could not solve, return verifyRes captcha directly (no extra download)
        return {
          success: false,
          needsManualCaptcha: true,
          isCaptchaError: true,
          captchaImageBase64: verifyRes.captchaImageBase64,
          session: activeSession,
          error: 'Security code requires verification.'
        };
      }
    }

    // Step 3: If OCR 1 could not parse initial captcha, return initial session and captcha
    return {
      success: false,
      needsManualCaptcha: true,
      captchaImageBase64: sessionRes.captchaImageBase64,
      session: activeSession,
      error: 'Security code requires verification.'
    };
  }
}
