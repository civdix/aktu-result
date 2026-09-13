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
    const query = rollNumber.trim();
    const student = await collection.findOne({
      $or: [
        { applicationNumber: query },
        { enrollmentNumber: query }
      ]
    });
    if (student && student.semesters) {
      const originalNames = student.semesters.map((s: any) => s.sem).join(',');
      student.semesters = DatabaseService.healSemesters(student.semesters);
      const healedNames = student.semesters.map((s: any) => s.sem).join(',');

      // Clean up legacy duplicate semesters in DB if names changed
      if (originalNames !== healedNames) {
        try {
          await collection.updateOne(
            { _id: (student as any)._id },
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

  static async getStudentResult(rollNumber: string): Promise<Student | null> {
    return await DatabaseService.findInDatabase(rollNumber);
  }

  static async saveDobToDatabase(data: {
    applicationNumber: string;
    dob: string;
    name?: string;
    fatherName?: string;
    motherName?: string;
    course?: string;
    institute?: string;
    enrollmentNumber?: string;
  }): Promise<void> {
    const db = await DatabaseService.connectToDatabase();
    if (!db) return;
    const collection = db.collection('students');
    const updateDoc: any = {
      applicationNumber: data.applicationNumber,
      dob: data.dob
    };
    if (data.name && data.name !== 'Verified Student' && data.name !== 'Student') {
      updateDoc.name = data.name;
    }
    if (data.fatherName) updateDoc.fatherName = data.fatherName;
    if (data.motherName) updateDoc.motherName = data.motherName;
    if (data.course) updateDoc.course = data.course;
    if (data.institute) updateDoc.institute = data.institute;
    if (data.enrollmentNumber && data.enrollmentNumber !== 'N/A' && data.enrollmentNumber !== '--') {
      updateDoc.enrollmentNumber = data.enrollmentNumber;
    }

    const orConditions: any[] = [{ applicationNumber: data.applicationNumber }];
    if (data.enrollmentNumber && data.enrollmentNumber !== 'N/A' && data.enrollmentNumber !== '--') {
      orConditions.push({ enrollmentNumber: data.enrollmentNumber });
    }

    const existing = await collection.findOne({ $or: orConditions });
    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        { $set: updateDoc }
      );
    } else {
      await collection.updateOne(
        { applicationNumber: data.applicationNumber },
        { $set: updateDoc },
        { upsert: true }
      );
    }
  }

  static async saveToDatabase(data: Student): Promise<void> {
    const db = await DatabaseService.connectToDatabase();
    if (!db) return;
    const collection = db.collection('students');

    // Only save DOB, enrollment number and profile info - do not save semester results in db
    const updateDoc: any = {
      applicationNumber: data.applicationNumber,
    };
    if (data.dob && data.dob !== '--') updateDoc.dob = data.dob;
    if (data.name && data.name !== 'Verified Student' && data.name !== 'Student') updateDoc.name = data.name;
    if (data.fatherName) updateDoc.fatherName = data.fatherName;
    if ((data as any).motherName) updateDoc.motherName = (data as any).motherName;
    if (data.course) updateDoc.course = data.course;
    if (data.institute) updateDoc.institute = data.institute;
    if (data.cgpa && data.cgpa !== '0.00' && data.cgpa !== '--') updateDoc.cgpa = data.cgpa;
    if (data.semesters && Array.isArray(data.semesters) && data.semesters.length > 0) {
      updateDoc.semesters = data.semesters;
    }
    if (data.courseCompleted) updateDoc.courseCompleted = data.courseCompleted;
    if (data.divisionAwarded) updateDoc.divisionAwarded = data.divisionAwarded;
    if (data.rawHtml) updateDoc.rawHtml = data.rawHtml;
    if (data.enrollmentNumber && data.enrollmentNumber !== 'N/A' && data.enrollmentNumber !== '--') {
      updateDoc.enrollmentNumber = data.enrollmentNumber;
    }

    const orConditions: any[] = [{ applicationNumber: data.applicationNumber }];
    if (data.enrollmentNumber && data.enrollmentNumber !== 'N/A' && data.enrollmentNumber !== '--') {
      orConditions.push({ enrollmentNumber: data.enrollmentNumber });
    }

    const existing = await collection.findOne({ $or: orConditions });
    if (existing) {
      await collection.updateOne(
        { _id: existing._id },
        { $set: updateDoc }
      );
    } else {
      await collection.updateOne(
        { applicationNumber: data.applicationNumber },
        { $set: updateDoc },
        { upsert: true }
      );
    }
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

  static async recordPayment(paymentData: {
    userId: number;
    username?: string;
    payload: string;
    stars: number;
    telegramPaymentChargeId: string;
    providerPaymentChargeId: string;
    createdAt: Date;
  }): Promise<void> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return;
      await db.collection('payments').insertOne(paymentData);
    } catch (e) {
      console.error('Error recording payment:', e);
    }
  }

  static async isUserVip(userId: number): Promise<boolean> {
    try {
      const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (adminIds.includes(String(userId))) return true;

      const db = await DatabaseService.connectToDatabase();
      if (!db) return false;
      const vip = await db.collection('vip_users').findOne({ userId });
      if (!vip) return false;
      if (vip.isLifetime) return true;
      if (!vip.expiresAt) return false;
      return new Date(vip.expiresAt) > new Date();
    } catch (e) {
      return false;
    }
  }

  static async getVipRemainingMinutes(userId: number): Promise<number> {
    try {
      const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (adminIds.includes(String(userId))) return 999999;

      const db = await DatabaseService.connectToDatabase();
      if (!db) return 0;
      const vip = await db.collection('vip_users').findOne({ userId });
      if (!vip) return 0;
      if (vip.isLifetime) return 999999;
      if (!vip.expiresAt) return 0;
      const diffMs = new Date(vip.expiresAt).getTime() - Date.now();
      return diffMs > 0 ? Math.ceil(diffMs / (60 * 1000)) : 0;
    } catch (e) {
      return 0;
    }
  }

  static async setUserLifetimeVip(userId: number, username?: string): Promise<void> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
      await db.collection('vip_users').updateOne(
        { userId },
        { 
          $set: { 
            userId, 
            username, 
            isLifetime: true,
            activatedAt: now,
            expiresAt: expiresAt 
          } 
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('Error setting lifetime VIP:', e);
    }
  }

  static async setUserVip(userId: number, username?: string, durationMs: number = 60 * 60 * 1000): Promise<Date> {
    try {
      const db = await DatabaseService.connectToDatabase();
      const now = new Date();
      let expiresAt = new Date(now.getTime() + durationMs);

      if (db) {
        // If user already has an active VIP pass, extend by durationMs
        const existing = await db.collection('vip_users').findOne({ userId });
        if (existing && existing.expiresAt && new Date(existing.expiresAt) > now) {
          expiresAt = new Date(new Date(existing.expiresAt).getTime() + durationMs);
        }

        await db.collection('vip_users').updateOne(
          { userId },
          { 
            $set: { 
              userId, 
              username, 
              activatedAt: now,
              expiresAt: expiresAt 
            } 
          },
          { upsert: true }
        );
      }
      return expiresAt;
    } catch (e) {
      console.error('Error setting VIP user:', e);
      return new Date(Date.now() + durationMs);
    }
  }

  static async hasUserUnlockedRoll(userId: number, rollNumber: string): Promise<boolean> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return false;
      const doc = await db.collection('unlocked_rolls').findOne({ userId, rollNumber });
      return !!doc;
    } catch (e) {
      return false;
    }
  }

  static async recordUnlockedRoll(userId: number, rollNumber: string): Promise<void> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return;
      await db.collection('unlocked_rolls').updateOne(
        { userId, rollNumber },
        { $set: { userId, rollNumber, unlockedAt: new Date() } },
        { upsert: true }
      );
    } catch (e) {
      console.error('Error recording unlocked roll:', e);
    }
  }

  static async getStudentRank(rollNumber: string): Promise<{
    student: Student | null;
    branchRank: number;
    totalInBranch: number;
    collegeRank: number;
    totalInCollege: number;
    topSgpa: string;
    percentile: string;
  } | null> {
    try {
      const db = await DatabaseService.connectToDatabase();
      if (!db) return null;
      const collection = db.collection<Student>('students');

      const student = await collection.findOne({ applicationNumber: rollNumber });
      if (!student) return null;

      const year = rollNumber.substring(0, 2);
      const collegeCode = rollNumber.length >= 6 ? rollNumber.substring(2, 6) : '';
      const branchCode = rollNumber.length >= 9 ? rollNumber.substring(6, 9) : '';

      const branchPrefix = `${year}${collegeCode}${branchCode}`;
      const collegePrefix = `${year}${collegeCode}`;

      const branchStudents = await collection.find({
        applicationNumber: { $regex: `^${branchPrefix}` }
      }).toArray();

      const collegeStudents = await collection.find({
        applicationNumber: { $regex: `^${collegePrefix}` }
      }).toArray();

      const totalInBranch = Math.max(branchStudents.length, 1);
      const totalInCollege = Math.max(collegeStudents.length, 1);

      const getScore = (s: Student) => {
        if (s.cgpa && !isNaN(parseFloat(s.cgpa))) return parseFloat(s.cgpa);
        if (s.sgpaValues && s.sgpaValues.length > 0) {
          const val = parseFloat(s.sgpaValues[s.sgpaValues.length - 1]);
          if (!isNaN(val)) return val;
        }
        return 0;
      };

      branchStudents.sort((a, b) => getScore(b) - getScore(a));
      const branchIndex = branchStudents.findIndex(s => s.applicationNumber === rollNumber);
      const branchRank = branchIndex !== -1 ? branchIndex + 1 : Math.max(1, Math.ceil(totalInBranch * 0.15));

      const topSgpa = branchStudents.length > 0 && getScore(branchStudents[0]) > 0 
        ? getScore(branchStudents[0]).toFixed(2) 
        : '9.45';

      const percentile = totalInBranch > 1 
        ? (((totalInBranch - branchRank) / totalInBranch) * 100).toFixed(1) + '%'
        : 'Top 5%';

      collegeStudents.sort((a, b) => getScore(b) - getScore(a));
      const collegeIndex = collegeStudents.findIndex(s => s.applicationNumber === rollNumber);
      const collegeRank = collegeIndex !== -1 ? collegeIndex + 1 : Math.max(1, Math.ceil(totalInCollege * 0.2));

      return {
        student,
        branchRank,
        totalInBranch,
        collegeRank,
        totalInCollege,
        topSgpa,
        percentile
      };
    } catch (e) {
      console.error('Error calculating student rank:', e);
      return null;
    }
  }
}