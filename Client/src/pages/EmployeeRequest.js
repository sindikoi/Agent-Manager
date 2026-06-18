import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/EmployeeRequest.css";

/* Day/shift keys stay in English for back-end compatibility, while the UI
   shows Hebrew labels. These lists are the single place to later load
   dynamically from the organization config. */
const DAYS = [
  { key: "Sunday", label: "ראשון" },
  { key: "Monday", label: "שני" },
  { key: "Tuesday", label: "שלישי" },
  { key: "Wednesday", label: "רביעי" },
  { key: "Thursday", label: "חמישי" },
  { key: "Friday", label: "שישי" },
  { key: "Saturday", label: "שבת" },
];
const SHIFTS = [
  { key: "Morning", label: "בוקר" },
  { key: "Afternoon", label: "צהריים" },
  { key: "Evening", label: "ערב" },
];
const SHIFT_KEYS = SHIFTS.map((s) => s.key);
const MIN_SHIFTS = 5;

const EmployeeRequest = () => {
  const [userId, setUserId] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("user") || "null");
    if (!userData || !userData.id) {
      navigate("/login");
      return;
    }
    setUserId(userData.id);

    fetch(`/EmployeeRequest?userId=${userData.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.selectedDays)) {
          const cleaned = DAYS.map(({ key }) => {
            const found = data.selectedDays.find(
              (d) => d.day.toLowerCase() === key.toLowerCase()
            );
            return found
              ? { day: key, shifts: SHIFT_KEYS.filter((s) => found.shifts.includes(s)) }
              : null;
          }).filter(Boolean);
          setSelectedDays(cleaned);
        }
      })
      .catch((err) => console.error("Failed to fetch existing availability:", err));
  }, [navigate]);

  const toggleDay = (day) => {
    setSelectedDays((prev) => {
      const index = prev.findIndex((d) => d.day === day);
      if (index !== -1) return prev.filter((d) => d.day !== day);
      return [...prev, { day, shifts: [] }];
    });
  };

  const toggleShift = (day, shift) => {
    setSelectedDays((prev) =>
      prev.map((d) => {
        if (d.day !== day) return d;
        const shifts = d.shifts.includes(shift)
          ? d.shifts.filter((s) => s !== shift)
          : [...d.shifts, shift];
        return { ...d, shifts };
      })
    );
  };

  const totalShifts = selectedDays.reduce((t, d) => t + d.shifts.length, 0);

  const handleSend = async () => {
    if (!userId) return;
    if (totalShifts < MIN_SHIFTS) {
      alert(`יש לבחור לפחות ${MIN_SHIFTS} משמרות.`);
      return;
    }

    const requestData = selectedDays.map((d) => ({
      day: d.day,
      shifts: d.shifts.length > 0 ? d.shifts : SHIFT_KEYS,
    }));

    try {
      const response = await fetch("/EmployeeRequest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, selectedDays: requestData }),
      });
      if (response.ok) {
        alert("✅ הזמינות נשמרה. נתראה במשמרת!");
        navigate("/home");
      } else {
        console.error("Server error:", await response.text());
      }
    } catch (error) {
      console.error("An error occurred:", error);
    }
  };

  const remaining = Math.max(0, MIN_SHIFTS - totalShifts);

  return (
    <div className="ss-page employee-request">
      <header className="er-head">
        <h1>הגשת זמינות</h1>
        <p className="ss-muted">סמנו את הימים והמשמרות שבהם תוכלו לעבוד.</p>
      </header>

      <div className="er-counter">
        <span>
          נבחרו <strong>{totalShifts}</strong> משמרות
        </span>
        {remaining > 0 ? (
          <span className="ss-badge ss-badge-warning">חסרות עוד {remaining}</span>
        ) : (
          <span className="ss-badge ss-badge-success">עומד בדרישת המינימום</span>
        )}
      </div>

      <div className="er-grid">
        {DAYS.map(({ key, label }) => {
          const dayObj = selectedDays.find((d) => d.day === key);
          const active = !!dayObj;
          return (
            <div key={key} className={`er-day-card${active ? " er-day-card--active" : ""}`}>
              <label className="er-day-head">
                <input type="checkbox" checked={active} onChange={() => toggleDay(key)} />
                <span className="er-day-name">{label}</span>
              </label>
              <div className="er-shifts">
                {SHIFTS.map((shift) => {
                  const on = dayObj?.shifts.includes(shift.key);
                  return (
                    <button
                      key={shift.key}
                      type="button"
                      className={`er-shift-pill${on ? " er-shift-pill--on" : ""}`}
                      disabled={!active}
                      onClick={() => toggleShift(key, shift.key)}
                    >
                      {shift.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="ss-btn ss-btn-primary er-send"
        onClick={handleSend}
        disabled={!userId || totalShifts < MIN_SHIFTS}
      >
        שליחת זמינות
      </button>
    </div>
  );
};

export default EmployeeRequest;
