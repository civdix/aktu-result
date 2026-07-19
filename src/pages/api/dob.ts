import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';
import { ScrapingService } from '../../scraping/scraping.service';
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
    let startYear = 2000;
    let endYear = 2006;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        rollNumber = body?.rollNumber;
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
            if (body?.startYear !== undefined) startYear = parseInt(body.startYear);
            if (body?.endYear !== undefined) endYear = parseInt(body.endYear);
          } else {
            const params = new URLSearchParams(text);
            rollNumber = params.get('rollNumber') || undefined;
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
      return new Response(
        JSON.stringify({
          success: true,
          name: student.name,
          rollNumber: student.applicationNumber,
          dob: student.dob
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 4. Execute DOB finder crawler loop
    console.log(`Executing validation and DOB finder loop for roll number: ${rollNumber} [${startYear}-${endYear}]`);
    const validationResult = await ScrapingService.validateRollNumber(rollNumber, true);

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

        for (let year = startYear; year <= endYear; year++) {
          for (let month = 1; month <= 12; month++) {
            const daysInMonth = DateUtils.getDaysInMonth(month, year);
            for (let day = 1; day <= daysInMonth; day++) {
              console.log(`[DOB API] Checking DOB: ${day}/${month}/${year} for roll: ${rollNumber}`);
              try {
                const findResult = await ScrapingService.find(rollNumber, day, month, year, currentSession);
                if (findResult) {
                  const { result: parseResult, nextSession } = findResult;
                  currentSession = nextSession;

                  if (parseResult) {
                    foundDob = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                    foundName = parseResult.name;

                    const studentResult: Student = {
                      ...parseResult,
                      dob: foundDob
                    };

                    await DatabaseService.saveToDatabase(studentResult);
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
