require("dotenv").config();
const express = require("express");
const mongojs = require("mongojs");
const cors = require("cors");
const { spawn } = require('child_process');
const path = require('path');
const moment = require("moment");
const { MongoClient } = require("mongodb");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Atlas connection
const dbURI = process.env.MONGO_URI;
if (!dbURI) {
  console.error("❌ Missing MONGO_URI environment variable. Create a .env file based on .env.example");
  process.exit(1);
}
const db = mongojs(dbURI);
const people_coll = db.collection("people");
const Workplace_coll = db.collection("Workplace");
const result_coll = db.collection("result");
const announcements_coll = db.collection("announcements");

db.on("connect", () => {
  console.log("✅ Connected to MongoDB Atlas");
});

db.on("error", (err) => {
  console.error("❌ Database connection error:", err);
});

// Login endpoint
app.post("/login", (req, res) => {
  const { id, password } = req.body;

  const numericId = parseInt(id);
  if (isNaN(numericId)) {
    return res.status(400).json({ success: false, message: "Invalid ID format" });
  }

  people_coll.findOne({ _id: numericId }, (err, user) => {
    if (err) {
      console.error("❌ Database error on login:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (user && user.password === password) {
      Workplace_coll.findOne(
        { hotelName: user.Workplace },
        (hotelErr, hotelData) => {
          if (hotelErr) {
            console.error("❌ Error retrieving workplace data on login:", hotelErr);
            return res.status(500).json({ success: false, message: "Error retrieving workplace data" });
          }

          res.json({
            success: true,
            id: user._id,
            name: user.name,
            job: user.job,
            Workplace: user.Workplace,
            ShiftManager: user.ShiftManager,
            WeaponCertified: user.WeaponCertified,
            selectedDays: user.selectedDays || [],
            schedule: hotelData && hotelData.schedule ? hotelData.schedule : {},
          });
        }
      );
    } else {
      console.log(`❌ Login failed for user: ${id}`);
      res.status(401).json({ success: false, message: "Invalid ID or password" });
    }
  });
});

// EmployeeRequest endpoints
app.post("/EmployeeRequest", (req, res) => {
  const { userId, selectedDays } = req.body;

  if (!userId || !Array.isArray(selectedDays)) {
    return res.status(400).json({ success: false, message: "Invalid data format" });
  }

  const numericId = parseInt(userId, 10);
  if (isNaN(numericId)) {
    return res.status(400).json({ success: false, message: "Invalid userId format" });
  }

  people_coll.updateOne(
    { _id: numericId },
    { $set: { selectedDays: selectedDays, availabilityLastUpdated: new Date() } },
    (updateErr) => {
      if (updateErr) {
        console.error("Error during update:", updateErr);
        return res.status(500).json({ success: false, message: "Error updating data" });
      }
      res.status(200).json({ success: true, message: "Days updated successfully" });
    }
  );
});

app.get("/EmployeeRequest", (req, res) => {
  const userId = parseInt(req.query.userId);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: "Invalid userId format" });
  }

  people_coll.findOne({ _id: userId }, (err, user) => {
    if (err) {
      console.error("❌ Error fetching user:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, selectedDays: user.selectedDays || [] });
  });
});

// Schedule management endpoints
app.get("/get-schedule/:hotelName", (req, res) => {
  const hotelName = req.params.hotelName;
  Workplace_coll.findOne({ hotelName: hotelName }, (err, data) => {
    if (err) {
      console.error(`DB error fetching schedule for ${hotelName}:`, err);
      return res.status(500).json({ message: "Database error", schedule: {} });
    }
    if (!data) {
      console.log(`No workplace found for ${hotelName}, sending empty schedule object.`);
      return res.status(404).json({ message: "Workplace not found", schedule: {} });
    }
    res.json({ schedule: data.schedule || {} });
  });
});

