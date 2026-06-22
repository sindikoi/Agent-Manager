import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Setup.css";

const TEMPLATES = {
  cafe: {
    label: "בית קפה",
    shifts: ["בוקר", "ערב"],
    roles: [
      { name: "אחראי משמרת", count: 1, isManager: true },
      { name: "בריסטה", count: 2, isManager: false },
      { name: "קופאי", count: 1, isManager: false },
    ],
  },
  restaurant: {
    label: "מסעדה",
    shifts: ["בוקר", "צהריים", "ערב"],
    roles: [
      { name: "אחראי משמרת", count: 1, isManager: true },
      { name: "מלצר", count: 3, isManager: false },
      { name: "טבח", count: 2, isManager: false },
    ],
  },
  security: {
    label: "אבטחה",
    shifts: ["בוקר", "צהריים", "ערב"],
    roles: [
      { name: "אחראי משמרת", count: 1, isManager: true },
      { name: "מאבטח", count: 2, isManager: false },
    ],
  },
  retail: {
    label: "חנות",
    shifts: ["בוקר", "ערב"],
    roles: [
      { name: "אחראי משמרת", count: 1, isManager: true },
      { name: "מוכר", count: 2, isManager: false },
      { name: "קופאי", count: 1, isManager: false },
    ],
  },
  custom: {
    label: "כללי",
    shifts: ["בוקר", "ערב"],
    roles: [
      { name: "אחראי משמרת", count: 1, isManager: true },
      { name: "עובד", count: 2, isManager: false },
    ],
  },
};

