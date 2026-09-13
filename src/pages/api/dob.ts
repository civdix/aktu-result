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

    if (student && student.dob && student.dob !== '--') {
      try {
        await DatabaseService.incrementFetchCounter();
      } catch (err) {
        console.error("Counter error in DOB API:", err);
      }
      const finalName = student.name || 'Verified Student';
      const enrollmentNo = student.enrollmentNumber || student.applicationNumber || rollNumber;

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
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
          message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
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
        return new Response(
          JSON.stringify({
            success: true,
            canFetch: true,
            name: studentObj.name,
            rollNumber: rollNumber,
            enrollmentNumber: enrollmentNo,
            fatherName: studentObj.fatherName || '--',
            course: studentObj.course || '--',
            institute: studentObj.institute || '--',
            telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
            message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
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
      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: studentObj.name,
          rollNumber: rollNumber,
          enrollmentNumber: enrollmentNo,
          fatherName: studentObj.fatherName || '--',
          course: studentObj.course || '--',
          institute: studentObj.institute || '--',
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${rollNumber}`,
          message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
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
          return new Response(
            JSON.stringify({
              success: true,
              name: foundName,
              rollNumber: rollNumber,
              enrollmentNumber: student?.enrollmentNumber || rollNumber,
              dob: foundDob
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