app.post("/save-schedule/:hotelName", (req, res) => {
  const hotelNameFromParam = req.params.hotelName; // שיניתי את שם המשתנה כדי שיהיה ברור שהוא מה-URL
  const { schedule } = req.body;

  if (!schedule || typeof schedule !== 'object') {
    return res.status(400).json({ success: false, message: "Schedule data is missing or invalid." });
  }

  console.log(`Attempting to find workplace in Workplace_coll: "${hotelNameFromParam}"`);
  Workplace_coll.findOne({ hotelName: hotelNameFromParam }, (findErr, foundDoc) => {
    if (findErr) {
      console.error(`Database error while trying to find workplace "${hotelNameFromParam}":`, findErr);
      return res.status(500).json({ success: false, message: "Error checking if workplace exists." });
    }
    if (foundDoc) {
      console.log(`Workplace "${hotelNameFromParam}" FOUND by findOne. Document:`, JSON.stringify(foundDoc, null, 2));
    } else {
      console.log(`Workplace "${hotelNameFromParam}" WAS NOT FOUND by findOne.`);
    }
    console.log(`Now attempting to updateOne for workplace: "${hotelNameFromParam}"`);

    Workplace_coll.updateOne(
      { hotelName: hotelNameFromParam }, // התנאי לחיפוש
      { $set: { schedule: schedule } },    // הנתונים לעדכון
      { upsert: true },                    // אפשר יצירה אם לא קיים
      (updateErr, result) => {
        if (updateErr) {
          console.error(`Database error during updateOne for "${hotelNameFromParam}":`, updateErr);
          return res.status(500).json({ success: false, message: "Error saving schedule data during update." });
        }
        
        let operationSucceeded = false;
        let successMessage = "";

        if (result && (result.ok === 1 || result.acknowledged === true)) { // acknowledged נוסף ליתר ביטחון
            if (result.upserted && result.upserted.length > 0) {
                operationSucceeded = true;
                successMessage = `New schedule created successfully for "${hotelNameFromParam}".`;
                console.log(successMessage + ` Upserted ID: ${result.upserted[0]._id}`);
            } else if (result.nModified > 0) {
                operationSucceeded = true;
                successMessage = `Schedule updated successfully for "${hotelNameFromParam}".`;
                console.log(successMessage + ` Matched: ${result.n}, Modified: ${result.nModified}`);
            } else if (result.n > 0 && result.nModified === 0) {
                // נמצאה רשומה, אבל לא בוצע שינוי (כי הנתונים זהים)
                operationSucceeded = true; // עדיין נחשיב כהצלחה מבחינת מציאת הרשומה
                successMessage = `Schedule for "${hotelNameFromParam}" found, but no changes were needed.`;
                console.log(successMessage + ` Matched: ${result.n}`);
            } else if (result.n === 0 && (!result.upserted || result.upserted.length === 0)) {
                // לא נמצא, וגם לא בוצע upsert - זה המקרה של 404
                console.log(`updateOne for "${hotelNameFromParam}": No document matched and no document was upserted.`);
            } else {
                 // מקרה לא צפוי אחר שלכאורה ok:1 אבל לא ברור מה קרה
                 console.log(`updateOne for "${hotelNameFromParam}": ok:1 but unclear outcome. n=${result.n}, nModified=${result.nModified}, upserted=${JSON.stringify(result.upserted)}`);
            }
        } else {
            console.log(`updateOne for "${hotelNameFromParam}": Operation not acknowledged or 'ok' not 1. Result:`, JSON.stringify(result, null, 2));
        }

        if (operationSucceeded) {
          res.status(200).json({ success: true, message: successMessage });
        } else {
          // אם לא הייתה הצלחה מובהקת (כולל המקרה של n=0 ואין upsert)
          console.log(` النهائية: Workplace not found or no changes applied for "${hotelNameFromParam}". Full result object was printed above.`);
          return res.status(404).json({ success: false, message: `Workplace "${hotelNameFromParam}" not found or no changes applied.` });
        }
      }
    );
  });
});
// ...

