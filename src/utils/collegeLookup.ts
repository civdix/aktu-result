import collegesData from '../data/colleges.json';

// In-memory index of AKTU college codes to names
const collegeMap = new Map<string, string>();

collegesData.forEach((c: any) => {
  if (c.code) {
    const rawCode = String(c.code).trim();
    collegeMap.set(rawCode, c.name);
    collegeMap.set(rawCode.padStart(3, '0'), c.name);
    collegeMap.set(rawCode.replace(/^0+/, ''), c.name);
  }
});

// Prominent college short names for clean, responsive display on ticker pills
const PROMINENT_COLLEGES: Record<string, string> = {
  '001': 'Anand Engg College, Agra',
  '002': 'Agra College, Agra',
  '004': 'RBS Campus, Agra',
  '010': 'UCER Prayagraj',
  '011': 'UIM Prayagraj',
  '027': 'AKGEC Ghaziabad',
  '029': 'KIET Ghaziabad',
  '030': 'IPEC Ghaziabad',
  '032': 'ABES EC Ghaziabad',
  '033': 'RKGIT Ghaziabad',
  '043': 'BIET Jhansi',
  '046': 'MPEC Kanpur',
  '052': 'IET Lucknow',
  '054': 'BBDNITM Lucknow',
  '065': 'BSA College, Mathura',
  '068': 'MIET Meerut',
  '091': 'JSS Noida',
  '097': 'Galgotias College',
  '104': 'KNIT Sultanpur',
  '109': 'GCET Greater Noida',
  '120': 'IMS Ghaziabad',
  '122': 'SRMCM Lucknow',
  '133': 'NIET Greater Noida',
  '151': 'IMS Engg Ghaziabad',
  '161': 'ITS Greater Noida',
  '164': 'PSIT Kanpur',
  '192': 'GL Bajaj, Mathura',
  '211': 'REC Bijnor',
  '214': 'KCC ITM Greater Noida',
  '222': 'IERT Prayagraj',
  '290': 'ABESIT Ghaziabad',
  '736': 'REC Mainpuri',
  '840': 'REC Ambedkar Nagar',
  '841': 'REC Kannauj',
  '842': 'REC Mainpuri',
  '843': 'REC Sonbhadra',
  '844': 'REC Banda',
  '845': 'REC Azamgarh'
};

// Branch code mapping in AKTU roll numbers (digits 6-8 in 13-digit format)
const BRANCH_CODES: Record<string, string> = {
  '010': 'B.Tech CSE',
  '012': 'B.Tech CS',
  '013': 'B.Tech ECE',
  '014': 'B.Tech IT',
  '019': 'B.Tech AI/ML',
  '020': 'B.Tech EE',
  '021': 'B.Tech EN',
  '030': 'B.Tech Civil',
  '040': 'B.Tech ME',
  '050': 'B.Pharma',
  '070': 'MBA',
  '084': 'MCA',
  '085': 'B.Tech Data Science'
};

/**
 * Accurately extracts and aligns the AKTU College Name from the roll number.
 * Ensures the college displayed on the UI strictly matches the roll number's encoded college code.
 */
export function resolveCollegeByRoll(rollNumber: string, fallbackInstitute?: string): string {
  if (!rollNumber) return fallbackInstitute || 'AKTU Affiliated Institute';

  const clean = rollNumber.replace(/[^0-9]/g, '');

  if (clean.length >= 6) {
    // 13/14-digit standard format: positions 2-5 represent college code (e.g. 24 0052 010 0001 -> 0052 -> 052)
    const sub4 = clean.slice(2, 6);
    const norm3 = sub4.replace(/^0+/, '').padStart(3, '0');
    const normRaw = sub4.replace(/^0+/, '');

    // 1. Check verified short names
    if (PROMINENT_COLLEGES[norm3]) return PROMINENT_COLLEGES[norm3];
    if (PROMINENT_COLLEGES[sub4]) return PROMINENT_COLLEGES[sub4];
    if (PROMINENT_COLLEGES[normRaw]) return PROMINENT_COLLEGES[normRaw];

    // 2. Check full college directory
    let matchedName = collegeMap.get(norm3) || collegeMap.get(sub4) || collegeMap.get(normRaw);
    if (matchedName) {
      return matchedName.replace(/\s*\(.*?\)\s*/g, '').replace(/,\s*/g, ', ').slice(0, 32);
    }

    // 10-digit legacy format: positions 2-4 represent college code (e.g. 15 032 10 045)
    if (clean.length === 10) {
      const sub3 = clean.slice(2, 5);
      const normSub3 = sub3.replace(/^0+/, '').padStart(3, '0');
      if (PROMINENT_COLLEGES[normSub3]) return PROMINENT_COLLEGES[normSub3];
      matchedName = collegeMap.get(normSub3);
      if (matchedName) {
        return matchedName.replace(/\s*\(.*?\)\s*/g, '').replace(/,\s*/g, ', ').slice(0, 32);
      }
    }
  }

  // If fallback institute is provided and is a specific name, use it
  if (fallbackInstitute && !fallbackInstitute.includes('Affiliated') && fallbackInstitute !== '--' && fallbackInstitute !== 'N/A') {
    return fallbackInstitute.replace(/\s*\(.*?\)\s*/g, '').slice(0, 32);
  }

  return 'AKTU Affiliated Institute';
}

/**
 * Resolves course/branch name from the roll number branch code.
 */
export function resolveCourseByRoll(rollNumber: string, fallbackCourse?: string): string {
  if (fallbackCourse && fallbackCourse !== '--' && fallbackCourse !== 'N/A' && fallbackCourse !== 'B.Tech') {
    return fallbackCourse;
  }

  const clean = rollNumber.replace(/[^0-9]/g, '');
  if (clean.length >= 9) {
    const branchCode = clean.slice(6, 9);
    if (BRANCH_CODES[branchCode]) {
      return BRANCH_CODES[branchCode];
    }
  }

  return fallbackCourse || 'B.Tech';
}
