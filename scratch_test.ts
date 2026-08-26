import { DatabaseService } from './src/database/database.service';

console.log("Starting DB connection test...");
const start = Date.now();
try {
  const res = await DatabaseService.getStudentsPaginated(0, 10);
  console.log("Result successfully retrieved in", Date.now() - start, "ms");
  console.log("Total students:", res.total);
  console.log("Students sample count:", res.students.length);
  console.log("Students data:", JSON.stringify(res.students, null, 2));
} catch (err) {
  console.error("Error occurred:", err);
}
process.exit(0);