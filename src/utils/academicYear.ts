/**
 * Dynamic AKTU Academic Year and Session Helper
 * 
 * Logic:
 * - If current month > April (May to December):
 *     Session is `${year}-${year + 1}` (e.g. Sept 2026 -> "2026-2027")
 * - If current month <= April (January to April):
 *     Session is `${year - 1}-${year}` (e.g. Feb 2027 -> "2026-2027")
 * 
 * Automatically shifts to next session (e.g. "2027-2028") as soon as May arrives!
 */

export function getAcademicYearInfo(date = new Date()) {
  const currentYear = date.getFullYear();
  const month = date.getMonth() + 1; // 1 to 12

  const isAfterApril = month > 4;

  const startYear = isAfterApril ? currentYear : currentYear - 1;
  const endYear = startYear + 1;

  const session = `${startYear}-${endYear}`;
  const sessionFormatted = `${startYear}–${endYear}`;

  return {
    currentYear,
    month,
    isAfterApril,
    startYear,
    endYear,
    session,              // e.g. "2026-2027"
    sessionFormatted,     // e.g. "2026–2027"
    primaryYear: `${currentYear}`,
    homeTitle: `AKTU Result ${session} | OneView Marksheet Without DOB`,
    homeDescription: `Check AKTU Result without Date of Birth for session ${sessionFormatted}. Access your OneView marksheet, ERP scorecards, SGPA, and back papers by Roll Number.`,
    withoutDobTitle: `AKTU Result Without DOB | Check OneView Marksheet Online`,
    withoutDobDescription: `Check AKTU Result without Date of Birth online. Enter Roll Number to view complete OneView marksheet, SGPA, CGPA, and semester grades instantly.`,
    oneviewTitle: `OneView AKTU Result ${session} | Check Marksheet Online`,
    oneviewDescription: `Check OneView AKTU Result ${sessionFormatted} online. View semester marks, SGPA, CGPA, back papers, and marksheet without Date of Birth using Roll Number.`,
    erpTitle: `AKTU ERP Result ${session} | Student Login & Portal Guide`,
    erpDescription: `Check AKTU ERP Result ${session} online. Student login guide for erp.aktu.ac.in, marksheet verification, scrutiny results, and semester exam grades.`
  };
}
