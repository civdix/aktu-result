import type { APIRoute } from 'astro';

export const prerender = false;

// Simple Levenshtein distance helper to compute string matches
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export const GET: APIRoute = async ({ request, url }) => {
  const name = url.searchParams.get('name');
  if (name) {
    const syntheticReq = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        admissionYear: url.searchParams.get('admissionYear') || url.searchParams.get('year') || undefined,
        collegeCode: url.searchParams.get('collegeCode') || url.searchParams.get('college') || undefined,
        branchCode: url.searchParams.get('branchCode') || url.searchParams.get('branch') || undefined
      })
    });
    return POST({ request: syntheticReq } as any);
  }

  return new Response(
    JSON.stringify({
      success: true,
      service: "AKTU Roll Number Finder API",
      status: "online",
      usage: "Send POST with { name, admissionYear, collegeCode, branchCode } or GET with query params."
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    let name: string | undefined;
    let admissionYear: string | undefined;
    let collegeCode: string | undefined;
    let branchCode: string | undefined;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json();
        name = body?.name;
        admissionYear = body?.admissionYear;
        collegeCode = body?.collegeCode;
        branchCode = body?.branchCode;
      } catch (e) {
        // Parse error
      }
    } else {
      try {
        const text = await request.text();
        if (text) {
          if (text.trim().startsWith('{')) {
            const body = JSON.parse(text);
            name = body?.name;
            admissionYear = body?.admissionYear;
            collegeCode = body?.collegeCode;
            branchCode = body?.branchCode;
          } else {
            const params = new URLSearchParams(text);
            name = params.get('name') || undefined;
            admissionYear = params.get('admissionYear') || undefined;
            collegeCode = params.get('collegeCode') || undefined;
            branchCode = params.get('branchCode') || undefined;
          }
        }
      } catch (e) {
        // Parse error
      }
    }

    if (!admissionYear || !collegeCode || !branchCode) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: admissionYear, collegeCode, and branchCode",
          code: 400
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Standardize filters:
    const yearStr = admissionYear.trim().slice(-2);
    const collegeStr = collegeCode.trim().padStart(4, '0');
    const branchStr = branchCode.trim().padStart(3, '0');
    const prefix = `${yearStr}${collegeStr}${branchStr}`;

    const searchName = name ? name.trim().toUpperCase() : '';

    // Database cache disabled for roll number finder
    let cachedMatches: any[] = [];
    let minValidSerial = 9999;
    let maxValidSerial = 0;

    // Always scan ERP directly as database cache is disabled for finder
    const liveMatches: any[] = [];

    if (true) {
      console.log(`[ERP SCAN] Initiating live ERP scan for prefix ${prefix}.`);
      const erpUrl = "https://erp.aktu.ac.in/WebPages/StudentServices/frmStudentGrievanceForm.aspx";

      // Set headers
      const erpHeaders: Record<string, string> = {
        "accept": "*/*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        "origin": "https://erp.aktu.ac.in",
        "referer": erpUrl,
        "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "x-microsoftajax": "Delta=true",
        "x-requested-with": "XMLHttpRequest"
      };

      try {
        // 1. Fetch main page with cookie-aware redirect support (handles AspxAutoDetectCookieSupport=1 302 redirect)
        const initResp = await fetch(erpUrl, {
          headers: {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "user-agent": erpHeaders["user-agent"]
          },
          redirect: "manual"
        });

        const cookie1 = initResp.headers.get("set-cookie");
        const redirectLoc = initResp.headers.get("location");

        let mainHtml = "";
        let sessionCookies = "";

        if (redirectLoc) {
          const nextUrl = new URL(redirectLoc, erpUrl).toString();
          const cookieHeader = cookie1 ? cookie1.split(";")[0] : "";
          const secondResp = await fetch(nextUrl, {
            headers: {
              "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "user-agent": erpHeaders["user-agent"],
              "cookie": cookieHeader
            }
          });
          const cookie2 = secondResp.headers.get("set-cookie") || "";
          sessionCookies = [cookie1, cookie2].filter(Boolean).map(c => c!.split(";")[0]).join("; ");
          mainHtml = await secondResp.text();
        } else {
          sessionCookies = cookie1 ? cookie1.split(";")[0] : "";
          mainHtml = await initResp.text();
        }

        // Retrieve ASP.NET variables
        const viewstateMatch = mainHtml.match(/id="__VIEWSTATE"\s+value="([^"]*)"/);
        const viewstateGenMatch = mainHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/);

        const viewstate = viewstateMatch ? viewstateMatch[1] : '';
        const viewstateGenerator = viewstateGenMatch ? viewstateGenMatch[1] : '';

        erpHeaders["cookie"] = sessionCookies;
        erpHeaders["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";

        // Helper to extract student name from ASP.NET ViewState or AJAX response
        const parseStudentName = (resText: string, roll: string): string => {
          if (resText.includes("There is no row at position 0") || resText.includes("no row at position 0")) {
            return '';
          }

          // 1. Extract from LosFormatter ViewState string
          const vsPart = resText.match(/\|__VIEWSTATE\|([^|]+)\|/);
          if (vsPart) {
            try {
              const buf = Buffer.from(vsPart[1], 'base64');
              const str = buf.toString('latin1');
              const rollIndex = str.indexOf(roll);
              if (rollIndex !== -1) {
                const afterRoll = str.slice(rollIndex + roll.length);
                const ddIndex = afterRoll.indexOf('dd');
                if (ddIndex !== -1) {
                  const namePart = afterRoll.slice(ddIndex + 2);
                  const nextDd = namePart.indexOf('dd');
                  if (nextDd !== -1) {
                    const rawName = namePart.slice(0, nextDd).replace(/^[^A-Za-z\s]+/, '').trim();
                    if (rawName && rawName.length >= 2 && rawName.length <= 60) {
                      return rawName.toUpperCase();
                    }
                  }
                }
              }
            } catch (e) {
              // fallback to regex parsing below
            }
          }

          // 2. Extract from input tag if full HTML returned
          const inputMatch = resText.match(/<input[^>]*id="ContentPlaceHolder1_txtStudentName"[^>]*>/i) ||
            resText.match(/<input[^>]*name="ctl00\$ContentPlaceHolder1\$txtStudentName"[^>]*>/i);
          const valueMatch = inputMatch ? inputMatch[0].match(/value="([^"]*)"/i) : null;
          if (valueMatch && valueMatch[1].trim()) {
            return valueMatch[1].trim().toUpperCase();
          }

          return '';
        };

        // 2. Query student records in parallel batches of 20
        // Covers standard class serials 1 through 140
        const serialsToScan = Array.from({ length: 140 }, (_, i) => i + 1);

        let batchIndex = 0;
        const batchSize = 20;
        let shouldStop = false;

        while (batchIndex < serialsToScan.length && !shouldStop) {
          const batchSerials = serialsToScan.slice(batchIndex, batchIndex + batchSize);
          if (batchSerials.length === 0) break;

          const batchPromises = batchSerials.map(async (s) => {
            const studentRoll = `${prefix}${String(s).padStart(4, '0')}`;
            const payload = new URLSearchParams({
              "ctl00$ScriptManager1": "ctl00$ContentPlaceHolder1$upForm|ctl00$ContentPlaceHolder1$txtApplicantId",
              "ctl00$ContentPlaceHolder1$txtMobileNo": "",
              "ctl00$ContentPlaceHolder1$txtEmailId": "",
              "ctl00$ContentPlaceHolder1$ddlStudentType": "Existing Student",
              "ctl00$ContentPlaceHolder1$txtApplicantId": studentRoll,
              "ctl00$ContentPlaceHolder1$txtStudentName": "",
              "ctl00$ContentPlaceHolder1$ddlGrievanceCategory": "",
              "ctl00$ContentPlaceHolder1$txtGrievance": "",
              "__EVENTTARGET": "ctl00$ContentPlaceHolder1$txtApplicantId",
              "__EVENTARGUMENT": "",
              "__LASTFOCUS": "",
              "__VIEWSTATE": viewstate,
              "__VIEWSTATEGENERATOR": viewstateGenerator,
              "__ASYNCPOST": "true"
            });

            let attempt = 0;
            const maxAttempts = 3;
            let text = '';
            let success = false;

            while (attempt < maxAttempts && !success) {
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

                const postResp = await fetch(erpUrl, {
                  method: 'POST',
                  headers: erpHeaders,
                  body: payload.toString(),
                  signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                text = await postResp.text();

                const isValid = text.includes("There is no row at position 0") || 
                                text.includes("no row at position 0") || 
                                text.includes("__VIEWSTATE") ||
                                text.includes("ContentPlaceHolder1_txtStudentName");

                if (isValid) {
                  success = true;
                } else {
                  attempt++;
                  if (attempt < maxAttempts) {
                    await new Promise(r => setTimeout(r, 600));
                  }
                }
              } catch (err) {
                attempt++;
                if (attempt < maxAttempts) {
                  await new Promise(r => setTimeout(r, 600));
                }
              }
            }

            return { serial: s, roll: studentRoll, text, success };
          });

          const batchResults = await Promise.all(batchPromises);

          let validInBatchCount = 0;

          for (const res of batchResults) {
            if (!res.success) continue;

            const studentName = parseStudentName(res.text, res.roll);
            if (studentName) {
              validInBatchCount++;
              minValidSerial = Math.min(minValidSerial, res.serial);
              maxValidSerial = Math.max(maxValidSerial, res.serial);

              if (!searchName || studentName.includes(searchName)) {
                liveMatches.push({
                  name: studentName,
                  rollNumber: res.roll,
                  source: 'live'
                });
              }
            }
          }

          // If we've already found some students and hit an entirely empty batch past serial 30, stop scanning
          if (validInBatchCount === 0 && maxValidSerial > 0 && batchSerials[0] > 30) {
            shouldStop = true;
          }

          batchIndex += batchSize;
        }
      } catch (erpFetchErr) {
        console.error("Failed executing live ERP grievance search:", erpFetchErr);
      }
    }

    // Merge cached and live results, keeping unique ones
    const uniqueMatchesMap = new Map<string, any>();

    // Add cached first
    for (const match of cachedMatches) {
      uniqueMatchesMap.set(match.rollNumber, match);
    }
    // Add or override with live
    for (const match of liveMatches) {
      uniqueMatchesMap.set(match.rollNumber, match);
    }

    let finalMatches = Array.from(uniqueMatchesMap.values());

    // Sort by name similarity if a query name was provided
    if (searchName) {
      finalMatches.sort((x, y) => {
        // Boost exact matches or substring starts
        const xStarts = x.name.startsWith(searchName) ? 1 : 0;
        const yStarts = y.name.startsWith(searchName) ? 1 : 0;
        if (xStarts !== yStarts) {
          return yStarts - xStarts;
        }

        const xDistance = getLevenshteinDistance(x.name, searchName);
        const yDistance = getLevenshteinDistance(y.name, searchName);
        return xDistance - yDistance;
      });
    }

    // Return all discovered class students without slicing or limiting output count

    const rangeStart = maxValidSerial > 0
      ? `${prefix}${String(minValidSerial).padStart(4, '0')}`
      : `${prefix}0001`;

    const rangeEnd = maxValidSerial > 0
      ? `${prefix}${String(maxValidSerial).padStart(4, '0')}`
      : `${prefix}0120`;

    return new Response(
      JSON.stringify({
        success: true,
        prefix,
        rangeStart,
        rangeEnd,
        matches: finalMatches
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error: any) {
    console.error("API find-roll error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to process roll number lookups",
        code: 500
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
