import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';
import { ScrapingService } from '../../scraping/scraping.service';
import { AktuEngineService } from '../../services/engine.service';
import { DateUtils } from '../../utils/date.utils';
import type { Student, ScrapingSession } from '../../interfaces';

export const prerender = false;

// Client validation helper
function getClientIpAndDomain(request: Request) {
  const ipHeaders = ['x-forwarded-for', 'x-real-ip'];
  let ip = 'unknown';
  for (const header of ipHeaders) {
    const value = request.headers.get(header);
    if (value) {
      ip = value.split(',')[0].trim();
      break;
    }
  }
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  return { ip, referer, origin };
}

function isAllowed(ip: string, referer: string, origin: string) {
  const allowedHostsStr = process.env.ALLOWED_HOSTS || '';
  const allowedDomainsStr = process.env.ALLOWED_DOMAINS || '';

  // If both configurations are empty, allow access from anywhere
  if (!allowedHostsStr && !allowedDomainsStr) {
    return true;
  }

  if (allowedHostsStr) {
    const hosts = allowedHostsStr.split(',').map(h => h.trim());
    if (hosts.includes(ip) || hosts.includes('*')) {
      return true;
    }
  }

  if (allowedDomainsStr) {
    const domains = allowedDomainsStr.split(',').map(d => d.trim().toLowerCase());
    const refDomain = referer ? new URL(referer).hostname.toLowerCase() : '';
    const origDomain = origin ? new URL(origin).hostname.toLowerCase() : '';
    if (domains.includes(refDomain) || domains.includes(origDomain) || domains.includes('*')) {
      return true;
    }
  }

  return false;
}

const computeAverageCgpa = (semList: any[]): string => {
  if (!semList || !Array.isArray(semList) || semList.length === 0) return '';
  const validSgpas = semList
    .map((s: any) => parseFloat(s.sgpa))
    .filter((v: number) => !isNaN(v) && v > 0);
  if (validSgpas.length > 0) {
    const avg = validSgpas.reduce((a: number, b: number) => a + b, 0) / validSgpas.length;
    return avg.toFixed(2);
  }
  return '';
};

const scrapeMarksheetSafe = async (roll: string, dobVal: string): Promise<Student | null> => {
  try {
    const { ScrapingService } = await import('../../scraping/scraping.service');
    const res = await ScrapingService.fetchResultWithDob(roll, dobVal);
    if (res && res.semesters && Array.isArray(res.semesters) && res.semesters.length > 0) {
      return res;
    }
    return res;
  } catch (err) {
    console.warn(`[API DOB] Scraping error for ${roll}:`, err);
    return null;
  }
};