app.post("/api/run-scheduler/:hotelName", (req, res) => {
  const hotelName = req.params.hotelName;
  const { targetWeekStartDate } = req.body;

  console.log(`[Server] Received scheduler run request for hotel: "${hotelName}"`);

  if (!targetWeekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStartDate)) {
    console.error(`[Server] Invalid request: Missing or malformed targetWeekStartDate.`);
    return res.status(400).json({ message: "Invalid or missing targetWeekStartDate. Expected YYYY-MM-DD format." });
  }

  // Step 1: Find the manager for the given hotel to get a dynamic manager_id
  people_coll.findOne({ Workplace: hotelName, ShiftManager: true }, (err, manager) => {
    if (err) {
      console.error(`[Server] DB error finding manager for "${hotelName}":`, err);
      return res.status(500).json({ message: "Database error while searching for a manager." });
    }
    if (!manager) {
      console.error(`[Server] No manager found for hotel: "${hotelName}"`);
      return res.status(404).json({ message: `Configuration error: No manager found for hotel "${hotelName}". Cannot run scheduler.` });
    }

    const managerId = manager._id;
    console.log(`[Server] Found Manager ID: ${managerId}. Proceeding to run Python script.`);

    // Step 2: Set up the Python script execution in a secure way
    const pythonExecutable = 'python'; // More portable than a hardcoded path
    const pythonScriptPath = path.join(__dirname, '..', 'Python', 'Constraints.py');
    const args = [
      pythonScriptPath,
      '--mode', 'manual',
      '--manager-id', managerId.toString(),
      '--target-week', targetWeekStartDate
    ];

    console.log(`[Server] Spawning process: ${pythonExecutable} ${args.join(' ')}`);

    // Step 3: Use spawn to run the script and stream I/O
    const pythonProcess = spawn(pythonExecutable, args);

    let scriptOutput = '';
    let scriptError = '';

    // Capture standard output (for logging success)
    pythonProcess.stdout.on('data', (data) => {
      const outputChunk = data.toString();
      scriptOutput += outputChunk;
      console.log(`[Python STDOUT]: ${outputChunk.trim()}`);
    });

    // Capture standard error (for debugging failures)
    pythonProcess.stderr.on('data', (data) => {
      const errorChunk = data.toString();
      scriptError += errorChunk;
      console.error(`[Python STDERR]: ${errorChunk.trim()}`);
    });

    // Step 4: Handle the process exit and respond to the client
    pythonProcess.on('close', (code) => {
      console.log(`[Server] Python process finished with exit code ${code}.`);
      if (code === 0) {
        // Exit code 0 means success
        res.status(200).json({
          success: true,
          message: 'Scheduler algorithm completed successfully!',
          output: scriptOutput
        });
      } else {
        // Any other exit code means failure
        res.status(500).json({
          success: false,
          message: 'An error occurred while running the Python scheduler.',
          error: scriptError || 'Unknown error in Python script. See server console for details.'
        });
      }
    });

    // Handle errors in the spawn process itself (e.g., python not found)
    pythonProcess.on('error', (spawnError) => {
        console.error('[Server] Failed to start Python process:', spawnError);
        res.status(500).json({ success: false, message: 'Server configuration error: Failed to start the Python process.' });
    });
  });
});

/**
 * Endpoint to get all generated schedules for a hotel.
 * Slightly modified to always return the most relevant idToName map.
 */
app.get("/api/generated-schedules/:hotelName", (req, res) => {
    const hotelName = req.params.hotelName;
    const today = moment().startOf('day');
  
    let currentWeekStart = moment(today).day(6); // 6 = Saturday
    if (currentWeekStart.isAfter(today)) {
      currentWeekStart = currentWeekStart.subtract(7, 'days');
    }
    const nextWeekStart = moment(currentWeekStart).add(7, 'days');
    
    // Create the correct dates to search the database (Sundays)
    // Add one day to the calculated Sabbath dates

    const currentWeekDbDate = moment(currentWeekStart).add(1, 'days').format('YYYY-MM-DD');
    const nextWeekDbDate = moment(nextWeekStart).add(1, 'days').format('YYYY-MM-DD');
  
    // Using Sunday dates to search for current and next arrangements
    result_coll.find({
      hotelName: hotelName,
      relevantWeekStartDate: { $in: [currentWeekDbDate, nextWeekDbDate] }
    }).toArray((err, schedules) => {
      if (err) {
        console.error("DB error fetching current/next schedules:", err);
        return res.status(500).json({ success: false, message: "Database error while fetching schedules." });
      }
      
      //  Finding the current and next order from the results, based on Sunday dates
      let nextSchedule = schedules.find(s => s.relevantWeekStartDate === nextWeekDbDate) || null;
      
      //Search for older arrangements
      // The search does not include the dates of the next arrangement that we have already found
      result_coll.find({
        hotelName: hotelName,
        relevantWeekStartDate: { $nin: [currentWeekDbDate, nextWeekDbDate] }
      }).sort({ generatedAt: -1 }).limit(5).toArray((err2, oldSchedules) => {
  
        if (err2) {
          console.error("DB error fetching old schedules:", err2);
          return res.status(500).json({ success: false, message: "Database error while fetching old schedules." });
        }
  
        // Select the most relevant name map (idToName) for client-side display
        let idToNameMap = {};
        if (nextSchedule && nextSchedule.idToName) {
            idToNameMap = nextSchedule.idToName;
        } else if (oldSchedules && oldSchedules.length > 0 && oldSchedules[0].idToName) {
            idToNameMap = oldSchedules[0].idToName;
        }
  
        //Sending the full response to the client side
        res.json({
          success: true,
          next: nextSchedule,
          old: oldSchedules || [],
          idToName: idToNameMap 
        });
      });
    });
  });


