/**
 * Utility to map and resolve official college websites for AKTU Affiliated Colleges.
 * Includes verified direct domains for major colleges and automatic fallback lookups.
 */

export interface CollegeWebsiteInfo {
  url: string;
  isVerified: boolean;
  displayUrl: string;
  erpUrl: string;
}

// Verified official websites for prominent AKTU affiliated institutions
const KNOWN_COLLEGE_WEBSITES: Record<string, string> = {
  "001": "https://aecagra.edu.in",
  "002": "https://agracollegeagra.org",
  "004": "https://rbsmtc.in",
  "005": "https://rbsmtc.in",
  "006": "https://agrapublic.com",
  "007": "https://ssitm.in",
  "010": "https://www.ucer.ac.in",
  "011": "https://uim.ac.in",
  "027": "https://www.akgec.ac.in",
  "028": "https://idealdental.in",
  "029": "https://www.kiet.edu",
  "030": "https://ipec.org.in",
  "032": "https://www.abes.ac.in",
  "033": "https://rkgit.edu.in",
  "035": "https://bbdnitm.ac.in",
  "041": "https://acetup.org",
  "043": "https://bietjhs.ac.in",
  "046": "https://mpec.ac.in",
  "052": "https://ietlucknow.ac.in",
  "054": "https://bbdnitm.ac.in",
  "056": "https://fetrbs.org",
  "068": "https://www.miet.ac.in",
  "074": "https://sdcetmzn.org",
  "080": "https://fiet.ac.in",
  "091": "https://jssaten.ac.in",
  "093": "https://rameshwaram.edu.in",
  "097": "https://galgotiacollege.edu",
  "104": "https://knit.ac.in",
  "109": "https://gcet.edu.in",
  "114": "https://kngd.edu.in",
  "120": "https://ims-ghaziabad.ac.in",
  "122": "https://www.srmcm.ac.in",
  "128": "https://bitmeerut.edu.in",
  "133": "https://www.niet.co.in",
  "143": "https://imsuc.ac.in",
  "151": "https://imsengg.ac.in",
  "153": "https://sunderdeep.ac.in",
  "161": "https://its.edu.in",
  "164": "https://psit.in",
  "172": "https://dronacharya.info",
  "192": "https://www.glbitm.org",
  "211": "https://recb.ac.in",
  "214": "https://kccitm.edu.in",
  "216": "https://itmtpt.ac.in",
  "222": "https://iert.ac.in",
  "225": "https://accurate.in",
  "231": "https://rkgit.edu.in",
  "240": "https://bpitindia.com",
  "244": "https://smslucknow.com",
  "247": "https://gniotgroup.edu.in",
  "272": "https://kit.ac.in",
  "290": "https://abesit.in",
  "338": "https://itmlucknow.com",
  "366": "https://smslucknow.com",
  "450": "https://aimt.edu.in",
  "474": "https://uit.ac.in",
  "486": "https://anaengineering.org",
  "736": "https://recmainpuri.in",
  "840": "https://recabn.ac.in",
  "841": "https://reck.ac.in",
  "842": "https://recmainpuri.in",
  "843": "https://recsonbhadra.ac.in",
  "844": "https://recbanda.ac.in",
  "845": "https://recazamgarh.ac.in"
};

/**
 * Resolves the college website details including official ERP profile link and verified domain.
 */
export function getCollegeWebsiteInfo(code: string, name: string, cgId?: number | string): CollegeWebsiteInfo {
  const normalizedCode = code.trim().replace(/^0+/, '').padStart(3, '0');
  const codeKey = code.trim();
  const directUrl = KNOWN_COLLEGE_WEBSITES[codeKey] || KNOWN_COLLEGE_WEBSITES[normalizedCode];

  const erpUrl = cgId 
    ? `https://erp.aktu.ac.in/WebPages/Public/Affiliation/CollegeDetail.aspx?Id=${cgId}` 
    : `https://erp.aktu.ac.in/WebPages/Public/Affiliation/CollegeDetail.aspx?Code=${encodeURIComponent(code)}`;

  if (directUrl) {
    const displayUrl = directUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return {
      url: directUrl,
      isVerified: true,
      displayUrl,
      erpUrl
    };
  }

  // Fallback to Google Search query for official website
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' official website')}`;
  return {
    url: searchUrl,
    isVerified: false,
    displayUrl: "Official Portal Search",
    erpUrl
  };
}
