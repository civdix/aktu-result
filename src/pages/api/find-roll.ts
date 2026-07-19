import type { APIRoute } from 'astro';
import { DatabaseService } from '../../database/database.service';

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

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "Method Not Allowed. Please send a POST request with parameters in the JSON body.",
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

    // First try searching in local database cache
    let cachedMatches: any[] = [];
    let minValidSerial = 9999;
    let maxValidSerial = 0;

    try {
      const dbMatches = await DatabaseService.searchByNameAndFilters(
        searchName,
        yearStr,
        collegeStr,
        branchStr
      );
      cachedMatches = dbMatches.map(m => {
        const roll = m.applicationNumber;
        const serialStr = roll.slice(-4);
        const serialVal = parseInt(serialStr, 10);
        if (!isNaN(serialVal)) {
          minValidSerial = Math.min(minValidSerial, serialVal);
          maxValidSerial = Math.max(maxValidSerial, serialVal);
        }
        return {
          name: m.name,
          rollNumber: roll,
          source: 'cache'
        };
      });
    } catch (err) {
      console.error("Local database cache query error:", err);
    }

    // Determine host and count cached records to enforce localhost only and single scan rule
    const host = request.headers.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    const cachedCount = await DatabaseService.countByFilters(yearStr, collegeStr, branchStr);
    const alreadyScanned = cachedCount > 0;

    const liveMatches: any[] = [];

    // Only run live ERP scanning if host is localhost and the class hasn't been scanned/cached yet
    if (isLocalhost && !alreadyScanned) {
      console.log(`[ERP SCAN] Initiating live ERP scan for prefix ${prefix} on localhost.`);
      const erpUrl = "https://erp.aktu.ac.in/WebPages/StudentServices/frmStudentGrievanceForm.aspx";

      // Set headers
      const erpHeaders: any = {
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
        "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
        "x-microsoftajax": "Delta=true",
        "x-requested-with": "XMLHttpRequest"
      };

      try {
        // 1. Fetch main page to initialize session and retrieve VIEWSTATE parameters
        const getResp = await fetch(erpUrl, { headers: erpHeaders });
        const getHtml = await getResp.text();

        // Retrieve ASP.NET variables
        const viewstateMatch = getHtml.match(/id="__VIEWSTATE"\s+value="([^"]*)"/);
        const viewstateGenMatch = getHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"/);

        const viewstate = viewstateMatch ? viewstateMatch[1] : '';
        const viewstateGenerator = viewstateGenMatch ? viewstateGenMatch[1] : '';
        const sessionCookie = getResp.headers.get('set-cookie') || '';

        if (sessionCookie) {
          erpHeaders["cookie"] = sessionCookie.split(';')[0];
        }
        erpHeaders["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";

        // 2. Query student records in parallel batches of 20
        const serialsToScan = [
          ...Array.from({ length: 40 }, (_, i) => i + 1),     // 1 to 40 (lateral/small course range)
          ...Array.from({ length: 120 }, (_, i) => i + 100)   // 100 to 219 (regular course range)
        ];

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
                                text.includes("ContentPlaceHolder1_txtStudentName") ||
                                text.includes("txtStudentName");

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
          let isRegularBatch = false;

          for (const res of batchResults) {
            if (res.serial >= 100) {
              isRegularBatch = true;
            }

            if (!res.success) continue;

            const isEmpty = res.text.includes("There is no row at position 0") || res.text.includes("no row at position 0");
            if (!isEmpty) {
              validInBatchCount++;
            } else {
              continue;
            }
            // Parse student name from the input tag value attribute
            const inputMatch = res.text.match(/<input[^>]*id="ContentPlaceHolder1_txtStudentName"[^>]*>/i) ||
              res.text.match(/<input[^>]*name="ctl00\$ContentPlaceHolder1\$txtStudentName"[^>]*>/i);
            const valueMatch = inputMatch ? inputMatch[0].match(/value="([^"]*)"/i) : null;
            const studentName = valueMatch ? valueMatch[1].trim().toUpperCase() : '';
            console.log("Student Name: ", studentName);
            if (studentName) {
              minValidSerial = Math.min(minValidSerial, res.serial);
              maxValidSerial = Math.max(maxValidSerial, res.serial);

              // Save dynamically discovered record to MongoDB
              DatabaseService.saveToDatabase({
                applicationNumber: res.roll,
                name: studentName,
                rollNumber: res.roll,
                gender: "--",
                fatherName: "--",
                course: "AKTU Student",
                institute: `College Code ${collegeStr}`,
                verified: true,
                dobFound: false,
                cgpa: "0.00",
                semesters: []
              }).catch(dbErr => {
                console.error("Failed to cache dynamic student name to db:", dbErr);
              });

              // If searchName is blank (no filter name) or studentName matches query pattern, include it
              if (!searchName || studentName.includes(searchName)) {
                liveMatches.push({
                  name: studentName,
                  rollNumber: res.roll,
                  source: 'live'
                });
              }
            }
          }

          // Only stop scanning regular batches if we've already found some students (class start boundary identified)
          // AND this regular batch has 0 valid students (class end boundary identified).
          if (isRegularBatch && validInBatchCount === 0 && maxValidSerial >= 100) {
            shouldStop = true;
          }

          batchIndex += batchSize;
        }
      } catch (erpFetchErr) {
        console.error("Failed executing live ERP grievance search:", erpFetchErr);
      }
    } else {
      console.log(`[ERP SCAN] Skipping live ERP scan for prefix ${prefix} (isLocalhost=${isLocalhost}, alreadyScanned=${alreadyScanned}).`);
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

    // Limit output count to prevent frontend clutter
    finalMatches = finalMatches.slice(0, 15);

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
