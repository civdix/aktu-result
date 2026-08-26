import { MongoClient, Db } from 'mongodb';
import { MONGO_DB_URI } from '../config';
import { Student } from '../interfaces';

let database: Db | null = null;
let client: MongoClient | null = null;
let lastConnectAttempt = 0;
const CONNECT_COOLDOWN_MS = 30000; // 30 seconds

export class DatabaseService {
  static async connectToDatabase(): Promise<Db | null> {
    if (database) {
      try {
        const pingPromise = database.command({ ping: 1 });
        let timeoutId: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Ping timed out')), 500);
        });
        await Promise.race([pingPromise, timeoutPromise]);
        if (timeoutId) clearTimeout(timeoutId);
        return database;
      } catch (err) {
        console.warn('Cached MongoDB connection is dead or ping timed out, cleaning up and returning null for this request...', err);
        database = null;
        if (client) {
          try {
            await client.close(true);
          } catch (e) {
            // ignore
          }
          client = null;
        }
        return null;
      }
    }

    const now = Date.now();
    if (now - lastConnectAttempt < CONNECT_COOLDOWN_MS) {
      console.warn('MongoDB connection in cooldown, skipping connection attempt.');
      return null;
    }
    lastConnectAttempt = now;

    try {
      const uri = (typeof process !== 'undefined' && process.env?.MONGO_DB_URI) 
        || (import.meta as any).env?.MONGO_DB_URI 
        || MONGO_DB_URI;

      const dbName = (typeof process !== 'undefined' && process.env?.DATABASE_NAME) 
        || (import.meta as any).env?.DATABASE_NAME 
        || 'AKTU_RESULTS';

      if (!client) {
        const { MongoClient } = await import('mongodb');
        client = new MongoClient(uri, {
          serverSelectionTimeoutMS: 1500,
          connectTimeoutMS: 1500,
          maxPoolSize: 1
        });
      }

      // Wrap client.connect() in a promise race with a timeout.
      // This is crucial in serverless/edge/worker runtimes (like Miniflare/Cloudflare)
      // where MongoDB's Node-specific socket setup can hang indefinitely without throwing.
      const connectPromise = client.connect();
      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('MongoDB connection attempt timed out (1500ms limit reached)'));
        }, 1500);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      database = client.db(dbName);
      return database;
    } catch (error) {
      console.warn('MongoDB connection unavailable in edge worker environment:', error);
      if (client) {
        try {
          await client.close(true);
        } catch (closeError) {
          // ignore
        }
        client = null;
      }
      database = null;
      return null;
    }
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
    if (!db) return null;
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
    if (!db) return;
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
      if (!db) return 24580;
      const collection = db.collection('stats');
      await collection.updateOne(
        { _id: 'result_fetches' },
        { $inc: { count: 1 } },
        { upsert: true }
      );
      const doc = await collection.findOne({ _id: 'result_fetches' });
      return doc ? doc.count : 24580;
    } catch (error) {
      console.error('Error incrementing fetch counter:', error);
      return 24580;
    }
  }

  static async getFetchCounter(): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return 24580;
      const collection = db.collection('stats');
      const doc = await collection.findOne({ _id: 'result_fetches' });
      return doc ? doc.count : 24580;
    } catch (error) {
      console.error('Error getting fetch counter:', error);
      return 24580;
    }
  }

  static async countByFilters(
    admissionYear: string,
    collegeCode: string,
    branchCode: string
  ): Promise<number> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return 0;
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
      if (!db) return [];
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

  static async getStudentsPaginated(
    skip: number,
    limit: number
  ): Promise<{ students: Student[]; total: number }> {
    // Generate 25 mock students for fallback/testing
    const mockStudents: Student[] = Array.from({ length: 25 }, (_, i) => ({
      applicationNumber: `2100290100${String(i + 1).padStart(3, '0')}`,
      name: `Mock Student ${i + 1}`,
      fatherName: `Mock Father ${i + 1}`,
      enrollmentNumber: `EN2100290100${String(i + 1).padStart(3, '0')}`,
      course: "B.Tech Computer Science",
      institute: "Mock Institute of Technology",
      cgpa: (7.0 + (i % 3) * 0.5).toFixed(2),
      COP: "0",
      sgpaValues: ["7.20", "7.40"],
      semesters: []
    }));

    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) {
        // Fallback to mock data if DB connection is unavailable
        const sliced = mockStudents.slice(skip, skip + limit);
        return { students: sliced, total: mockStudents.length };
      }
      const collection = db.collection<Student>('students');

      const total = await collection.countDocuments({});
      if (total === 0) {
        // Fallback if DB is empty
        const sliced = mockStudents.slice(skip, skip + limit);
        return { students: sliced, total: mockStudents.length };
      }

      const students = await collection.find({})
        .skip(skip)
        .limit(limit)
        .toArray();

      return { students, total };
    } catch (error) {
      console.error('Error fetching paginated students, falling back to mock data:', error);
      const sliced = mockStudents.slice(skip, skip + limit);
      return { students: sliced, total: mockStudents.length };
    }
  }
}