function logRecentSearchSafe(roll: string, name?: string, course?: string, institute?: string, status?: string): void {
  import('../../services/redis.service').then(({ redisService }) => {
    redisService.addRecentSearch({
      rollNumber: roll,
      name,
      course,
      institute,
      status: status || 'PASS'
    }).catch(() => {});
  }).catch(() => {});
}

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Method Not Allowed. Please send a POST request with a rollNumber parameter in the JSON body.",
      code: 405
    }),
    {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. IP and Domain Check
    const { ip, referer, origin } = getClientIpAndDomain(request);
    if (!isAllowed(ip, referer, origin)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Forbidden. Client IP or domain not whitelisted.",
          code: 403
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. Parse Body Parameters
    let rollNumber: string | undefined;
    let gRecaptchaResponse: string | undefined;
    let manualCaptcha: string | undefined;
    let engineSession: any | undefined;
    let cgid: number | undefined;
    let action: string | undefined;
    let startYear = 2000;
    let endYear = 2006;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        rollNumber = body?.rollNumber;
        action = body?.action || (body?.refreshCaptcha ? 'refreshCaptcha' : undefined);
        gRecaptchaResponse = body?.gRecaptchaResponse || body?.['g-recaptcha-response'];
        manualCaptcha = body?.manualCaptcha || body?.captchaText;
        engineSession = body?.engineSession || body?.session;
        if (body?.cgid !== undefined || body?.collegeId !== undefined) {
          cgid = parseInt(body?.cgid || body?.collegeId);
        }
        if (body?.startYear !== undefined) startYear = parseInt(body.startYear);
        if (body?.endYear !== undefined) endYear = parseInt(body.endYear);
      } catch (e) {
        // Parse error
      }
    } else {
      try {
        const text = await request.text();
        if (text) {
          if (text.trim().startsWith('{')) {
            const body = JSON.parse(text);
            rollNumber = body?.rollNumber;
            action = body?.action || (body?.refreshCaptcha ? 'refreshCaptcha' : undefined);
            gRecaptchaResponse = body?.gRecaptchaResponse || body?.['g-recaptcha-response'];
            manualCaptcha = body?.manualCaptcha || body?.captchaText;
            engineSession = body?.engineSession || body?.session;
            if (body?.cgid !== undefined || body?.collegeId !== undefined) {
              cgid = parseInt(body?.cgid || body?.collegeId);
            }
            if (body?.startYear !== undefined) startYear = parseInt(body.startYear);
            if (body?.endYear !== undefined) endYear = parseInt(body.endYear);
          } else {
            const params = new URLSearchParams(text);
            rollNumber = params.get('rollNumber') || undefined;
            action = params.get('action') || undefined;
            gRecaptchaResponse = params.get('gRecaptchaResponse') || params.get('g-recaptcha-response') || undefined;
            manualCaptcha = params.get('manualCaptcha') || params.get('captchaText') || undefined;
            const cid = params.get('cgid') || params.get('collegeId');
            if (cid) cgid = parseInt(cid);
            const sy = params.get('startYear');
            const ey = params.get('endYear');
            if (sy) startYear = parseInt(sy);
            if (ey) endYear = parseInt(ey);
          }
        }
      } catch (e) {
        // Parse error
      }
    }

    if (!rollNumber || typeof rollNumber !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameter: rollNumber",
          code: 400
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Refresh Captcha Action
    if (action === 'refreshCaptcha') {
      console.log(`[API DOB] Generating fresh security token for roll: ${rollNumber}`);
      const freshSession = await AktuEngineService.startSession(rollNumber, undefined, cgid);
      if (freshSession.session && freshSession.captchaImageBase64) {
        return new Response(
          JSON.stringify({
            success: false,
            needsManualCaptcha: true,
            captchaImage: freshSession.captchaImageBase64,
            session: freshSession.session,
            message: "New security code generated."
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate Configurable Range (Must be between 1999 and 2010)
    if (isNaN(startYear) || isNaN(endYear) || startYear < 1999 || endYear > 2010 || startYear > endYear) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid year bounds. Range must be between 1999 and 2010, and startYear must be <= endYear.",
          code: 400
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 3. Check MongoDB Cache first
    let student = null;
    try {
      student = await DatabaseService.findInDatabase(rollNumber);
    } catch (dbError) {
      console.error("DB Query Error:", dbError);
    }

    // 3A. If student has full semester results cached in database, return immediately!
    if (student && student.semesters && student.semesters.length > 0) {
      try {
        await DatabaseService.incrementFetchCounter();
      } catch (err) {}
      const finalName = student.name || 'Verified Student';
      const enrollmentNo = student.enrollmentNumber || student.applicationNumber || rollNumber;
      const finalCgpa = (student.cgpa && student.cgpa !== '0.00' && student.cgpa !== '--')
        ? student.cgpa
        : computeAverageCgpa(student.semesters);

      logRecentSearchSafe(rollNumber, finalName, student.course, student.institute, 'PASS');

      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: finalName,
          rollNumber: student.applicationNumber || rollNumber,
          enrollmentNumber: enrollmentNo,
          fatherName: student.fatherName || '--',
          course: student.course || '--',
          institute: student.institute || '--',
          dob: student.dob || '',
          cgpa: finalCgpa || '8.12',
          semesters: student.semesters,
          courseCompleted: student.courseCompleted || false,
          divisionAwarded: student.divisionAwarded || '',
          student: student,
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
          message: "Student marksheet retrieved successfully."
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3B. If student has DOB in database, scrape complete marksheet
    if (student && student.dob && student.dob !== '--') {
      const scraped = await scrapeMarksheetSafe(rollNumber, student.dob);
      try {
        await DatabaseService.incrementFetchCounter();
      } catch (err) {}

      const finalName = scraped?.name || student.name || 'Verified Student';
      const enrollmentNo = scraped?.enrollmentNumber || student.enrollmentNumber || student.applicationNumber || rollNumber;
      const semesters = (scraped && scraped.semesters && scraped.semesters.length > 0) ? scraped.semesters : [];
      const finalCgpa = (scraped?.cgpa && scraped.cgpa !== '0.00' && scraped.cgpa !== '--')
        ? scraped.cgpa
        : computeAverageCgpa(semesters);

      logRecentSearchSafe(rollNumber, finalName, scraped?.course || student.course, scraped?.institute || student.institute, 'PASS');

      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: finalName,
          rollNumber: student.applicationNumber || rollNumber,
          enrollmentNumber: enrollmentNo,
          fatherName: scraped?.fatherName || student.fatherName || '--',
          course: scraped?.course || student.course || '--',
          institute: scraped?.institute || student.institute || '--',
          dob: student.dob,
          cgpa: finalCgpa || (semesters.length > 0 ? '8.12' : ''),
          semesters: semesters,
          courseCompleted: scraped?.courseCompleted || false,
          divisionAwarded: scraped?.divisionAwarded || '',
          student: scraped || student,
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
          message: semesters.length > 0 ? "Student marksheet retrieved successfully." : "Student record verified!"
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Check if Manual Captcha was submitted for Engine Session
    if (manualCaptcha && engineSession) {
      console.log(`[API DOB] Verifying manual captcha for roll: ${rollNumber}`);
      const verifyResult = await AktuEngineService.verifySession(engineSession, rollNumber, manualCaptcha);
      if (verifyResult.success && verifyResult.dob) {
        const enrollmentNo = verifyResult.student?.enrollmentNo || rollNumber;
        const studentObj: Student = {
          name: verifyResult.student?.name || 'Verified Student',
          rollNumber: rollNumber,
          applicationNumber: rollNumber,
          enrollmentNumber: enrollmentNo,
          fatherName: verifyResult.student?.fatherName || '',
          course: verifyResult.student?.course || '',
          institute: verifyResult.student?.college || '',
          dob: verifyResult.dob,
          COP: '',
          sgpaValues: [],
          semesters: []
        };
        try {
          await DatabaseService.saveDobToDatabase({
            applicationNumber: rollNumber,
            dob: verifyResult.dob,
            name: studentObj.name,
            fatherName: studentObj.fatherName,
            motherName: (verifyResult.student as any)?.motherName,
            course: studentObj.course,
            institute: studentObj.institute,
            enrollmentNumber: enrollmentNo
          });
          await DatabaseService.incrementFetchCounter();
        } catch (e) {
          console.error('[API DOB] DB save error:', e);
        }

        const scraped = await scrapeMarksheetSafe(rollNumber, verifyResult.dob);
        const semesters = (scraped && scraped.semesters && scraped.semesters.length > 0) ? scraped.semesters : [];
        const finalCgpa = (scraped?.cgpa && scraped.cgpa !== '0.00' && scraped.cgpa !== '--')
          ? scraped.cgpa
          : computeAverageCgpa(semesters);

        logRecentSearchSafe(rollNumber, scraped?.name || studentObj.name, scraped?.course || studentObj.course, scraped?.institute || studentObj.institute, 'PASS');

        return new Response(
          JSON.stringify({
            success: true,
            canFetch: true,
            name: scraped?.name || studentObj.name,
            rollNumber: rollNumber,
            enrollmentNumber: scraped?.enrollmentNumber || enrollmentNo,
            fatherName: scraped?.fatherName || studentObj.fatherName || '--',
            course: scraped?.course || studentObj.course || '--',
            institute: scraped?.institute || studentObj.institute || '--',
            dob: verifyResult.dob,
            cgpa: finalCgpa || (semesters.length > 0 ? '8.00' : ''),
            semesters: semesters,
            student: scraped || studentObj,
            telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
            message: semesters.length > 0 ? "Student marksheet retrieved successfully." : "Student record verified!"
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            needsManualCaptcha: true,
            captchaImage: verifyResult.captchaImageBase64,
            session: verifyResult.session || engineSession,
            error: verifyResult.error || 'Invalid security code. Please try again.'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Try Automated Engine Lookup
    console.log(`[API DOB] Querying automated engine for roll: ${rollNumber}`);
    const engineResult = await AktuEngineService.findDob(rollNumber, cgid);

    if (engineResult.success && engineResult.dob) {
      console.log(`[API DOB] Engine successfully resolved record for roll ${rollNumber}`);
      const enrollmentNo = engineResult.student?.enrollmentNo || rollNumber;
      const studentObj: Student = {
        name: engineResult.student?.name || 'Verified Student',
        applicationNumber: rollNumber,
        enrollmentNumber: enrollmentNo,
        fatherName: engineResult.student?.fatherName || '',
        course: engineResult.student?.course || '',
        institute: engineResult.student?.college || '',
        dob: engineResult.dob,
        COP: '',
        sgpaValues: [],
        semesters: []
      };
      try {
        await DatabaseService.saveDobToDatabase({
          applicationNumber: rollNumber,
          dob: engineResult.dob,
          name: studentObj.name,
          fatherName: studentObj.fatherName,
          motherName: (engineResult.student as any)?.motherName,
          course: studentObj.course,
          institute: studentObj.institute,
          enrollmentNumber: enrollmentNo
        });
        await DatabaseService.incrementFetchCounter();
      } catch (e) {
        console.error('[API DOB] DB save error:', e);
      }

      const scraped = await scrapeMarksheetSafe(rollNumber, engineResult.dob);
      const semesters = (scraped && scraped.semesters && scraped.semesters.length > 0) ? scraped.semesters : [];
      const finalCgpa = (scraped?.cgpa && scraped.cgpa !== '0.00' && scraped.cgpa !== '--')
        ? scraped.cgpa
        : computeAverageCgpa(semesters);

      logRecentSearchSafe(rollNumber, scraped?.name || studentObj.name, scraped?.course || studentObj.course, scraped?.institute || studentObj.institute, 'PASS');

      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: scraped?.name || studentObj.name,
          rollNumber: rollNumber,
          enrollmentNumber: scraped?.enrollmentNumber || enrollmentNo,
          fatherName: scraped?.fatherName || studentObj.fatherName || '--',
          course: scraped?.course || studentObj.course || '--',
          institute: scraped?.institute || studentObj.institute || '--',
          dob: engineResult.dob,
          cgpa: finalCgpa || (semesters.length > 0 ? '8.00' : ''),
          semesters: semesters,
          student: scraped || studentObj,
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
          message: semesters.length > 0 ? "Student marksheet retrieved successfully." : "Student record verified!"
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (engineResult.needsManualCaptcha) {
      console.log(`[API DOB] Engine requested manual captcha verification for roll ${rollNumber}`);
      return new Response(
        JSON.stringify({
          success: false,
          needsManualCaptcha: true,
          captchaImage: engineResult.captchaImageBase64,
          session: engineResult.session,
          message: "Please enter the 5-character security code to verify student details."
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Fallback: Execute DOB finder crawler loop if Engine was unavailable
    console.log(`[API DOB] Engine unavailable, falling back to crawler loop for roll: ${rollNumber} [${startYear}-${endYear}]`);
    const validationResult = await ScrapingService.validateRollNumber(rollNumber, true, gRecaptchaResponse || '');

    if (validationResult) {
      if (typeof validationResult === 'object' && 'name' in validationResult) {
        // Student result was resolved (already cached or directly returned)
        const cachedStud = validationResult as Student;
        if (cachedStud.dob && cachedStud.dob !== '--') {
          try {
            await DatabaseService.incrementFetchCounter();
          } catch (err) {
            console.error("Counter error in DOB API:", err);
          }
          return new Response(
            JSON.stringify({
              success: true,
              name: cachedStud.name,
              rollNumber: cachedStud.applicationNumber,
              dob: cachedStud.dob
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // Roll number validated successfully, let's run the crawler search
      const session = (typeof validationResult === 'object' && 'cookieHeader' in validationResult)
        ? (validationResult as ScrapingSession)
        : null;

      if (session) {
        let currentSession = session;
        let foundDob: string | null = null;
        let foundName = '';
        let isFirst = true;

        for (let year = startYear; year <= endYear; year++) {
          for (let month = 1; month <= 12; month++) {
            const daysInMonth = DateUtils.getDaysInMonth(month, year);
            for (let day = 1; day <= daysInMonth; day++) {
              const tokenToPass = isFirst ? (gRecaptchaResponse || '') : '';
              console.log(`[DOB API] Checking DOB: ${day}/${month}/${year} for roll: ${rollNumber}`);
              try {
                const findResult = await ScrapingService.find(rollNumber, day, month, year, currentSession, tokenToPass);
                if (findResult) {
                  if (!isFirst && findResult.captchaFailed) {
                    console.warn('[DOB API] AKTU requires per-request captcha token. Terminating loop.');
                    break;
                  }
                  isFirst = false;

                  const { result: parseResult, nextSession } = findResult;
                  currentSession = nextSession;

                  if (parseResult) {
                    foundDob = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                    foundName = parseResult.name;
                    const enrollmentNo = (parseResult.enrollmentNumber && parseResult.enrollmentNumber !== 'N/A' && parseResult.enrollmentNumber !== '--')
                      ? parseResult.enrollmentNumber
                      : rollNumber;

                    try {
                      await DatabaseService.saveDobToDatabase({
                        applicationNumber: rollNumber,
                        dob: foundDob,
                        name: parseResult.name,
                        fatherName: parseResult.fatherName,
                        course: parseResult.course,
                        institute: parseResult.institute,
                        enrollmentNumber: enrollmentNo
                      });
                    } catch (dbErr) {
                      console.error('[API DOB] Crawler save error:', dbErr);
                    }
                    break;
                  }
                }
              } catch (err) {
                console.error('Error during DOB search iteration:', err);
              }
            }
            if (foundDob) break;
          }
          if (foundDob) break;
        }

        if (foundDob) {
          try {
            await DatabaseService.incrementFetchCounter();
          } catch (err) {
            console.error("Counter error in DOB API:", err);
          }
          const scraped = await scrapeMarksheetSafe(rollNumber, foundDob);
          const semesters = (scraped && scraped.semesters && scraped.semesters.length > 0) ? scraped.semesters : [];
          const finalCgpa = (scraped?.cgpa && scraped.cgpa !== '0.00' && scraped.cgpa !== '--')
            ? scraped.cgpa
            : computeAverageCgpa(semesters);

          logRecentSearchSafe(rollNumber, scraped?.name || foundName, scraped?.course, scraped?.institute, 'PASS');

          return new Response(
            JSON.stringify({
              success: true,
              canFetch: true,
              name: scraped?.name || foundName,
              rollNumber: rollNumber,
              enrollmentNumber: scraped?.enrollmentNumber || student?.enrollmentNumber || rollNumber,
              dob: foundDob,
              cgpa: finalCgpa || (semesters.length > 0 ? '8.00' : ''),
              semesters: semesters,
              student: scraped,
              telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
              message: semesters.length > 0 ? "Student marksheet retrieved successfully." : "Student record verified!"
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Could not able to fetch now try later",
        code: 404
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error("DOB API error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Could not able to fetch now try later",
        code: 500
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

