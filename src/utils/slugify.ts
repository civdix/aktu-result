import type { College } from "../interfaces";

/**
 * Converts a college name and code into an SEO-friendly URL slug.
 * e.g., "Anand Engineering College, Agra" (code: "001") -> "anand-engineering-college-agra-001"
 */
export function slugifyCollege(name: string, code: string): string {
  const cleanName = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters
    .trim()
    .replace(/\s+/g, "-")        // replace spaces with hyphens
    .replace(/-+/g, "-");        // deduplicate hyphens
  return `${cleanName}-${(code || "").trim()}`;
}

/**
 * Robustly looks up a college by slug or code from a list of colleges.
 * Supports:
 * 1. Full slug (e.g. "anand-engineering-college-agra-001")
 * 2. Exact college code (e.g. "001", "065", "65", "1")
 * 3. Trailing code in slug (e.g. "any-slug-001")
 * 4. Slugified name match without code
 * 5. Substring match on name
 */
export function findCollegeBySlug(slug: string, collegesList: College[]): College | null {
  if (!slug || !Array.isArray(collegesList)) return null;
  const clean = slug.toLowerCase().trim();

  // 1. Direct match on slugifyCollege
  let college = collegesList.find((c) => slugifyCollege(c.name, c.code).toLowerCase() === clean);
  if (college) return college;

  // 2. Direct match with college code (e.g., "001", "1", "065", "65")
  const numericOnly = clean.replace(/^0+/, "");
  college = collegesList.find((c) => {
    const code = (c.code || "").toLowerCase().trim();
    const cNumeric = code.replace(/^0+/, "");
    return code === clean || (numericOnly !== "" && cNumeric === numericOnly);
  });
  if (college) return college;

  // 3. Extract code from end of slug (after last dash)
  const lastDash = clean.lastIndexOf("-");
  if (lastDash !== -1) {
    const potentialCode = clean.slice(lastDash + 1).trim();
    const potentialNum = potentialCode.replace(/^0+/, "");
    college = collegesList.find((c) => {
      const code = (c.code || "").toLowerCase().trim();
      const cNumeric = code.replace(/^0+/, "");
      return code === potentialCode || (potentialNum !== "" && cNumeric === potentialNum);
    });
    if (college) return college;
  }

  // 4. Match by name slug without code
  college = collegesList.find((c) => {
    const nameSlug = (c.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    return nameSlug === clean || clean === nameSlug;
  });
  if (college) return college;

  // 5. Fallback substring match on name
  const cleanAsWords = clean.replace(/[-_]/g, " ");
  college = collegesList.find((c) => {
    const cName = (c.name || "").toLowerCase();
    return cName.includes(cleanAsWords) || cleanAsWords.includes(cName);
  });
  if (college) return college;

  return null;
}

