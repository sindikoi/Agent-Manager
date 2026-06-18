import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/HomePage.css";

const parseShift = (shiftStr) => {
  const parts = (shiftStr || "").split(" ");
  return { day: parts[0] || "", shift: parts[1] || "" };
};

const isManager = (user) =>
  user && (user.ShiftManager === true || user.job === "management");

const HomePage = () => {
  const [user, setUser] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");

  const navigate = useNavigate();

  const loadAnnouncements = () => {
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAnnouncements(data.announcements);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return;

    let savedUser;
    try {
      savedUser = JSON.parse(rawUser);
    } catch {
      return;
    }
    if (!savedUser) return;
    setUser(savedUser);

    const selectedDays = savedUser.selectedDays || [];

    fetch(`/api/generated-schedules/${encodeURIComponent(savedUser.Workplace)}`)
      .then((res) => res.json())
      .then((data) => {
        const notes = data.next?.notes || [];

        // Managers see every unfilled shift; employees only see issues on
        // days they are NOT already covering (i.e. days they could pick up).
        const relevant = isManager(savedUser)
          ? notes
          : notes.filter(
              (i) =>
                !selectedDays.some(
                  (d) =>
                    d.day &&
                    d.day.toLowerCase() === parseShift(i.shift).day.toLowerCase()
                )
            );

        setWarnings(relevant);
      })
      .catch(() => {});
  }, []);

  useEffect(loadAnnouncements, []);

  const handleAnnouncementSubmit = () => {
    if (!newAnnouncement.trim()) return;
    fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: newAnnouncement }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setNewAnnouncement("");
          loadAnnouncements();
        }
      });
  };

  const handleDeleteAnnouncement = (id) => {
    if (!window.confirm("למחוק את ההודעה?")) return;
    fetch(`/api/announcements/${id}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAnnouncements((prev) => prev.filter((a) => a._id !== id));
        }
      })
      .catch(() => {});
  };

  const manager = isManager(user);

  const actions = [
    {
      key: "schedule",
      title: "סידור שבועי",
      desc: "צפייה בלוח המשמרות",
      icon: "table",
      path: "/weekleyScu",
      show: true,
    },
    {
      key: "request",
      title: "הגשת זמינות",
      desc: "בחירת הימים והמשמרות שלי",
      icon: "calendar",
      path: "/EmployeeRequest",
      show: user?.job === "Employee",
    },
    {
      key: "manage",
      title: "ניהול דרישות",
      desc: "משמרות, תפקידים וכשירויות",
      icon: "settings",
      path: "/manage-hours",
      show: manager,
    },
    {
      key: "agent",
      title: "צ׳אט עם הסוכן",
      desc: "״תכין לי סידור לשבוע הבא״",
      icon: "sparkles",
      path: "/agent",
      show: manager,
      accent: true,
    },
  ].filter((a) => a.show);

  return (
    <div className="ss-page homepage">
      <header className="home-header">
        <h1>שלום, {user ? user.name : "אורח"} 👋</h1>
        <p className="ss-muted">
          {manager ? "סקירת הניהול שלך" : "המשמרות והזמינות שלך"}
          {user?.Workplace ? ` · ${user.Workplace}` : ""}
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="home-warning">
          <div className="home-warning-head">
            <span aria-hidden="true">⚠️</span>
            <strong>משמרות שלא שובצו השבוע</strong>
          </div>
          <ul>
            {warnings.map((i, idx) => {
              const { day, shift } = parseShift(i.shift);
              return (
                <li key={`warn-${idx}`}>
                  {day} — {shift} — {i.position || i.roleId || ""}
                </li>
              );
            })}
          </ul>
          <p className="home-warning-cta">
            {manager
              ? "כדאי לעדכן את דרישות הסידור או להריץ סידור מחדש."
              : "אפשר לעזור — שקלו להגיש זמינות נוספת."}
          </p>
        </div>
      )}

      <div className="home-actions">
        {actions.map((a) => (
          <button
            key={a.key}
            className={`home-action-card${a.accent ? " home-action-card--accent" : ""}`}
            onClick={() => navigate(a.path)}
          >
            <span className="home-action-icon" aria-hidden="true">
              <ActionIcon name={a.icon} />
            </span>
            <span className="home-action-title">
              {a.title}
              {a.accent && <span className="ss-badge ss-badge-info">AI</span>}
            </span>
            <span className="home-action-desc">{a.desc}</span>
          </button>
        ))}
      </div>

      <section className="ss-card home-forum">
        <h3>
          <span aria-hidden="true">📢</span> פורום עדכונים
        </h3>

        {announcements.length === 0 ? (
          <p className="ss-muted home-empty">אין עדכונים חדשים.</p>
        ) : (
          <div className="home-forum-list">
            {announcements.map((a) => (
              <div className="home-forum-item" key={a._id}>
                <div className="home-forum-date">
                  {new Date(a.date).toLocaleDateString("he-IL")}
                </div>
                <div className="home-forum-msg">{a.message}</div>
                {manager && (
                  <button
                    className="home-forum-del"
                    onClick={() => handleDeleteAnnouncement(a._id)}
                    title="מחיקה"
                    aria-label="מחיקת הודעה"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {manager && (
          <div className="home-forum-form">
            <textarea
              className="ss-textarea"
              rows={2}
              value={newAnnouncement}
              onChange={(e) => setNewAnnouncement(e.target.value)}
              placeholder="כתבו הודעה חדשה לצוות..."
            />
            <button className="ss-btn ss-btn-primary" onClick={handleAnnouncementSubmit}>
              פרסום
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

const ActionIcon = ({ name }) => {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  switch (name) {
    case "table":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
          <path d="M18 15l.7 1.8L20.5 17.5 18.7 18.2 18 20l-.7-1.8L15.5 17.5l1.8-.7z" />
        </svg>
      );
    default:
      return null;
  }
};

export default HomePage;
