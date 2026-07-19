import { MongoClient, Db } from 'mongodb';
import { MONGO_DB_URI } from '../config';
import { Student } from '../interfaces';

let database: Db | null = null;
export const client = new MongoClient(MONGO_DB_URI); 

export class DatabaseService {
  static async connectToDatabase(): Promise<Db> {
    if (!database) {
      try {
        await client.connect();
        database = client.db(process.env.DATABASE_NAME);
      } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
      }
    }
    return database;
  }
  static healSemesters(semestersList: any[]): any[] {
    const healedList: any[] = [];
    const seenSubjectsKeys: string[] = [];

    semestersList.forEach(sem => {
      if (!sem.subjects || sem.subjects.length === 0) {
        healedList.push(sem);
        return;
      }

      const subjectKey = sem.subjects.map((s: any) => s.code).sort().join(',');
      const duplicateIdx = seenSubjectsKeys.indexOf(subjectKey);

      if (duplicateIdx !== -1) {
        // Duplicate attempt: label as Semester X (Back)
        sem.sem = `Semester ${duplicateIdx + 1} (Back)`;
      } else {
        // New unique semester: label sequentially
        sem.sem = `Semester ${seenSubjectsKeys.length + 1}`;
        seenSubjectsKeys.push(subjectKey);
      }
      healedList.push(sem);
    });

    return healedList;
  }

  static async findInDatabase(rollNumber: string): Promise<Student | null> {
    const db = await DatabaseService.connectToDatabase();
    const collection = db.collection<Student>('students'); 
    const student = await collection.findOne({ applicationNumber: rollNumber });
    if (student && student.semesters) {
      const originalNames = student.semesters.map((s: any) => s.sem).join(',');
      student.semesters = DatabaseService.healSemesters(student.semesters);
      const healedNames = student.semesters.map((s: any) => s.sem).join(',');
      
      // Clean up legacy duplicate semesters in DB if names changed
      if (originalNames !== healedNames) {
        try {
          await collection.updateOne(
            { applicationNumber: rollNumber },
            { $set: { semesters: student.semesters } }
          );
          console.log(`Healed legacy duplicate semesters names for roll ${rollNumber} in DB.`);
        } catch (err) {
          console.error(`Failed to heal legacy record for ${rollNumber}:`, err);
        }
      }
    }
    return student;
  }

  static async saveToDatabase(data: Student): Promise<void> {
    const db = await DatabaseService.connectToDatabase();
    const collection = db.collection<Student>('students'); 
    await collection.updateOne(
      { applicationNumber: data.applicationNumber },
      { $set: data },
      { upsert: true }
    );
  }

  static async incrementFetchCounter(): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      const collection = db.collection('stats');
      await collection.updateOne(
        { _id: 'result_fetches' },
        { $inc: { count: 1 } },
        { upsert: true }
      );
      const doc = await collection.findOne({ _id: 'result_fetches' });
      return doc ? doc.count : 0;
    } catch (error) {
      console.error('Error incrementing fetch counter:', error);
      return 0;
    }
  }

  static async getFetchCounter(): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      const collection = db.collection('stats');
      const doc = await collection.findOne({ _id: 'result_fetches' });
      return doc ? doc.count : 0;
    } catch (error) {
      console.error('Error getting fetch counter:', error);
      return 0;
    }
  }

  static async countByFilters(
    admissionYear: string,
    collegeCode: string,
    branchCode: string
  ): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      const collection = db.collection<Student>('students');
      const prefix = `${admissionYear}${collegeCode}${branchCode}`;
      return await collection.countDocuments({
        applicationNumber: { $regex: `^${prefix}` }
      });
    } catch (error) {
      console.error('Error counting students by filters:', error);
      return 0;
    }
  }

  static async searchByNameAndFilters(
    name: string,
    admissionYear: string,
    collegeCode: string,
    branchCode: string
  ): Promise<Student[]> {
    try {
      const db = await DatabaseService.connectToDatabase();
      const collection = db.collection<Student>('students');
      
      const query: any = {};
      if (name) {
        query.name = { $regex: name, $options: 'i' };
      }
      
      const prefix = `${admissionYear}${collegeCode}${branchCode}`;
      if (prefix) {
        query.applicationNumber = { $regex: `^${prefix}` };
      }
      
      return await collection.find(query).limit(150).toArray();
    } catch (error) {
      console.error('Error searching students by name and filters:', error);
      return [];
    }
  }
}