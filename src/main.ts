import { DatabaseService, client } from './database/database.service';
import { ScrapingService } from './scraping/scraping.service';
import { DateUtils } from './utils/date.utils';
import { Student, ScrapingSession } from './interfaces';

async function processRollNumber(rollNumber: string, initialSession: ScrapingSession): Promise<Student | null> {
  let result = await DatabaseService.findInDatabase(rollNumber);
  if (result) {
    return result;
  }

  let StartYear = 2003;
  let EndYear = 2003;
  let currentSession = initialSession;

  for (let year = StartYear; year <= EndYear; year++) {
    for (let month = 4; month <= 4; month++) {
      const daysInMonth = DateUtils.getDaysInMonth(month, year);
      for (let day = 14; day <= 16; day++) {
        console.log(`Trying date: ${day}/${month}/${year}`);
        try {
          const findResult = await ScrapingService.find(rollNumber, day, month, year, currentSession);
          if (findResult) {
            const { result: parseResult, nextSession } = findResult;
            currentSession = nextSession;

            if (parseResult) {
              const studentResult: Student = {
                ...parseResult,
                dob: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
              };

              console.log({
                name: studentResult.name,
                applicationNumber: studentResult.applicationNumber,
                dob: studentResult.dob
              });

              await DatabaseService.saveToDatabase(studentResult);
              return studentResult;
            }
          }
        } catch (error) {
          console.error('Error in execution:', error);
        }
      }
    }
  }

  console.log(`No result found for roll number ${rollNumber}`);
  return null;
}

async function main(rollNumbers: string[]) {
  try {
    const results = [];

    for (const rollNumber of rollNumbers) {
      console.log(`Processing ${rollNumber}`);
      const validationResult = await ScrapingService.validateRollNumber(rollNumber);
      if (validationResult) {
        if (typeof validationResult === 'object' && 'name' in validationResult) {
          // Already in DB as Student
          results.push({
            name: validationResult.name,
            applicationNumber: validationResult.applicationNumber,
            dob: validationResult.dob
          });
        } else {
          // Valid roll number, dynamic ScrapingSession returned
          const result = await processRollNumber(rollNumber, validationResult as ScrapingSession);
          if (result) {
            results.push({
              name: result.name,
              applicationNumber: result.applicationNumber,
              dob: result.dob
            });
          } else {
            results.push({ rollNumber, result: null });
          }
        }
      } else {
        console.log(`Skipping DOB search for invalid roll number: ${rollNumber}`);
        results.push({ rollNumber, result: "invalid" });
      }
    }
    console.log('Final results:', results);
  } catch (error) {
    console.error('Error in main function:', error);
  } finally {
    await client.close();
  }
}

const rollNumbersToSearch = ["2200650100100"];
main(rollNumbersToSearch);