// Route to get current problematic schedule result for a hotel
app.get("/schedule-result/:hotelName", (req, res) => {
  const hotelName = req.params.hotelName;

  result_coll.findOne({ hotelName: hotelName, Week: "New" }, (err, resultDoc) => {
    if (err) {
      console.error("❌ Error fetching result:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (!resultDoc) {
      return res.status(404).json({ message: "No schedule result found" });
    }

    res.json({
      status: resultDoc.status || "unknown",
      notes: resultDoc.notes || [],
      generatedAt: resultDoc.generatedAt,
    });
  });
});

// Retrieve the 10 most recent announcements (sorted by date descending)
app.get("/api/announcements", (req, res) => {
  announcements_coll.find().sort({ date: -1 }).limit(10, (err, docs) => {
    if (err) {
      return res.status(500).json({ success: false, message: "DB error" });
    }
    res.json({ success: true, announcements: docs });
  });
});

// Post a new announcement
app.post("/api/announcements", (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, message: "Missing message" });
  }
  const doc = { message, date: new Date() };
  announcements_coll.insert(doc, (err, result) => {
    if (err) {
      return res.status(500).json({ success: false });
    }
    res.json({ success: true, inserted: doc });
  });
});

// Delete an announcement by ID
app.delete("/api/announcements/:id", (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ success: false });
  announcements_coll.remove({ _id: mongojs.ObjectId(id) }, (err, result) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});


// ==============================================================================
// AGENT ENDPOINT
// ==============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Async MongoDB client for the agent (uses native driver, not mongojs)
let agentDb = null;
async function getAgentDb() {
  if (!agentDb) {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    agentDb = client.db("safeshift");
  }
  return agentDb;
}

// Helper: run Python scheduler and wait for result
function runScheduler(managerId, weekStartDate) {
  return new Promise((resolve, reject) => {
    const pyPath = path.join(__dirname, '..', 'Python', 'Constraints.py');
    const proc = spawn('py', [pyPath, '--mode', 'manual', '--manager-id', String(managerId), '--target-week', weekStartDate]);
    let out = '', err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve({ success: true, output: out });
      else reject(new Error(err || 'Python process failed'));
    });
    proc.on('error', reject);
  });
}

// Agent tools definition
const AGENT_TOOLS = [
  {
    name: "get_organization_config",
    description: "מחזיר את הגדרות הארגון: משמרות (shiftTypes), תפקידים (roles), כשירויות (qualifications), ודרישות סידור (scheduleRequirements). קרא לכלי הזה כדי להבין מה מוגדר כרגע.",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string", description: "מזהה הארגון" } },
      required: ["org_id"]
    }
  },
  {
    name: "get_employees",
    description: "מחזיר רשימת כל העובדים בארגון עם הכשירויות והזמינויות שלהם.",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string" } },
      required: ["org_id"]
    }
  },
  {
    name: "update_organization_config",
    description: "מעדכן את הגדרות הארגון. השתמש בכלי הזה כשהמנהל רוצה לשנות את המשמרות, התפקידים, הכשירויות הנדרשות, או מספר העובדים הנדרשים בכל משמרת.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string" },
        updates: {
          type: "object",
          description: "שדות לעדכון. יכול לכלול shiftTypes, roles, qualifications, scheduleRequirements, constraints."
        }
      },
      required: ["org_id", "updates"]
    }
  },
  {
    name: "run_scheduler",
    description: "מריץ את אלגוריתם הסידור ומחשב סידור עבודה לשבוע הנתון. קרא לכלי הזה רק אחרי שהגדרות הארגון מוכנות.",
    input_schema: {
      type: "object",
      properties: {
        manager_id: { type: "number", description: "מזהה המנהל" },
        week_start_date: { type: "string", description: "תאריך תחילת השבוע בפורמט YYYY-MM-DD" }
      },
      required: ["manager_id", "week_start_date"]
    }
  },
  {
    name: "get_schedule_result",
    description: "מחזיר את תוצאת הסידור האחרון — לוח הסידור המלא ורשימת המשמרות שלא שובצו (notes).",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string" } },
      required: ["org_id"]
    }
  }
];

