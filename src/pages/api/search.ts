import type { APIRoute } from 'astro';
import { shivamSemesters, genericSemesters } from '../../utils/mockData';

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

import { ScrapingService } from '../../scraping/scraping.service';
import { DateUtils } from '../../utils/date.utils';
import type { Student, ScrapingSession } from '../../interfaces';

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

    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        rollNumber = body?.rollNumber;
      } catch (e) {
        // JSON parsing error
      }
    } else {
      // Fallback: try parsing request as raw text
      try {
        const text = await request.text();
        if (text) {
          if (text.trim().startsWith('{')) {
            const body = JSON.parse(text);
            rollNumber = body?.rollNumber;
          } else {
            const params = new URLSearchParams(text);
            rollNumber = params.get('rollNumber') || undefined;
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



    // 2. Query MongoDB for student record
    let student = null;
    try {
      student = await findStudentInDatabase(rollNumber);
    } catch (dbError) {
      console.error("DB Query Error:", dbError);
    }

    // 3. Try to fetch result using DOB bypass flow if student is not found or is a skeleton record
    const isSkeleton = student && (!student.semesters || student.semesters.length === 0);
    if (!student || isSkeleton) {
      console.log(`Roll number ${rollNumber} not found or has no semester data. Executing DOB bypass flow...`);
      const scrapedStudent = await ScrapingService.fetchResultWithBypass(rollNumber);
      if (scrapedStudent) {
        student = scrapedStudent;
      }
    }

    if (student) {
      let totalSearches = 0;
      try {
        totalSearches = await incrementFetchCounterSafe();
      } catch (err) {
        console.error("Counter error:", err);
      }
      const mappedSemesters = student.semesters || (student.sgpaValues || []).map((sgpa, idx) => ({
        sem: `Semester ${idx + 1}`,
        sgpa: sgpa || "0.00",
        status: "PASS",
        marks: "--",
        subjects: []
      }));

      const hasCOP = student.COP && student.COP !== "N/A" && student.COP !== "0" && student.COP !== "";
      const status = hasCOP ? "PCP" : "PASS";

      return new Response(
        JSON.stringify({
          success: true,
          name: student.name,
          rollNumber: student.applicationNumber,
          fatherName: student.fatherName || "--",
          enrollmentNumber: student.enrollmentNumber || "--",
          course: student.course || "B.Tech Student",
          institute: student.institute || "--",
          cgpa: student.cgpa || student.sgpaValues?.[student.sgpaValues.length - 1] || "0.00",
          status: status,
          semesters: mappedSemesters,
          totalSearches,
          courseCompleted: student.courseCompleted || false,
          divisionAwarded: student.divisionAwarded || "",
          finalResultHtml: student.finalResultHtml || ""
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 4. Return fetch failure message
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
    console.error("API error:", error);
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
