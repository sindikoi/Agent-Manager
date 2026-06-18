require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const moment = require("moment");
const { MongoClient, ObjectId } = require("mongodb");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.json());
app.use(cors());

// ==============================================================================
// DATABASE (single source of truth — generic model on the "safeshift" DB)
// Collections: organizations, employees, result, announcements
// ==============================================================================
const dbURI = process.env.MONGO_URI;
if (!dbURI) {
  console.error("❌ Missing MONGO_URI environment variable. Create a .env file based on .env.example");
  process.exit(1);
}

let _db = null;
async function getDb() {
  if (!_db) {
    const client = new MongoClient(dbURI);
    await client.connect();
    _db = client.db("safeshift");
    console.log("✅ Connected to MongoDB (safeshift)");
  }
  return _db;
}

// Small async wrapper so route handlers can use try/catch
const handler = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`❌ Error in ${req.method} ${req.path}:`, err);
  res.status(500).json({ success: false, message: "Server error" });
});

// ==============================================================================
// AUTH
// ==============================================================================
app.post("/login", handler(async (req, res) => {
  const { id, password } = req.body;
  const numericId = parseInt(id);
  if (isNaN(numericId)) {
    return res.status(400).json({ success: false, message: "Invalid ID format" });
  }

  const db = await getDb();
  const user = await db.collection("employees").findOne({ _id: numericId });

  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: "Invalid ID or password" });
  }

  const org = user.organizationId
    ? await db.collection("organizations").findOne({ _id: user.organizationId })
    : null;

  res.json({
    success: true,
    id: user._id,
    name: user.name,
    isManager: user.isManager === true,
    // Back-compat fields used across the client UI:
    job: user.isManager ? "management" : "Employee",
    ShiftManager: user.isManager === true,
    organizationId: user.organizationId || null,
    organizationName: org ? org.name : user.organizationId || "",
    Workplace: org ? org.name : user.organizationId || "",
    qualifications: user.qualifications || [],
    eligibleRoles: user.eligibleRoles || [],
    selectedDays: user.selectedDays || [],
  });
}));

// ==============================================================================
// EMPLOYEE AVAILABILITY
// ==============================================================================
app.post("/EmployeeRequest", handler(async (req, res) => {
  const { userId, selectedDays } = req.body;
  if (!userId || !Array.isArray(selectedDays)) {
    return res.status(400).json({ success: false, message: "Invalid data format" });
  }
  const numericId = parseInt(userId, 10);
  if (isNaN(numericId)) {
    return res.status(400).json({ success: false, message: "Invalid userId format" });
  }

  const db = await getDb();
  await db.collection("employees").updateOne(
    { _id: numericId },
    { $set: { selectedDays, availabilityLastUpdated: new Date() } }
  );
  res.status(200).json({ success: true, message: "Days updated successfully" });
}));

app.get("/EmployeeRequest", handler(async (req, res) => {
  const userId = parseInt(req.query.userId);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: "Invalid userId format" });
  }
  const db = await getDb();
  const user = await db.collection("employees").findOne({ _id: userId });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, selectedDays: user.selectedDays || [] });
}));

// ==============================================================================
// ORGANIZATION CONFIG (shiftTypes, roles, qualifications, scheduleRequirements)
// ==============================================================================
app.get("/api/organization/:orgId", handler(async (req, res) => {
  const db = await getDb();
  const org = await db.collection("organizations").findOne({ _id: req.params.orgId });
  if (!org) return res.status(404).json({ success: false, message: "Organization not found" });
  res.json({ success: true, organization: org });
}));

app.put("/api/organization/:orgId", handler(async (req, res) => {
  const { updates } = req.body;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ success: false, message: "Missing updates object" });
  }
  const allowed = ["name", "shiftTypes", "qualifications", "roles", "scheduleRequirements", "constraints"];
  const setDoc = {};
  for (const key of allowed) {
    if (key in updates) setDoc[key] = updates[key];
  }
  const db = await getDb();
  await db.collection("organizations").updateOne(
    { _id: req.params.orgId },
    { $set: setDoc },
    { upsert: true }
  );
  res.json({ success: true, message: "Organization updated" });
}));

