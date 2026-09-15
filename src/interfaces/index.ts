export interface Student {
  applicationNumber: string;
  name: string;
  COP: string;
  sgpaValues: string[];
  dob?: string;
  fatherName?: string;
  enrollmentNumber?: string;
  course?: string;
  institute?: string;
  cgpa?: string;
  semesters?: any[];
  courseCompleted?: boolean;
  divisionAwarded?: string;
  finalResultHtml?: string;
  rawHtml?: string;
}

export interface ParseResult {
  success: boolean;
  applicationNumber: string;
  name: string;
  COP: string;
  sgpaValues: string[];
  fatherName?: string;
  enrollmentNumber?: string;
  course?: string;
  institute?: string;
  cgpa?: string;
  semesters?: any[];
  courseCompleted?: boolean;
  divisionAwarded?: string;
  finalResultHtml?: string;
  rawHtml?: string;
}

export interface ViewStateParams {
  viewState: string;
  viewStateGenerator: string;
  eventValidation: string;
}

export interface ScrapingSession {
  cookieHeader: string;
  viewStateParams: ViewStateParams;
}

export interface College {
  code: string;
  name: string;
  CGId?: number;
  CGCode?: string;
  slug?: string;
}
