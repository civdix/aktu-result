/**
 * Converts a college name and code into an SEO-friendly URL slug.
 * e.g., "Anand Engineering College, Agra" (code: "001") -> "anand-engineering-college-agra-001"
 */
export function slugifyCollege(name: string, code: string): string {
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // remove special characters
    .trim()
    .replace(/\s+/g, "-")        // replace spaces with hyphens
    .replace(/-+/g, "-");        // deduplicate hyphens
  return `${cleanName}-${code}`;
}