// Convenience aliases used by the requirements screen
app.get("/get-schedule/:orgId", handler(async (req, res) => {
  const db = await getDb();
  const org = await db.collection("organizations").findOne({ _id: req.params.orgId });
  if (!org) return res.status(404).json({ message: "Organization not found", scheduleRequirements: {} });
  res.json({
    scheduleRequirements: org.scheduleRequirements || {},
    shiftTypes: org.shiftTypes || [],
    roles: org.roles || [],
    qualifications: org.qualifications || [],
  });
}));

app.post("/save-schedule/:orgId", handler(async (req, res) => {
  const { scheduleRequirements } = req.body;
  if (!scheduleRequirements || typeof scheduleRequirements !== "object") {
    return res.status(400).json({ success: false, message: "scheduleRequirements is missing or invalid." });
  }
  const db = await getDb();
  const result = await db.collection("organizations").updateOne(
    { _id: req.params.orgId },
    { $set: { scheduleRequirements } }
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ success: false, message: `Organization "${req.params.orgId}" not found.` });
  }
  res.json({ success: true, message: "Requirements saved." });
}));

// ==============================================================================
// SCHEDULER (spawns the generic Python solver)
// ==============================================================================
function runSchedulerProcess(managerId, weekStartDate) {
  return new Promise((resolve, reject) => {
    const pyPath = path.join(__dirname, "..", "Python", "Constraints.py");
    const args = [pyPath, "--mode", "manual", "--manager-id", String(managerId), "--target-week", weekStartDate];
    const pyExecutable = process.env.PYTHON_BIN || "python";
    console.log(`[Server] Spawning: ${pyExecutable} ${args.join(" ")}`);
    const proc = spawn(pyExecutable, args);
    let out = "", err = "";
    proc.stdout.on("data", (d) => { out += d.toString(); console.log(`[Python] ${d.toString().trim()}`); });
    proc.stderr.on("data", (d) => { err += d.toString(); console.error(`[Python ERR] ${d.toString().trim()}`); });
    proc.on("close", (code) => {
      if (code === 0) resolve({ success: true, output: out });
      else reject(new Error(err || `Python exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

app.post("/api/run-scheduler/:orgId", handler(async (req, res) => {
  const orgId = req.params.orgId;
  const { targetWeekStartDate } = req.body;

  if (!targetWeekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetWeekStartDate)) {
    return res.status(400).json({ message: "Invalid or missing targetWeekStartDate (YYYY-MM-DD)." });
  }

  const db = await getDb();
  const manager = await db.collection("employees").findOne({ organizationId: orgId, isManager: true });
  if (!manager) {
    return res.status(404).json({ message: `No manager found for organization "${orgId}".` });
  }

  try {
    const result = await runSchedulerProcess(manager._id, targetWeekStartDate);
    res.json({ success: true, message: "הסידור חושב בהצלחה!", output: result.output });
  } catch (e) {
    res.status(500).json({ success: false, message: "שגיאה בהרצת הסקדולר.", error: e.message });
  }
}));

// ==============================================================================
// GENERATED SCHEDULES (read results written by Python)
// ==============================================================================
app.get("/api/generated-schedules/:orgId", handler(async (req, res) => {
  const orgId = req.params.orgId;
  const db = await getDb();

  const today = moment().startOf("day");
  let currentWeekStart = moment(today).day(6); // Saturday
  if (currentWeekStart.isAfter(today)) currentWeekStart = currentWeekStart.subtract(7, "days");
  const nextWeekStart = moment(currentWeekStart).add(7, "days");
  const currentWeekDbDate = moment(currentWeekStart).add(1, "days").format("YYYY-MM-DD");
  const nextWeekDbDate = moment(nextWeekStart).add(1, "days").format("YYYY-MM-DD");

  const recent = await db.collection("result")
    .find({ organizationId: orgId, relevantWeekStartDate: { $in: [currentWeekDbDate, nextWeekDbDate] } })
    .toArray();

  const nextSchedule = recent.find((s) => s.relevantWeekStartDate === nextWeekDbDate) || null;
  const nowSchedule = recent.find((s) => s.relevantWeekStartDate === currentWeekDbDate) || null;

  const oldSchedules = await db.collection("result")
    .find({ organizationId: orgId, relevantWeekStartDate: { $nin: [currentWeekDbDate, nextWeekDbDate] } })
    .sort({ generatedAt: -1 }).limit(5).toArray();

  let idToName = {};
  if (nextSchedule?.idToName) idToName = nextSchedule.idToName;
  else if (nowSchedule?.idToName) idToName = nowSchedule.idToName;
  else if (oldSchedules[0]?.idToName) idToName = oldSchedules[0].idToName;

  res.json({ success: true, now: nowSchedule, next: nextSchedule, old: oldSchedules, idToName });
}));

// ==============================================================================
// ANNOUNCEMENTS
// ==============================================================================
app.get("/api/announcements", handler(async (req, res) => {
  const db = await getDb();
  const filter = req.query.orgId ? { organizationId: req.query.orgId } : {};
  const docs = await db.collection("announcements").find(filter).sort({ date: -1 }).limit(10).toArray();
  res.json({ success: true, announcements: docs });
}));

app.post("/api/announcements", handler(async (req, res) => {
  const { message, organizationId } = req.body;
  if (!message) return res.status(400).json({ success: false, message: "Missing message" });
  const db = await getDb();
  const doc = { message, date: new Date(), organizationId: organizationId || null };
  await db.collection("announcements").insertOne(doc);
  res.json({ success: true, inserted: doc });
}));

app.delete("/api/announcements/:id", handler(async (req, res) => {
  const db = await getDb();
  await db.collection("announcements").deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ success: true });
}));

// ==============================================================================
// AGENT ENDPOINT (Claude)
// ==============================================================================
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_TOOLS = [
  {
    name: "get_organization_config",
    description: "מחזיר את הגדרות הארגון: משמרות (shiftTypes), תפקידים (roles), כשירויות (qualifications), ודרישות סידור (scheduleRequirements). קרא לכלי הזה כדי להבין מה מוגדר כרגע.",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string", description: "מזהה הארגון" } },
      required: ["org_id"],
    },
  },
  {
    name: "get_employees",
    description: "מחזיר רשימת כל העובדים בארגון עם הכשירויות והזמינויות שלהם.",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string" } },
      required: ["org_id"],
    },
  },
  {
    name: "update_organization_config",
    description: "מעדכן את הגדרות הארגון. השתמש בכלי הזה כשהמנהל רוצה לשנות את המשמרות, התפקידים, הכשירויות הנדרשות, או מספר העובדים הנדרשים בכל משמרת.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string" },
        updates: { type: "object", description: "שדות לעדכון: shiftTypes, roles, qualifications, scheduleRequirements, constraints." },
      },
      required: ["org_id", "updates"],
    },
  },
  {
    name: "run_scheduler",
    description: "מריץ את אלגוריתם הסידור ומחשב סידור עבודה לשבוע הנתון. קרא לכלי הזה רק אחרי שהגדרות הארגון מוכנות.",
    input_schema: {
      type: "object",
      properties: {
        manager_id: { type: "number", description: "מזהה המנהל" },
        week_start_date: { type: "string", description: "תאריך תחילת השבוע בפורמט YYYY-MM-DD" },
      },
      required: ["manager_id", "week_start_date"],
    },
  },
  {
    name: "get_schedule_result",
    description: "מחזיר את תוצאת הסידור האחרון — לוח הסידור המלא ורשימת המשמרות שלא שובצו (notes).",
    input_schema: {
      type: "object",
      properties: { org_id: { type: "string" } },
      required: ["org_id"],
    },
  },
];

async function executeTool(toolName, toolInput) {
  const db = await getDb();

  if (toolName === "get_organization_config") {
    const org = await db.collection("organizations").findOne({ _id: toolInput.org_id });
    return org ? JSON.stringify(org, null, 2) : `לא נמצא ארגון עם מזהה ${toolInput.org_id}`;
  }

  if (toolName === "get_employees") {
    const emps = await db.collection("employees").find({ organizationId: toolInput.org_id }).toArray();
    return JSON.stringify(emps.map((e) => ({
      id: e._id, name: e.name, isManager: e.isManager,
      qualifications: e.qualifications, eligibleRoles: e.eligibleRoles,
      availableDays: (e.selectedDays || []).map((d) => `${d.day}: ${(d.shifts || []).join(", ")}`),
    })), null, 2);
  }

  if (toolName === "update_organization_config") {
    const setDoc = {};
    for (const [k, v] of Object.entries(toolInput.updates)) setDoc[k] = v;
    await db.collection("organizations").updateOne({ _id: toolInput.org_id }, { $set: setDoc }, { upsert: true });
    return "הגדרות הארגון עודכנו בהצלחה.";
  }

  if (toolName === "run_scheduler") {
    await runSchedulerProcess(toolInput.manager_id, toolInput.week_start_date);
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
    for (const [day, shifts] of Object.entries(result.schedule || {})) {
      for (const [shiftId, assignments] of Object.entries(shifts)) {
        for (const a of assignments) {
          const name = idToName[String(a.worker_id)] || (a.worker_id < 0 ? "⚠ לא שובץ" : `ID ${a.worker_id}`);
          summary.push(`${day} ${shiftId} - ${a.roleId}: ${name}`);
        }
      }
    }
    return JSON.stringify({
      status: result.status,
      weekStartDate: result.relevantWeekStartDate,
      assignments: summary,
      issues: (result.notes || []).map((n) => `${n.shift} - ${n.roleId}: לא שובץ`),
    }, null, 2);
  }

  return `כלי לא מוכר: ${toolName}`;
}

app.post("/api/agent/chat", handler(async (req, res) => {
  const { userId, orgId, message, conversationHistory = [] } = req.body;
  if (!userId || !message) {
    return res.status(400).json({ success: false, message: "חסר userId או message" });
  }
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "your_anthropic_api_key_here") {
    return res.status(500).json({ success: false, message: "ANTHROPIC_API_KEY לא מוגדר ב-.env" });
  }

  const db = await getDb();
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const emp = await db.collection("employees").findOne({ _id: parseInt(userId) });
    resolvedOrgId = emp?.organizationId || null;
  }
  const org = resolvedOrgId
    ? await db.collection("organizations").findOne({ _id: resolvedOrgId })
    : null;

  const systemPrompt = `אתה עוזר AI חכם למנהל עבודה במערכת SafeShift לניהול סידורי עבודה.
${org ? `שם הארגון: ${org.name}` : "הארגון טרם הוגדר."}
מזהה מנהל: ${userId}
${resolvedOrgId ? `מזהה ארגון: ${resolvedOrgId}` : ""}

תפקידך:
- לעזור למנהל להגדיר את מבנה הסידור שלו (משמרות, תפקידים, כשירויות נדרשות)
- להריץ את אלגוריתם הסידור ולהחזיר תוצאות
- להסביר בעברית פשוטה אילו משמרות לא שובצו ולמה (חסר עובדים עם הכשירות הנדרשת, אין מי שזמין וכו')
- לענות על שאלות על הסידור והעובדים

כשמנהל מתאר לך את מבנה הסידור שלו (כמה עובדים, אילו משמרות, אילו תפקידים, מי כשיר למה) —
השתמש בכלים כדי לעדכן את הגדרות הארגון, ואז הצע להריץ את הסקדולר.

דבר תמיד בעברית. היה קצר, ברור ומועיל.`;

  const messages = [...conversationHistory, { role: "user", content: message }];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    tools: AGENT_TOOLS,
    messages,
  });

  const actions = [];
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];
    for (const block of toolUseBlocks) {
      console.log(`[Agent] Tool: ${block.name}`, block.input);
      actions.push({ tool: block.name, input: block.input });
      const result = await executeTool(block.name, block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      tools: AGENT_TOOLS,
      messages,
    });
  }

  const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const updatedHistory = [...messages, { role: "assistant", content: response.content }];
  res.json({ success: true, reply, actions, conversationHistory: updatedHistory });
}));

// ==============================================================================
const PORT = process.env.PORT || 3002;
getDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}. Accessible on your local network.`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB on startup:", err);
    process.exit(1);
  });
