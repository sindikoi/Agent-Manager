require("dotenv").config();
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;

async function seed() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db("people");

  // Insert workplace
  await db.collection("Workplace").updateOne(
    { hotelName: "My Firm" },
    { $set: { hotelName: "My Firm", schedule: {} } },
    { upsert: true }
  );
  console.log("Workplace inserted");

  // Insert manager user (ID 104)
  await db.collection("people").updateOne(
    { _id: 104 },
    {
      $set: {
        _id: 104,
        name: "Manager",
        password: "1234",
        job: "Manager",
        Workplace: "My Firm",
        ShiftManager: true,
        WeaponCertified: false,
        selectedDays: []
      }
    },
    { upsert: true }
  );
  console.log("User 104 inserted (password: 1234)");

  // Insert a regular employee
  await db.collection("people").updateOne(
    { _id: 105 },
    {
      $set: {
        _id: 105,
        name: "Employee One",
        password: "1234",
        job: "Security",
        Workplace: "My Firm",
        ShiftManager: false,
        WeaponCertified: false,
        selectedDays: []
      }
    },
    { upsert: true }
  );
  console.log("User 105 inserted (password: 1234)");

  await client.close();
  console.log("Done! You can now log in with ID 104 or 105, password: 1234");
}

seed().catch(console.error);