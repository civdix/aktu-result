import type { APIRoute } from 'astro';
import { AktuEngineService } from '../../services/engine.service';
import type { Student } from '../../interfaces';

export const prerender = false;

// Helper to dynamically calculate overall status and division based on semesters
const calculateOverallStatusAndDivision = (semesters: any[], defaultCgpa: string) => {
  let hasBack = false;
  let hasFail = false;
  let hasGrace = false;

  semesters.forEach((sem) => {
    const status = sem.status.toUpperCase();
    if (status.includes("PCP") || status.includes("CP") || status.includes("FAIL")) {
      hasBack = true;
    }
    if (status.includes("FAIL")) {
      hasFail = true;
    }
    if (status.includes("PWG")) {
      hasGrace = true;
    }

    if (sem.subjects) {
      sem.subjects.forEach((sub: any) => {
        if (sub.grade === "F" || (sub.back && sub.back !== "--")) {
          hasBack = true;
        }
      });
    }
  });

  let overallStatus = "PASS";
  const cgpa = parseFloat(defaultCgpa);

  if (hasFail) {
    overallStatus = "FAIL";
  } else if (hasBack) {
    overallStatus = "PCP";
  } else if (hasGrace) {
    overallStatus = "PWG";
  }

  return overallStatus;
};

async function findStudentInDatabase(rollNumber: string): Promise<Student | null> {
  try {
    const { DatabaseService } = await import('../../database/database.service');
    return await DatabaseService.findInDatabase(rollNumber);
  } catch (error) {
    console.warn('Database lookup unavailable in this runtime:', error);
    return null;
  }
}

async function incrementFetchCounterSafe(): Promise<number> {
  try {
    const { DatabaseService } = await import('../../database/database.service');
    return await DatabaseService.incrementFetchCounter();
  } catch (error) {
    console.warn('Fetch counter unavailable in this runtime:', error);
    return 0;
  }
}