const Setup = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const orgId = user.organizationId || user.Workplace || "";

  const [templateKey, setTemplateKey] = useState("cafe");
  const [shifts, setShifts] = useState(TEMPLATES.cafe.shifts);
  const [roles, setRoles] = useState(TEMPLATES.cafe.roles);
  const [numEmployees, setNumEmployees] = useState(8);
  const [demoAvailability, setDemoAvailability] = useState(true);

  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");

  const pickTemplate = (key) => {
    setTemplateKey(key);
    setShifts([...TEMPLATES[key].shifts]);
    setRoles(TEMPLATES[key].roles.map((r) => ({ ...r })));
  };

  const updateShift = (i, value) =>
    setShifts((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  const addShift = () => setShifts((prev) => [...prev, ""]);
  const removeShift = (i) => setShifts((prev) => prev.filter((_, idx) => idx !== i));

  const updateRole = (i, field, value) =>
    setRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addRole = () =>
    setRoles((prev) => [...prev, { name: "", count: 1, isManager: false }]);
  const removeRole = (i) => setRoles((prev) => prev.filter((_, idx) => idx !== i));

  const handleBuild = async () => {
    if (!orgId) {
      setError("למשתמש לא משויך ארגון. יש להתחבר כמנהל.");
      return;
    }
    setError("");
    setReply("");
    setAccounts([]);
    setBusy(true);
    try {
      const res = await axios.post(`/api/setup-organization/${encodeURIComponent(orgId)}`, {
        businessLabel: TEMPLATES[templateKey].label,
        shifts,
        roles,
        numEmployees,
        demoAvailability,
      });
      if (res.data.success) {
        setReply(res.data.reply || "ההגדרה הושלמה.");
        setAccounts(res.data.accounts || []);
      } else {
        setError(res.data.message || "ההקמה נכשלה.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "אירעה שגיאה בהקמת הארגון.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-page setup-page">
      <header className="setup-head">
        <h1>הגדרת סידור עבודה</h1>
        <p className="ss-muted">בחרי את מבנה הסידור — המערכת תבנה הכל ותריץ את האלגוריתם.</p>
      </header>

      <section className="ss-card setup-section">
        <h3>סוג העסק</h3>
        <div className="setup-templates">
          {Object.entries(TEMPLATES).map(([key, t]) => (
            <button
              key={key}
              className={`setup-template${templateKey === key ? " setup-template--on" : ""}`}
              onClick={() => pickTemplate(key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ss-card setup-section">
        <h3>משמרות ביום</h3>
        <div className="setup-chips">
          {shifts.map((s, i) => (
            <div className="setup-chip" key={i}>
              <input
                className="ss-input"
                value={s}
                onChange={(e) => updateShift(i, e.target.value)}
                placeholder="שם המשמרת"
              />
              <button className="setup-x" onClick={() => removeShift(i)} aria-label="מחיקה">✕</button>
            </div>
          ))}
          <button className="ss-btn ss-btn-ghost setup-add" onClick={addShift}>+ משמרת</button>
        </div>
      </section>

      <section className="ss-card setup-section">
        <h3>תפקידים וכמות נדרשת</h3>
        <div className="setup-roles">
          {roles.map((r, i) => (
            <div className="setup-role" key={i}>
              <input
                className="ss-input setup-role-name"
                value={r.name}
                onChange={(e) => updateRole(i, "name", e.target.value)}
                placeholder="שם התפקיד"
              />
              <label className="setup-role-count">
                כמות
                <input
                  type="number"
                  min="0"
                  value={r.count}
                  onChange={(e) => updateRole(i, "count", Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
              </label>
              <label className="setup-role-mgr">
                <input
                  type="checkbox"
                  checked={r.isManager}
                  onChange={(e) => updateRole(i, "isManager", e.target.checked)}
                />
                ניהולי
              </label>
              <button className="setup-x" onClick={() => removeRole(i)} aria-label="מחיקה">✕</button>
            </div>
          ))}
          <button className="ss-btn ss-btn-ghost setup-add" onClick={addRole}>+ תפקיד</button>
        </div>
      </section>

      <section className="ss-card setup-section">
        <h3>עובדים</h3>
        <div className="setup-employees">
          <label className="setup-num">
            כמה עובדים יש לך?
            <input
              type="number"
              min="1"
              value={numEmployees}
              onChange={(e) => setNumEmployees(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </label>
          <label className="setup-demo">
            <input
              type="checkbox"
              checked={demoAvailability}
              onChange={(e) => setDemoAvailability(e.target.checked)}
            />
            מלא זמינות לדוגמה כדי לראות סידור מיד
          </label>
        </div>
        <p className="ss-muted setup-note">
          לכל עובד ייווצר חשבון. בלי זמינות לדוגמה — כל עובד מתחבר ומגיש את הימים שהוא יכול לעבוד.
        </p>
      </section>

      {error && <div className="setup-error">{error}</div>}

      <div className="setup-actions">
        <button className="ss-btn ss-btn-primary setup-build" onClick={handleBuild} disabled={busy}>
          {busy ? "בונה..." : "✨ בנה סידור"}
        </button>
      </div>

      {reply && (
        <section className="ss-card setup-result">
          <h3>✓ ההגדרה הושלמה</h3>
          <p className="setup-reply">{reply}</p>

          {accounts.length > 0 && (
            <>
              <h4>חשבונות העובדים שנוצרו</h4>
              <p className="ss-muted">חלקי את פרטי ההתחברות לעובדים — הם יתחברו ויגישו זמינות.</p>
              <div className="setup-accounts">
                <table>
                  <thead>
                    <tr><th>שם</th><th>מספר התחברות</th><th>סיסמה</th><th>תפקיד</th></tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>{a.id}</td>
                        <td>{a.password}</td>
                        <td>{a.isManager ? "מנהל" : "עובד"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="setup-result-actions">
            <button className="ss-btn ss-btn-primary" onClick={() => navigate("/weekleyScu")}>
              צפייה בסידור
            </button>
            <button className="ss-btn ss-btn-ghost" onClick={() => navigate("/manage-hours")}>
              עריכת דרישות
            </button>
            <button className="ss-btn ss-btn-ghost" onClick={() => navigate("/agent")}>
              המשך בצ׳אט
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

export default Setup;
