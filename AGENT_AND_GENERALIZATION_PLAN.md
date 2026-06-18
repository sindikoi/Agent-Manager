# SafeShift → Generic Scheduling Platform + AI Agent
## מסמך תכנון להעברה ל-Claude Code

---

## 0. רקע ומטרה

הפרויקט הקיים (SafeShift) הוא מערכת לסידור עבודה של מאבטחי מלונות, עם
אילוצים hardcoded לתעשייה הזו (`WeaponCertified`, `with_weapon`,
`without_weapon`, תפקיד קשיח `Shift Supervisor`, משמרות קבועות
Morning/Afternoon/Evening, ישות `hotel`).

**המטרה:** להכליל את המערכת כך שכל חברה (לא רק מלונות, לא רק אבטחה) תוכל
להגדיר עבור עצמה:
- את המשמרות שלה (שמות, שעות, מספר משמרות ביום - גמיש)
- את התפקידים שלה (לא רק "מאבטח" - יכול להיות "קופאי", "טבח", "נהג" וכו')
- את הכשירויות הנדרשות לכל תפקיד (גמיש - לא רק "עם/בלי נשק")

ובנוסף, להוסיף **שכבת סוכן AI** שמאפשרת למנהל לתקשר בשפה חופשית (עברית),
לבקש סידורים, ולקבל הסברים על תוצאות (כולל משמרות שלא שובצו).

---

## 1. מבנה הנתונים החדש (MongoDB)

### Collection: `organizations`
מחליף את `Workplace`. ישות מרכזית שמגדירה את "חוקי המשחק" של החברה.

```json
{
  "_id": "org_001",
  "name": "Café Aroma Tel Aviv",

  "shiftTypes": [
    { "id": "morning", "name": "בוקר", "startTime": "07:00", "endTime": "15:00" },
    { "id": "evening", "name": "ערב",  "startTime": "15:00", "endTime": "23:00" }
  ],

  "qualifications": [
    { "id": "barista", "name": "הכשרת בריסטה" },
    { "id": "cashier_cert", "name": "הרשאת קופה" },
    { "id": "food_handler", "name": "תעודת עוסק במזון" }
  ],

  "roles": [
    {
      "id": "shift_manager",
      "name": "אחראי משמרת",
      "requiredQualifications": [],
      "isManagerRole": true
    },
    {
      "id": "barista_role",
      "name": "בריסטה",
      "requiredQualifications": ["barista"]
    },
    {
      "id": "cashier_role",
      "name": "קופאי",
      "requiredQualifications": ["cashier_cert"]
    }
  ],

  "scheduleRequirements": {
    "Sunday":    { "morning": { "shift_manager": 1, "barista_role": 2, "cashier_role": 1 },
                   "evening": { "shift_manager": 1, "barista_role": 1 } },
    "Monday":    { "...": "..." }
  },

  "constraints": {
    "maxWorkDaysPerWeek": 6,
    "fairnessMaxDiff": 3,
    "forbiddenShiftSequences": [
      { "from": "evening", "to": "morning", "sameNextDay": true }
    ]
  }
}
```

**הערות:**
- `shiftTypes` - רשימה דינמית. יכולה להיות 2, 3, 4 משמרות ביום, בכל שם ושעות.
- `roles` - כל תפקיד מגדיר אילו `qualifications` נדרשות. תפקיד בלי
  `requiredQualifications` = כל עובד יכול למלא אותו (כמו "ללא נשק" הישן).
  `isManagerRole: true` מסמן תפקיד שרק עובדים עם `isManager: true` ימלאו.
- `scheduleRequirements[day][shiftId][roleId] = count` - כמה אנשים בתפקיד
  הזה נדרשים במשמרת הזו ביום הזה.
- `constraints.forbiddenShiftSequences` - מכליל את "אין בוקר אחרי ערב"
  לכל זוג משמרות שהחברה תגדיר (או תשאיר ברירת מחדל ריקה).

### Collection: `employees`
מחליף את `people`.

```json
{
  "_id": 101,
  "name": "דנה לוי",
  "password": "...",
  "organizationId": "org_001",
  "isManager": false,
  "qualifications": ["barista", "cashier_cert"],
  "eligibleRoles": ["barista_role", "cashier_role"],
  "selectedDays": [
    { "day": "Sunday", "shifts": ["morning"] },
    { "day": "Monday", "shifts": ["morning", "evening"] }
  ]
}
```

**הערות:**
- `eligibleRoles` - אופציונלי. אם ריק/לא קיים, ה-eligibility מחושב
  אוטומטית מ-`qualifications` מול `role.requiredQualifications`.
- `isManager` מחליף את `ShiftManager` - עובד שיכול למלא role עם
  `isManagerRole: true`.

### Collection: `results`
דומה למבנה הקיים של `result`, אך עם `organizationId`/`organizationName`
במקום `hotelName`, ו-`shiftId`/`roleId` גנריים במקום `shift`/`position`
המחרוזתיים.

### Collection: `announcements`
ללא שינוי מבני.

---

## 2. שינויים ב-Python (`/Python`)

### `Algo.py`
- `getData` (דרך `MongoConnection`) תחזיר: `organization` (מ-`organizations`),
  ו-`employees` (כל העובדים של אותו `organizationId`).
- `run_algo`:
  - במקום ללכת לפי `hotel_schedule[shift][position][day]` עם מבנה קשיח
    `weapon`/`noWeapon`, ילך לפי
    `org.scheduleRequirements[day][shiftId][roleId] = count`.
  - לכל `(day, shiftId, roleId, i in range(count))` ייצור משתנה
    `f"{shiftId}_{roleId}_{day}_{i}"`.
  - `possible_workers` לכל משתנה = רשימת עובדים שעומדים בדרישות:
    - אם `role.requiredQualifications` ריק וגם `isManagerRole` לא קיים →
      כל העובדים
    - אחרת אם `role.requiredQualifications` לא ריק → עובדים ש-
      `set(role.requiredQualifications) ⊆ set(employee.qualifications)`
    - אם `role.isManagerRole == True` → רק עובדים עם `employee.isManager == True`

- `available_workers`:
  - כללי לגמרי - בונה `{day: {shiftId: {roleId: [employee_id, ...]}}}`
    לפי `employee.selectedDays` ו-eligibility (במקום הקטגוריות הקשיחות
    `shift_managers`/`with_weapon`/`without_weapon`).

### `OrTools.py`
- `available_shift`: יורש את הסינון מ-`available_workers` ללא שינוי
  משמעותי במבנה - רק המפתחות (`roleId` במקום `position`, `shiftId` במקום
  `shift`) הם כלליים עכשיו.
- `variables_for_shifts`: ללא שינוי לוגי - רק עובד על המבנה הכללי.

### `Constraints.py`
- `one_shift_per_day`, `at_least_one_day_off`, `fairness_constraint`:
  ללא שינוי לוגי משמעותי - מבוססים על `worker_id`/`var_info['day']`
  שנשארים, רק `var_info['shift']`/`['position']` מתורגמים ל-`shiftId`/`roleId`.
- `no_morning_after_evening` → **להחליף** ב-
  `apply_forbidden_shift_sequences(variables, model, workers, variable_model, days, forbidden_sequences)`:
  - עבור כל `{from: shiftA, to: shiftB, sameNextDay: bool}` ב-
    `org.constraints.forbiddenShiftSequences`, מייצר את אותו סוג אילוץ
    implication שהיה קודם, אבל עבור כל זוג משמרות שהחברה הגדירה (לא רק
    Evening→Morning).
  - אם `forbiddenShiftSequences` ריקה - לא מופעל אילוץ (גמיש לחלוטין).
- `prevent_sunday_morning_after_saturday_evening_last_week` → להכליל
  לפי אותו מנגנון: "המשמרת האחרונה בשבוע הקודם" מול "המשמרת הראשונה
  בשבוע הנוכחי", לפי `forbiddenShiftSequences` ו-`shiftTypes` הספציפיים
  לחברה (default להישאר Sunday-Saturday אם לא הוגדר אחרת).
- `main()`:
  - יקבל `organization_id` במקום `manager_id` כפרמטר מרכזי (או ימשיך
    לקבל `manager_id` ויגזור ממנו `organization_id` דרך `employee` הרשום
    כ-manager).
  - `days` ייגזרו מ-`org` אם יש סדר ימים מותאם, אחרת default
    `['Sunday', ..., 'Saturday']`.
  - השמירה ל-Mongo: `result_doc` יכלול `organizationId`/`organizationName`,
    `idToName`, `schedule` עם `shiftId`/`roleId`.

### `MongoConnection.py`
- כבר תוקן ל-`.env` (`MONGO_URI`).
- `getData(user_id)` → לעדכן שאילתות: `employees` collection,
  `organizations` collection. `manager.Workplace` → `employee.organizationId`.

---

## 3. שינויים ב-Server (`/Server/server.js`)

- `people_coll` → `employees_coll`, `Workplace_coll` → `organizations_coll`,
  `result_coll` נשאר (עם שדות מעודכנים).
- `/login` - ללא שינוי לוגי, רק שמות שדות (`Workplace` → `organizationId`).
- **endpoint חדש**: `GET /api/organization/:orgId` - מחזיר את כל הגדרת
  הארגון (`shiftTypes`, `roles`, `qualifications`, `scheduleRequirements`,
  `constraints`) - לטעינת מסכי ההגדרות וההגשה בקליינט.
- **endpoint חדש**: `PUT /api/organization/:orgId` - שמירת הגדרות ארגון
  (לאחר עריכה ב-UI ניהול).
- `/get-schedule/:hotelName` → `/get-schedule/:orgId` (מחזיר
  `scheduleRequirements`).
- `/save-schedule/:hotelName` → `/save-schedule/:orgId`.
- endpoint הרצת הסקדולר - יעבור `organizationId` ל-Python במקום
  `manager-id` בלבד (או בנוסף).
- **endpoint חדש לסוכן**: `POST /api/agent/chat`
  - body: `{ organizationId, userId, message, conversationHistory }`
  - מפעיל את שכבת הסוכן (סעיף 5) ומחזיר תשובה טקסטואלית + אופציונלית
    פעולות שביצע (`actions: [...]`, למשל "ran_scheduler", "fetched_schedule").

---

## 4. שינויים ב-Client (`/Client`)

### מסך חדש: "הגדרות ארגון" (Organization Settings) - למנהל
- ניהול `shiftTypes`: הוספה/מחיקה/עריכה של משמרות (שם + שעות).
- ניהול `qualifications`: רשימת כשירויות חופשית (טקסט בלבד).
- ניהול `roles`: שם תפקיד + בחירת `requiredQualifications` (multi-select
  מתוך `qualifications`) + checkbox "תפקיד ניהולי" (`isManagerRole`).
- ניהול `constraints.forbiddenShiftSequences`: ממשק לבחירת זוגות
  משמרות אסורים (לדוגמה: "אחרי ערב לא בוקר למחרת").

### `ManageHours.js`
- `defaultPositions` הקשיח (`Control`, `Patrol`, ...) → נטען דינמית
  מ-`org.roles`.
- `shifts = ['Morning','Afternoon','Evening']` הקשיח → נטען דינמית
  מ-`org.shiftTypes`.
- `createInitialSchedule` תיבנה דינמית מ-`shiftTypes` × `roles` × `days`,
  עם `count: 0` לכל תא (לא `weapon`/`noWeapon`).

### `EmployeeRequest.js`
- `shiftTypes = ["Morning","Afternoon","Evening"]` הקשיח → נטען
  מ-`org.shiftTypes` (id+name להצגה).
- `selectedDays[].shifts` יכילו `shiftType.id` במקום מחרוזות קשיחות.

### מסך חדש: "צ'אט עם הסוכן" (Agent Chat) - למנהל
- ממשק צ'אט פשוט: תיבת הודעות + שליחה ל-`/api/agent/chat`.
- מציג תשובות הסוכן + (אופציונלי) badges לפעולות שבוצעו
  ("✅ הרצתי את הסידור לשבוע הבא").

---

## 5. שכבת הסוכן (Agent Layer) - חדש

### מיקום
שירות נפרד (יכול להיות תוך-process ב-Server, או microservice קטן),
שמדבר עם Anthropic API (Claude).

### Tools שהסוכן יכול לקרוא (tool-use)

| Tool | תיאור | Side-effect? |
|---|---|---|
| `get_organization_config(org_id)` | מחזיר shiftTypes, roles, qualifications, scheduleRequirements | קריאה בלבד |
| `get_schedule(org_id, week_start_date)` | מחזיר סידור קיים (מ-`results`) | קריאה בלבד |
| `get_employee_availability(org_id, employee_id?)` | זמינות עובד/כל העובדים | קריאה בלבד |
| `explain_schedule_issues(org_id, week_start_date)` | מנתח `notes`/`status: partial` ומסביר מי לא שובץ ולמה | קריאה בלבד |
| `run_scheduler(org_id, week_start_date)` | מריץ את `Constraints.py` (spawn) | **כתיבה ל-DB** |

### זרימת שיחה (System Prompt)
הסוכן מקבל system prompt שמסביר לו:
- הוא עוזר למנהל [שם הארגון] לנהל סידור עבודה.
- יש לו גישה לכלים הנ"ל.
- כשמנהל מבקש "תכין סידור" - להבין לאיזה שבוע, ולקרוא ל-`run_scheduler`.
- כשמנהל שואל "למה X לא משובץ" - לקרוא ל-`explain_schedule_issues` ו/או
  `get_employee_availability` ולהסביר בעברית פשוטה.
- תשובות קצרות, ברורות, בעברית.

### שלב 1 (MVP מומלץ)
להתחיל **רק** עם tools של קריאה (`get_*`, `explain_*`) - בטוח, ללא
side-effects. `run_scheduler` (שמריץ תהליך וכותב ל-DB) להוסיף בשלב 2
אחרי שה-MVP נבדק.

---

## 6. סדר עבודה מומלץ ל-Claude Code

1. **לא לגעת עדיין ב-DB** - להתחיל מהקוד: ליישם את המודל הגנרי
   (סעיפים 1-3) על קוד שמדבר עם DB ריק/seed.
2. ליצור סקריפט `seed_data.py` שמכניס ל-DB החדש (לאחר פתיחת Atlas
   ע"י המשתמשת) ארגון דמה אחד (לא מלון - למשל "בית קפה") עם
   shiftTypes/roles/qualifications/employees לדוגמה, כדי לבדוק E2E.
3. להריץ את ה-scheduler על הדאטה הגנרי ולוודא שמתקבל סידור תקין.
4. לעדכן Client (ManageHours, EmployeeRequest) לעבוד דינמית.
5. להוסיף שכבת agent (tools קריאה בלבד) + endpoint + מסך chat.
6. (אופציונלי, שלב מאוחר) להוסיף `run_scheduler` tool עם side-effects,
   ואז Cowork packaging להפצה לצוות לא-טכני.

---

## 7. נקודות פתוחות (אפשר להחליט תוך כדי עבודה ב-Claude Code)

- האם "ימי שבוע" תמיד Sunday-Saturday, או שגם זה גמיש לכל חברה (יש
  חברות שמתחילות שבוע ביום אחר)?
- שפת ממשק יחידה (עברית) או דו-לשוני (עברית/אנגלית) ב-Client?

---

## 8. תזכורת אבטחה

ראו `SECURITY_SETUP.md` - יש ליצור `.env` עם `MONGO_URI` חדש (cluster
חדש שהמשתמשת תפתח בעצמה) לפני שמתחילים לעבוד עם DB אמיתי. הסיסמה הישנה
(`alon123179`) כבר לא בקוד, וגם הקלאסטר הישן כבר לא קיים (DNS לא נמצא).