async function saveDobSafe(data: any): Promise<void> {
  try {
    const { DatabaseService } = await import('../../database/database.service');
    await DatabaseService.saveDobToDatabase(data);
  } catch (e: any) {
    console.warn('[Search] Failed to persist student record:', e.message);
  }
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
    const contentType = request.headers.get('content-type') || '';
    let rollNumber: string | undefined;
    let action: string | undefined;
    let manualCaptcha: string | undefined;
    let engineSession: any | undefined;
    let cgid: number | undefined;

    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        rollNumber = body?.rollNumber;
        action = body?.action;
        manualCaptcha = body?.manualCaptcha || body?.captchaText;
        engineSession = body?.engineSession || body?.session;
        if (body?.cgid !== undefined) cgid = parseInt(body.cgid);
      } catch (e) {
        // JSON parsing error
      }
    } else {
      try {
        const text = await request.text();
        if (text) {
          if (text.trim().startsWith('{')) {
            const body = JSON.parse(text);
            rollNumber = body?.rollNumber;
            action = body?.action;
            manualCaptcha = body?.manualCaptcha || body?.captchaText;
            engineSession = body?.engineSession || body?.session;
            if (body?.cgid !== undefined) cgid = parseInt(body.cgid);
          } else {
            const params = new URLSearchParams(text);
            rollNumber = params.get('rollNumber') || undefined;
            action = params.get('action') || undefined;
            manualCaptcha = params.get('manualCaptcha') || params.get('captchaText') || undefined;
            const cid = params.get('cgid');
            if (cid) cgid = parseInt(cid);
          }
        }
      } catch (e) {
        // Fallback parsing error
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

    const trimmedRoll = rollNumber.trim();

    // Action: Refresh Captcha Image
    if (action === 'refreshCaptcha') {
      const fresh = await AktuEngineService.startSession(trimmedRoll, undefined, cgid);
      if (fresh.session && fresh.captchaImageBase64) {
        return new Response(
          JSON.stringify({
            success: false,
            needsManualCaptcha: true,
            captchaImage: fresh.captchaImageBase64,
            session: fresh.session,
            message: "New security verification code loaded."
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 1: Query MongoDB for existing cached student record
    let student: Student | null = null;
    try {
      student = await findStudentInDatabase(trimmedRoll);
    } catch (dbError) {
      console.error("DB Query Error:", dbError);
    }

    // If student has record or full semester results cached in database, return immediately!
    if (student && ((student.dob && student.dob !== '--') || (student.semesters && student.semesters.length > 0))) {
      let totalSearches = 0;
      try {
        totalSearches = await incrementFetchCounterSafe();
      } catch (err) {}

      const finalName = student.name || 'Verified Student';
      const enrollmentNo = student.enrollmentNumber || student.applicationNumber || trimmedRoll;

      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: finalName,
          rollNumber: trimmedRoll,
          enrollmentNumber: enrollmentNo,
          fatherName: student.fatherName || '--',
          course: student.course || '--',
          institute: student.institute || '--',
          dob: student.dob || '',
          cgpa: student.cgpa || '',
          semesters: student.semesters || [],
          courseCompleted: student.courseCompleted || false,
          divisionAwarded: student.divisionAwarded || '',
          finalResultHtml: student.finalResultHtml || '',
          student: student,
          totalSearches,
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${trimmedRoll}`,
          message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Step 2: Handle manual 5-character security code submission
    if (manualCaptcha && engineSession) {
      console.log(`[Search API] Verifying security code for roll: ${trimmedRoll}`);
      const verifyRes = await AktuEngineService.verifySession(engineSession, trimmedRoll, manualCaptcha);

      if (verifyRes.success && verifyRes.dob) {
        const enrollmentNo = verifyRes.student?.enrollmentNo || trimmedRoll;
        const studentObj: Student = {
          name: verifyRes.student?.name || 'Verified Student',
          rollNumber: trimmedRoll,
          applicationNumber: trimmedRoll,
          enrollmentNumber: enrollmentNo,
          fatherName: verifyRes.student?.fatherName || '',
          course: verifyRes.student?.course || '',
          institute: verifyRes.student?.college || '',
          dob: verifyRes.dob,
          COP: '',
          sgpaValues: [],
          semesters: []
        };

        // Cache in DB so we never have to fetch twice
        await saveDobSafe({
          applicationNumber: trimmedRoll,
          dob: verifyRes.dob,
          name: studentObj.name,
          fatherName: studentObj.fatherName,
          motherName: (verifyRes.student as any)?.motherName,
          course: studentObj.course,
          institute: studentObj.institute,
          enrollmentNumber: enrollmentNo
        });
        await incrementFetchCounterSafe();

        return new Response(
          JSON.stringify({
            success: true,
            canFetch: true,
            name: studentObj.name,
            rollNumber: trimmedRoll,
            enrollmentNumber: enrollmentNo,
            fatherName: studentObj.fatherName || '--',
            course: studentObj.course || '--',
            institute: studentObj.institute || '--',
            dob: studentObj.dob || '',
            cgpa: '',
            semesters: [],
            courseCompleted: false,
            divisionAwarded: '',
            finalResultHtml: '',
            student: studentObj,
            telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${trimmedRoll}`,
            message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            needsManualCaptcha: true,
            captchaImage: verifyRes.captchaImageBase64,
            session: verifyRes.session || engineSession,
            error: verifyRes.error || 'Invalid verification code. Please try again.'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 3: Run Automated Discovery via AktuEngineService
    console.log(`[Search API] Querying automated engine for roll: ${trimmedRoll}`);
    const engineResult = await AktuEngineService.findDob(trimmedRoll, cgid);

    if (engineResult.success && engineResult.dob) {
      console.log(`[Search API] Engine resolved record for roll ${trimmedRoll}`);
      const enrollmentNo = engineResult.student?.enrollmentNo || trimmedRoll;
      const studentObj: Student = {
        name: engineResult.student?.name || 'Verified Student',
        applicationNumber: trimmedRoll,
        enrollmentNumber: enrollmentNo,
        fatherName: engineResult.student?.fatherName || '',
        course: engineResult.student?.course || '',
        institute: engineResult.student?.college || '',
        dob: engineResult.dob,
        COP: '',
        sgpaValues: [],
        semesters: []
      };

      // Save in DB so we never have to fetch twice
      await saveDobSafe({
        applicationNumber: trimmedRoll,
        dob: engineResult.dob,
        name: studentObj.name,
        fatherName: studentObj.fatherName,
        motherName: (engineResult.student as any)?.motherName,
        course: studentObj.course,
        institute: studentObj.institute,
        enrollmentNumber: enrollmentNo
      });
      await incrementFetchCounterSafe();

      return new Response(
        JSON.stringify({
          success: true,
          canFetch: true,
          name: studentObj.name,
          rollNumber: trimmedRoll,
          enrollmentNumber: enrollmentNo,
          fatherName: studentObj.fatherName || '--',
          course: studentObj.course || '--',
          institute: studentObj.institute || '--',
          dob: studentObj.dob || '',
          cgpa: '',
          semesters: [],
          courseCompleted: false,
          divisionAwarded: '',
          finalResultHtml: '',
          student: studentObj,
          telegramBotUrl: `https://t.me/akturesultwithoutdobbot?start=${trimmedRoll}`,
          message: "Student record verified! You can access your full result and official marksheet via our Telegram Bot."
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (engineResult.needsManualCaptcha) {
      console.log(`[Search API] Engine requested manual 5-character captcha code for roll ${trimmedRoll}`);
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

    return new Response(
      JSON.stringify({
        success: false,
        error: engineResult.error || "Could not retrieve student details for this roll number. Please verify the roll number and try again.",
        code: 404
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error("Search API error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "An unexpected error occurred. Please try again later.",
        code: 500
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
