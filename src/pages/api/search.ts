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

export const POST: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: false,
      error: "The result retrieval system is temporarily under maintenance due to recent AKTU One View portal upgrades. Please check back later.",
      code: 503
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
};