// Execute a tool call from the agent
async function executeTool(toolName, toolInput, managerId) {
  const db = await getAgentDb();

  if (toolName === "get_organization_config") {
    const org = await db.collection("organizations").findOne({ _id: toolInput.org_id });
    return org ? JSON.stringify(org, null, 2) : `לא נמצא ארגון עם מזהה ${toolInput.org_id}`;
  }

  if (toolName === "get_employees") {
    const emps = await db.collection("employees").find({ organizationId: toolInput.org_id }).toArray();
    return JSON.stringify(emps.map(e => ({
      id: e._id, name: e.name, isManager: e.isManager,
      qualifications: e.qualifications, eligibleRoles: e.eligibleRoles,
      availableDays: (e.selectedDays || []).map(d => `${d.day}: ${(d.shifts || []).join(', ')}`)
    })), null, 2);
  }

  if (toolName === "update_organization_config") {
    const setDoc = {};
    for (const [k, v] of Object.entries(toolInput.updates)) {
      setDoc[k] = v;
    }
    await db.collection("organizations").updateOne(
      { _id: toolInput.org_id },
      { $set: setDoc },
      { upsert: true }
    );
    return `הגדרות הארגון עודכנו בהצלחה.`;
  }

  if (toolName === "run_scheduler") {
    const result = await runScheduler(toolInput.manager_id, toolInput.week_start_date);
    return `הסקדולר רץ בהצלחה לשבוע ${toolInput.week_start_date}.`;
  }

  if (toolName === "get_schedule_result") {
    const result = await db.collection("result").findOne(
      { organizationId: toolInput.org_id, Week: "Now" },
      { sort: { generatedAt: -1 } }
    );
    if (!result) return "לא נמצא סידור שמור לארגון זה.";

    const idToName = result.idToName || {};
    const summary = [];
    const issues = result.notes || [];

    for (const [day, shifts] of Object.entries(result.schedule || {})) {
      for (const [shiftId, assignments] of Object.entries(shifts)) {
        for (const a of assignments) {
          const name = idToName[String(a.worker_id)] || (a.worker_id < 0 ? '⚠ לא שובץ' : `ID ${a.worker_id}`);
          summary.push(`${day} ${shiftId} - ${a.roleId}: ${name}`);
        }
      }
    }

    return JSON.stringify({
      status: result.status,
      weekStartDate: result.relevantWeekStartDate,
      assignments: summary,
      issues: issues.map(n => `${n.shift} - ${n.roleId}: לא שובץ`)
    }, null, 2);
  }

  return `כלי לא מוכר: ${toolName}`;
}

app.post("/api/agent/chat", async (req, res) => {
  const { userId, orgId, message, conversationHistory = [] } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ success: false, message: "חסר userId או message" });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    return res.status(500).json({ success: false, message: "ANTHROPIC_API_KEY לא מוגדר ב-.env" });
  }

  try {
    const db = await getAgentDb();

    // Resolve organizationId from employee record
    let resolvedOrgId = orgId;
    if (!resolvedOrgId) {
      const emp = await db.collection("employees").findOne({ _id: parseInt(userId) });
      resolvedOrgId = emp?.organizationId || null;
    }

    const org = resolvedOrgId
      ? await db.collection("organizations").findOne({ _id: resolvedOrgId })
      : null;

    const systemPrompt = `אתה עוזר AI חכם למנהל עבודה במערכת SafeShift לניהול סידורי עבודה.
${org ? `שם הארגון: ${org.name}` : 'הארגון טרם הוגדר.'}
מזהה מנהל: ${userId}
${resolvedOrgId ? `מזהה ארגון: ${resolvedOrgId}` : ''}

תפקידך:
- לעזור למנהל להגדיר את מבנה הסידור שלו (משמרות, תפקידים, כשירויות נדרשות)
- להריץ את אלגוריתם הסידור ולהחזיר תוצאות
- להסביר בעברית פשוטה אילו משמרות לא שובצו ולמה (חסר עובדים עם הכשירות הנדרשת, אין מי שזמין וכו')
- לענות על שאלות על הסידור והעובדים

כשמנהל מתאר לך את מבנה הסידור שלו (כמה עובדים, אילו משמרות, אם יש עם נשק/בלי נשק, עמדות מסוימות) —
השתמש בכלים כדי לעדכן את הגדרות הארגון, ואז הצע להריץ את הסקדולר.

דבר תמיד בעברית. היה קצר, ברור ומועיל.`;

    const messages = [
      ...conversationHistory,
      { role: "user", content: message }
    ];

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages
    });

    const actions = [];

    // Agentic loop: keep running while the model wants to use tools
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
      const toolResults = [];

      for (const block of toolUseBlocks) {
        console.log(`[Agent] Calling tool: ${block.name}`, block.input);
        actions.push({ tool: block.name, input: block.input });
        const result = await executeTool(block.name, block.input, parseInt(userId));
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result
        });
      }

      // Continue the conversation with tool results
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        tools: AGENT_TOOLS,
        messages
      });
    }

    // Extract the final text reply
    const reply = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    // Add assistant reply to history for next turn
    const updatedHistory = [
      ...messages,
      { role: "assistant", content: response.content }
    ];

    res.json({ success: true, reply, actions, conversationHistory: updatedHistory });

  } catch (err) {
    console.error("[Agent] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}. Accessible on your local network.`);
});