const { MongoClient } = require('mongodb');

const mongo_uri = "mongodb+srv://shivam:nQewAAdZh8YuEdPK@society-vendor-app.ixhrnim.mongodb.net/?appName=society-vendor-app";
const db_name = "AKTU_RESULTS";

async function run() {
  const client = new MongoClient(mongo_uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");
    const db = client.db(db_name);
    
    const cols = await db.listCollections().toArray();
    console.log("Collections in database:");
    for (const col of cols) {
      const count = await db.collection(col.name).countDocuments({});
      console.log(`  Collection: ${col.name} | Document Count: ${count}`);
      if (count > 0) {
        const sample = await db.collection(col.name).findOne({});
        if (sample) {
          if (sample.semesters) {
            delete sample.semesters;
          }
          console.log(`    Sample:`, JSON.stringify(sample));
        }
      }
    }
  } catch (error) {
    console.error("Database check failed:", error);
  } finally {
    await client.close();
  }
}

run();
