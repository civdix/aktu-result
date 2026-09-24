import qs from 'qs';
import * as cheerio from 'cheerio';
import { AKTU_URL, getRandomHeaders } from '../config';
import { ViewStateParams, ParseResult, Student, ScrapingSession } from '../interfaces';
import { DateUtils } from '../utils/date.utils';

function getSetCookieHeaders(response: Response): string[] {
  if (typeof (response.headers as any).getSetCookie === 'function') {
    return (response.headers as any).getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

export class ScrapingService {
  private static async safeFindInDatabase(rollNumber: string): Promise<Student | null> {
    try {
      const { DatabaseService } = await import('../database/database.service');
      return await DatabaseService.findInDatabase(rollNumber);
    } catch (error) {
      console.warn('Database lookup unavailable in this runtime:', error);
      return null;
    }
  }

  private static async safeSaveToDatabase(data: Student): Promise<void> {
    try {
      const { DatabaseService } = await import('../database/database.service');
      await DatabaseService.saveToDatabase(data);
    } catch (error) {
      console.warn('Database save unavailable in this runtime:', error);
    }
  }

  static async extractViewStateParams(htmlText: string): Promise<ViewStateParams> {
    if (!htmlText) return { viewState: '', viewStateGenerator: '', eventValidation: '' };

    const viewState = htmlText.match(/name="__VIEWSTATE"\s+id="__VIEWSTATE"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/id="__VIEWSTATE"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/name="__VIEWSTATE"\s+value="([^"]*)"/i)?.[1]
      || (typeof process !== 'undefined' && process.env?.VIEWSTATE)
      || (import.meta as any).env?.VIEWSTATE
      || '';

    const viewStateGenerator = htmlText.match(/name="__VIEWSTATEGENERATOR"\s+id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/name="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/i)?.[1]
      || (typeof process !== 'undefined' && process.env?.VIEWSTATEGENERATOR)
      || (import.meta as any).env?.VIEWSTATEGENERATOR
      || '';

    const eventValidation = htmlText.match(/name="__EVENTVALIDATION"\s+id="__EVENTVALIDATION"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/id="__EVENTVALIDATION"\s+value="([^"]*)"/i)?.[1]
      || htmlText.match(/name="__EVENTVALIDATION"\s+value="([^"]*)"/i)?.[1]
      || (typeof process !== 'undefined' && process.env?.EVENTVALIDATION)
      || (import.meta as any).env?.EVENTVALIDATION
      || '';

    return { viewState, viewStateGenerator, eventValidation };
  }

  static async find(
    rollNumber: string,
    day: number,
    month: number,
    year: number,
    session: ScrapingSession,
    gRecaptchaResponse = ''
  ): Promise<{ result: ParseResult | null; nextSession: ScrapingSession } | null> {
    const data = qs.stringify({
      '__EVENTTARGET': '',
      '__EVENTARGUMENT': '',
      '__VIEWSTATE': session.viewStateParams.viewState,
      '__VIEWSTATEGENERATOR': session.viewStateParams.viewStateGenerator,
      '__EVENTVALIDATION': session.viewStateParams.eventValidation,
      'txtRollNo': rollNumber,
      'txtDOB': `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      'btnSearch': 'खोजें',
      'hidForModel': '',
      'g-recaptcha-response': gRecaptchaResponse
    });

    try {
      const response = await fetch(AKTU_URL, {
        method: 'POST',
        headers: {
          ...getRandomHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': session.cookieHeader
        },
        body: data
      });
      const htmlData = await response.text();
      const captchaFailed = htmlData.includes('कैप्चा गलत है') || htmlData.includes('प्रदान कैप्चा गलत है');

      const parsed = ScrapingService.parseHtml(htmlData);
      const viewStateParams = await ScrapingService.extractViewStateParams(htmlData);

      const newCookies = getSetCookieHeaders(response);
      let updatedCookieHeader = session.cookieHeader;
      if (newCookies.length > 0) {
        const existingMap = new Map(session.cookieHeader.split(';').map(c => {
          const parts = c.split('=');
          return [parts[0].trim(), parts[1]?.trim() || ''];
        }));
        newCookies.forEach(c => {
          const clean = c.split(';')[0];
          const parts = clean.split('=');
          existingMap.set(parts[0].trim(), parts[1]?.trim() || '');
        });
        updatedCookieHeader = Array.from(existingMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      }

      return {
        result: parsed,
        nextSession: {
          cookieHeader: updatedCookieHeader,
          viewStateParams
        },
        captchaFailed
      };
    } catch (error) {
      console.error('Error in find function:', error);
      return null;
    }
  }

  static findSemesterName(tableEl: any, $: cheerio.CheerioAPI, fallbackIndex: number): string {
    const contentDiv = $(tableEl).closest('.contentclass');
    let sessionType = '';

    if (contentDiv.length > 0) {
      const headerDiv = contentDiv.prev('.headerclass');
      if (headerDiv.length > 0) {
        const sessionText = headerDiv.find('[id$="_lblSession"]').text().trim();
        const match = sessionText.match(/Session\s*:\s*([0-9-]{7,9})\s*\(([^)]+)\)/i) ||
          sessionText.match(/Session\s*:\s*([^\s]+)/i);
        if (match) {
          if (match[2]) {
            sessionType = match[2].trim().toUpperCase();
          } else {
            const textUpper = sessionText.toUpperCase();
            if (textUpper.includes('BACK') || textUpper.includes('COP')) {
              sessionType = 'BACK';
            } else if (textUpper.includes('REGULAR')) {
              sessionType = 'REGULAR';
            }
          }
        }
      }
    }

    let semText = '';
    const checkText = (text: string): boolean => {
      const clean = text.trim();
      if (/semester|sem\b/i.test(clean)) {
        semText = clean;
        return true;
      }
      return false;
    };

    // 1. Check preceding siblings
    let current = $(tableEl).prev();
    while (current.length > 0) {
      if (checkText(current.text())) break;
      if (current.is('table')) break;
      current = current.prev();
    }

    // 2. Check parent containers if not found
    if (!semText) {
      let parent = $(tableEl).parent();
      while (parent.length > 0 && !parent.is('body')) {
        const headingText = parent.find('h1, h2, h3, h4, h5, h6, .panel-heading, .panel-title, .box-title, .header, .card-header').first().text().trim();
        if (checkText(headingText)) break;

        // Check siblings of parent
        let pPrev = parent.prev();
        let foundInSibling = false;
        while (pPrev.length > 0) {
          if (checkText(pPrev.text())) {
            foundInSibling = true;
            break;
          }
          if (pPrev.is('table')) break;
          pPrev = pPrev.prev();
        }
        if (foundInSibling) break;

        parent = parent.parent();
      }
    }

    let semNum = '';
    if (semText) {
      let cleanSem = semText.replace(/\s+/g, ' ').trim();
      const numMatch = cleanSem.match(/(?:semester|sem)\s*:?\s*([0-9a-zA-Z_#-]+)/i) ||
        cleanSem.match(/([0-9a-zA-Z_#-]+)\s*(?:semester|sem)/i);
      if (numMatch) {
        semNum = numMatch[1].trim();
      }
    }

    if (!semNum) {
      semNum = String(fallbackIndex + 1);
    }

    if (sessionType) {
      return `Semester ${semNum} (${sessionType})`;
    }
    return `Semester ${semNum}`;
  }

  static findSgpaForTable(tableEl: any, $: cheerio.CheerioAPI): string {
    let parent = $(tableEl).parent();
    while (parent.length > 0 && !parent.is('body')) {
      const sgpaSpan = parent.find('td > span:contains("SGPA")').first();
      if (sgpaSpan.length > 0) {
        const sgpaValue = sgpaSpan.parent().next('td').next('td').find('span').text().trim();
        if (sgpaValue) return sgpaValue;
      }
      // If we traverse up too far and find too many tables, stop
      if (parent.find('table').length > 2) break;
      parent = parent.parent();
    }
    return '0.00';
  }

  static parseHtml(htmlContent: string): ParseResult | null {
    const $ = cheerio.load(htmlContent);
    const applicationNumber = $('#lblRollNo').text().trim() || 'N/A';
    const name = $('#lblFullName').text().trim() || 'N/A';
    const COP = $('#ctl04_lblCOP').text().trim() || 'N/A';

    const fatherName = $('#lblFatherName').text().trim() || $('#lblFather').text().trim() || 'N/A';

    let enrollmentNumber = $('#lblEnrollmentNo').text().trim() ||
      $('[id$="lblEnrollmentNo"]').text().trim() ||
      $('#lblEnrollNo').text().trim() ||
      $('[id$="lblEnrollNo"]').text().trim() ||
      $('#lblEnrollment').text().trim() ||
      $('[id$="lblEnrollment"]').text().trim() ||
      '';
    if (!enrollmentNumber) {
      $('td, span, th').each((_, el) => {
        const txt = $(el).text().trim();
        if (/Enroll(ment)?\s*No/i.test(txt) || /Enroll(ment)?\s*Number/i.test(txt) || /Enroll\./i.test(txt)) {
          const val = $(el).next().text().trim() || $(el).parent().next().text().trim();
          if (val && val.length > 5 && !val.includes('Enroll') && !val.includes('No.')) {
            enrollmentNumber = val.replace(/^:\s*/, '').trim();
            return false;
          }
        }
      });
    }
    if (!enrollmentNumber) enrollmentNumber = 'N/A';

    const course = $('#lblBranch').text().trim() || $('#lblCourse').text().trim() || 'N/A';
    const institute = $('#lblCollegeName').text().trim() || $('#lblInstitute').text().trim() || $('#lblCollege').text().trim() || 'N/A';

    const sgpaValues: string[] = [];
    $('td > span:contains("SGPA")').each((index, element) => {
      const sgpaValue = $(element).parent().next('td').next('td').find('span').text().trim();
      sgpaValues.push(sgpaValue);
    });

    if (applicationNumber === 'N/A' && name === 'N/A' && sgpaValues.length === 0) {
      return null;
    }

    // Parse detailed semesters and subjects
    const semesters: any[] = [];
    const seenBaseNames = new Set<string>();
    let semesterIndex = 0;

    $('table').each((i, tableEl) => {
      // Skip parent wrapper tables that contain nested tables
      if ($(tableEl).find('table').length > 0) return;

      const rows = $(tableEl).find('tr');
      if (rows.length < 2) return;

      const headerText = $(rows.eq(0)).text().toLowerCase();
      const isSubjectTable = headerText.includes('code') && (headerText.includes('subject') || headerText.includes('grade'));
      if (!isSubjectTable) return;

      const subjects: any[] = [];
      rows.each((rowIdx, rowEl) => {
        if (rowIdx === 0) return; // skip header
        const cols = $(rowEl).find('td');
        if (cols.length < 5) return;

        subjects.push({
          code: $(cols[0]).text().trim(),
          name: $(cols[1]).text().trim(),
          type: $(cols[2]).text().trim() || 'Theory',
          int: $(cols[3]).text().trim() || '--',
          ext: $(cols[4]).text().trim() || '--',
          back: cols.length > 5 ? $(cols[5]).text().trim() : '--',
          grade: cols.length > 6 ? $(cols[6]).text().trim() : '--'
        });
      });

      const sgpa = ScrapingService.findSgpaForTable(tableEl, $) || sgpaValues[semesterIndex] || '0.00';
      const rawSemName = ScrapingService.findSemesterName(tableEl, $, semesterIndex);
      const baseSemName = rawSemName.replace(/\s*\(.*\)$/, '').trim();

      let semName = baseSemName;
      if (seenBaseNames.has(baseSemName)) {
        semName = `${baseSemName} (Back)`;
      } else {
        seenBaseNames.add(baseSemName);
      }

      const hasBacklog = subjects.some(sub => sub.grade === 'F' || (sub.back && sub.back !== '--'));
      const semStatus = hasBacklog ? 'PCP' : 'PASS';

      semesters.push({
        sem: semName,
        sgpa: sgpa,
        status: semStatus,
        marks: '--',
        subjects: subjects
      });

      semesterIndex++;
    });

    // Calculate CGPA from the latest SGPA of each unique semester
    let cgpa = '0.00';
    const uniqueSgpas = new Map<string, number>();

    semesters.forEach(sem => {
      const baseSem = sem.sem.replace(/\s*\(.*\)$/, '');
      const val = parseFloat(sem.sgpa);
      if (!isNaN(val)) {
        uniqueSgpas.set(baseSem, val);
      }
    });

    if (uniqueSgpas.size > 0) {
      const validSgpas = Array.from(uniqueSgpas.values());
      const sum = validSgpas.reduce((a, b) => a + b, 0);
      cgpa = (sum / validSgpas.length).toFixed(2);
    }

    // Parse final result summary (course completion & division)
    const pnlFinalResult = $('#pnlFinalResultSummary');
    let courseCompleted = false;
    let divisionAwarded = '';
    let finalResultHtml = '';

    if (pnlFinalResult.length > 0) {
      courseCompleted = true;
      finalResultHtml = pnlFinalResult.html() || '';
      const divVal = pnlFinalResult.find('[id$="lblDivisionAwarded"]').text().trim() ||
        pnlFinalResult.find('[id$="lblDivision"]').text().trim() ||
        '';
      if (divVal) {
        divisionAwarded = divVal;
      } else {
        pnlFinalResult.find('td, span').each((_, el) => {
          const txt = $(el).text().trim();
          if (txt.includes('Division Awarded')) {
            const val = $(el).next().text().trim() || $(el).parent().next().text().trim();
            if (val && !val.includes('Division Awarded')) {
              divisionAwarded = val;
              return false;
            }
          }
        });
      }

      if (!divisionAwarded) {
        const pnlText = pnlFinalResult.text();
        const match = pnlText.match(/Division(?:\s*Awarded)?\s*:\s*([^\n\r]+)/i) ||
          pnlText.match(/Division\s+([^\n\r]+)/i);
        if (match) {
          divisionAwarded = match[1].trim();
        }
      }

      divisionAwarded = divisionAwarded.replace(/\s+/g, ' ').replace(/^:\s*/, '').trim();

      if (divisionAwarded.toUpperCase().includes('NOT AWARDED') || divisionAwarded.toUpperCase().includes('NOT_AWARDED')) {
        divisionAwarded = 'Clear Backlog';
      }
    }

    return {
      success: true,
      applicationNumber,
      name,
      COP,
      sgpaValues,
      fatherName,
      enrollmentNumber,
      course,
      institute,
      cgpa,
      semesters,
      courseCompleted,
      divisionAwarded,
      finalResultHtml
    };
  }

  static async validateRollNumber(rollNumber: string, force = false, gRecaptchaResponse = ''): Promise<Student | ScrapingSession | boolean> {
    if (!force) {
      const alreadyInDb = await ScrapingService.safeFindInDatabase(rollNumber);
      if (alreadyInDb) {
        console.log(`${rollNumber} found in DB.....skipping Validation`);
        return alreadyInDb;
      }
    }

    const cleanRollNumber = rollNumber.replace(/^0+/, '');
    if (!/^\d+$/.test(cleanRollNumber) || cleanRollNumber.length < 10 || cleanRollNumber.length > 13) {
      console.log('Invalid roll number format.');
      return false;
    }

    try {
      const headers = getRandomHeaders();
      const response = await fetch(AKTU_URL, { method: 'GET', headers });
      const responseText = await response.text();

      const cookies = getSetCookieHeaders(response);
      const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

      const { viewState, viewStateGenerator, eventValidation } = await ScrapingService.extractViewStateParams(responseText);

      const formData = qs.stringify({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        'txtRollNo': rollNumber,
        'btnProceed': 'आगे बढ़े',
        '__VIEWSTATE': viewState,
        '__VIEWSTATEGENERATOR': viewStateGenerator,
        '__EVENTVALIDATION': eventValidation,
        'g-recaptcha-response': gRecaptchaResponse
      });

      const validationResponse = await fetch(AKTU_URL, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieHeader
        },
        body: formData
      });
      const validationResponseText = await validationResponse.text();

      const invalidMessages = [
        'गलत अनुक्रमांक',
        'आपके द्वारा प्रदान किया गया अनुक्रमांक गलत है'
      ];

      if (invalidMessages.some(msg => validationResponseText.includes(msg))) {
        console.log('Invalid roll number.');
        return false;
      }

      console.log('Roll number is valid!');

      const nextCookies = getSetCookieHeaders(validationResponse);
      let finalCookieHeader = cookieHeader;
      if (nextCookies.length > 0) {
        const existingMap = new Map(cookieHeader.split(';').map(c => {
          const parts = c.split('=');
          return [parts[0].trim(), parts[1]?.trim() || ''];
        }));
        nextCookies.forEach(c => {
          const clean = c.split(';')[0];
          const parts = clean.split('=');
          existingMap.set(parts[0].trim(), parts[1]?.trim() || '');
        });
        finalCookieHeader = Array.from(existingMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      }

      const nextViewStateParams = await ScrapingService.extractViewStateParams(validationResponseText);

      return {
        cookieHeader: finalCookieHeader,
        viewStateParams: nextViewStateParams
      };
    } catch (error) {
      console.error('Error during validation:', error);
      return false;
    }
  }

  static async fetchResultDirect(rollNumber: string, gRecaptchaResponse = ''): Promise<Student | null> {
    const headers = getRandomHeaders();
    try {
      console.log(`[DirectGateway] Initiating direct gateway request for roll number: ${rollNumber}`);

      // Step 1: Fetch initial page to get initial ViewState and cookies
      const initialRes = await fetch(AKTU_URL, { method: 'GET', headers });
      const initialHtml = await initialRes.text();
      const cookies = getSetCookieHeaders(initialRes);
      const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
      const initialParams = await ScrapingService.extractViewStateParams(initialHtml);

      // Step 2: Post with the reference roll number (1150231905) to proceed
      const proceedData = qs.stringify({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        'txtRollNo': '1150231905',
        'btnProceed': 'आगे बढ़े',
        '__VIEWSTATE': initialParams.viewState,
        '__VIEWSTATEGENERATOR': initialParams.viewStateGenerator,
        '__EVENTVALIDATION': initialParams.eventValidation
      });

      const proceedRes = await fetch(AKTU_URL, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieHeader
        },
        body: proceedData
      });
      const proceedHtml = await proceedRes.text();

      const proceedCookies = getSetCookieHeaders(proceedRes);
      let updatedCookieHeader = cookieHeader;
      if (proceedCookies.length > 0) {
        const existingMap = new Map(cookieHeader.split(';').map(c => {
          const parts = c.split('=');
          return [parts[0].trim(), parts[1]?.trim() || ''];
        }));
        proceedCookies.forEach(c => {
          const clean = c.split(';')[0];
          const parts = clean.split('=');
          existingMap.set(parts[0].trim(), parts[1]?.trim() || '');
        });
        updatedCookieHeader = Array.from(existingMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
      }

      const proceedParams = await ScrapingService.extractViewStateParams(proceedHtml);

      const targetViewState = proceedParams.viewState || initialParams.viewState;
      const targetViewStateGen = proceedParams.viewStateGenerator || initialParams.viewStateGenerator;
      const targetEventVal = proceedParams.eventValidation || initialParams.eventValidation;

      // Step 3: Post the target roll number using the synchronized session
      const targetData = qs.stringify({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        'txtRollNo': rollNumber,
        'btnSearch': 'खोजें',
        '__VIEWSTATE': targetViewState,
        '__VIEWSTATEGENERATOR': targetViewStateGen,
        '__EVENTVALIDATION': targetEventVal,
        'hidForModel': '',
        'g-recaptcha-response': gRecaptchaResponse
      });

      const targetRes = await fetch(AKTU_URL, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': updatedCookieHeader
        },
        body: targetData
      });
      const targetHtml = await targetRes.text();

      // Step 4: Parse the returned HTML
      const parseResult = ScrapingService.parseHtml(targetHtml);
      if (parseResult) {
        const studentResult: Student = {
          ...parseResult,
          dob: '--'
        };
        await ScrapingService.safeSaveToDatabase(studentResult);
        console.log(`[DirectGateway] Successfully fetched and cached result for roll number: ${rollNumber}`);
        return studentResult;
      }

      if (targetHtml.includes('कैप्चा गलत है')) {
        console.warn(`[DirectGateway] AKTU server requested reCAPTCHA validation for roll number: ${rollNumber}`);
      } else {
        console.log(`[DirectGateway] Parse failed for roll number: ${rollNumber}. HTML status: ${targetRes.status}, HTML length: ${targetHtml.length}`);
      }
      return null;
    } catch (error: any) {
      console.error('[DirectGateway] Error in direct gateway flow:', error.message);
      return null;
    }
  }

  static async fetchResultWithDob(rollNumber: string, dob: string, gRecaptchaResponse = ''): Promise<Student | null> {
    const headers = getRandomHeaders();
    try {
      const cleanDob = (dob || '').trim();
      let normalizedDob = cleanDob;
      const ymdMatch = cleanDob.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymdMatch) {
        normalizedDob = `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
      } else {
        const dmyMatch = cleanDob.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmyMatch) {
          normalizedDob = `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
        }
      }

      console.log(`[Result] Fetching result for roll ${rollNumber} with DOB ${normalizedDob}...`);
      const validationSession = await ScrapingService.validateRollNumber(rollNumber, true);
      if (!validationSession || typeof validationSession !== 'object' || !('cookieHeader' in validationSession)) {
        console.error('[Result] Failed to validate roll number and obtain session');
        return null;
      }

      const session = validationSession as ScrapingSession;

      let solvedCaptcha = gRecaptchaResponse;
      if (!solvedCaptcha) {
        try {
          const { CaptchaService } = await import('../services/captcha.service');
          const token = await CaptchaService.solveRecaptchaV2();
          if (token) solvedCaptcha = token;
        } catch (e: any) {
          console.warn('[ScrapingService] Automated captcha solving skipped:', e.message);
        }
      }

      const targetData = qs.stringify({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        'txtRollNo': rollNumber,
        'txtDOB': normalizedDob,
        'btnSearch': 'खोजें',
        '__VIEWSTATE': session.viewStateParams.viewState,
        '__VIEWSTATEGENERATOR': session.viewStateParams.viewStateGenerator,
        '__EVENTVALIDATION': session.viewStateParams.eventValidation,
        'hidForModel': '',
        'g-recaptcha-response': solvedCaptcha
      });

      const targetRes = await fetch(AKTU_URL, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': session.cookieHeader
        },
        body: targetData
      });
      const targetHtml = await targetRes.text();

      // Create pre-expanded full page where every single semester accordion is opened
      let expandedFullHtml = targetHtml;
      if (expandedFullHtml.includes('</head>')) {
        expandedFullHtml = expandedFullHtml.replace(
          '</head>',
          `<style>
            .contentclass { display: block !important; visibility: visible !important; height: auto !important; max-height: none !important; opacity: 1 !important; }
            .headerclass { background-color: #7A1C1C !important; color: white !important; cursor: pointer; padding: 10px 14px; margin-top: 15px; border-radius: 4px; font-weight: bold; }
            .headerclass a, .headerclass span { color: white !important; }
            body { padding: 15px; background: #f7fafc; }
          </style>
          <script>
            window.addEventListener('DOMContentLoaded', () => {
              document.querySelectorAll('.contentclass').forEach(el => {
                el.style.display = 'block';
                el.style.visibility = 'visible';
              });
            });
          </script>
          </head>`
        );
      }

      if (expandedFullHtml.includes('<body')) {
        expandedFullHtml = expandedFullHtml.replace(
          /<body([^>]*)>/i,
          `<body$1>
          <div style="background: linear-gradient(135deg, #7A1C1C, #991B1B); color: #ffffff; padding: 12px 18px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; position: sticky; top: 0; z-index: 9999999; box-shadow: 0 4px 15px rgba(0,0,0,0.25); border-bottom: 2px solid #FFD700;">
            <span>🔥 <b>Want your AKTU Result without DOB?</b></span>
            <a href="https://t.me/akturesultwithoutdobbot" target="_blank" style="display: inline-block; background: #FFD700; color: #7A1C1C; padding: 6px 18px; border-radius: 20px; text-decoration: none; margin-left: 12px; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,0.2);">👉 Click here to continue</a>
          </div>`
        );
      }

      const parseResult = ScrapingService.parseHtml(targetHtml);
      if (parseResult) {
        const studentResult: Student = {
          ...parseResult,
          dob: dob,
          rawHtml: expandedFullHtml
        };
        await ScrapingService.safeSaveToDatabase(studentResult);
        console.log(`[Result] Successfully fetched and cached result for roll number: ${rollNumber}`);
        return studentResult;
      }

      if (targetHtml.includes('कैप्चा गलत है')) {
        console.warn(`[Result] Captcha validation failed for roll: ${rollNumber}`);
      } else if (targetHtml.includes('जन्मतिथि गलत है')) {
        console.warn(`[Result] Incorrect DOB (${dob}) for roll: ${rollNumber}`);
      } else {
        console.warn(`[Result] Result parse failed for roll: ${rollNumber}. HTML status: ${targetRes.status}`);
      }
      return null;
    } catch (error: any) {
      console.error('[Result] Error fetching result with DOB:', error.message);
      return null;
    }
  }

  static async discoverDobAndFetchResult(
    rollNumber: string,
    gRecaptchaResponse = '',
    startYear?: number,
    endYear?: number
  ): Promise<Student | null> {
    try {
      console.log(`[DOB Discover] Starting DOB discovery for roll ${rollNumber}...`);
      const validationSession = await ScrapingService.validateRollNumber(rollNumber, true);
      if (!validationSession || typeof validationSession !== 'object' || !('cookieHeader' in validationSession)) {
        console.error('[DOB Discover] Failed to validate roll number and obtain session');
        return null;
      }

      let currentSession = validationSession as ScrapingSession;

      // Smart year inference based on roll number prefix
      let estAdmissionYear = 2022;
      const prefixTwo = parseInt(rollNumber.substring(0, 2), 10);
      if (!isNaN(prefixTwo) && prefixTwo >= 10 && prefixTwo <= 30) {
        estAdmissionYear = 2000 + prefixTwo;
      }
      const typicalBirthYear = estAdmissionYear - 18; // e.g. 2021 - 18 = 2003

      const yearsToSearch: number[] = [];
      if (startYear && endYear && startYear <= endYear) {
        for (let y = startYear; y <= endYear; y++) yearsToSearch.push(y);
      } else {
        yearsToSearch.push(typicalBirthYear);      // e.g. 2003
        yearsToSearch.push(typicalBirthYear - 1);  // e.g. 2002
        yearsToSearch.push(typicalBirthYear + 1);  // e.g. 2004
        yearsToSearch.push(typicalBirthYear - 2);  // e.g. 2001
        yearsToSearch.push(typicalBirthYear + 2);  // e.g. 2005
      }

      let isFirstAttempt = true;

      for (const year of yearsToSearch) {
        for (let month = 1; month <= 12; month++) {
          const daysInMonth = DateUtils.getDaysInMonth(month, year);
          for (let day = 1; day <= daysInMonth; day++) {
            const tokenToUse = isFirstAttempt ? gRecaptchaResponse : '';
            console.log(`[DOB Discover] Testing DOB: ${day}/${month}/${year} for roll ${rollNumber}`);
            const findResult = await ScrapingService.find(rollNumber, day, month, year, currentSession, tokenToUse);

            if (!findResult) {
              console.warn(`[DOB Discover] Network error on ${day}/${month}/${year}`);
              break;
            }

            // If captcha failed on subsequent attempt, AKTU requires per-request captcha
            if (!isFirstAttempt && findResult.captchaFailed) {
              console.warn(`[DOB Discover] AKTU requires per-request reCAPTCHA token. Ending discovery loop.`);
              return null;
            }

            isFirstAttempt = false;

            const { result: parseResult, nextSession } = findResult;
            currentSession = nextSession;

            if (parseResult) {
              const foundDob = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
              console.log(`[DOB Discover] SUCCESS! Located DOB: ${foundDob} for ${rollNumber} (${parseResult.name})`);
              const studentResult: Student = {
                ...parseResult,
                dob: foundDob
              };
              await ScrapingService.safeSaveToDatabase(studentResult);
              return studentResult;
            }
          }
        }
      }

      return null;
    } catch (err: any) {
      console.error('[DOB Discover] Error during DOB discovery:', err.message);
      return null;
    }
  }
}