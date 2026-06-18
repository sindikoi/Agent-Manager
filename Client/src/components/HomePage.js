import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/HomePage.css";

import weekleyScu from "../images/weekleyScu.png";
import ManageHours from "../images/ManageHours.png";
import Employee_Request from "../images/iconapp-Photo.png";

const HomePage = () => {
  const [user, setUser] = useState(null);
  const [newWarnings, setNewWarnings] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [pauseScroll, setPauseScroll] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState("");

  const navigate = useNavigate();

  const parseShift = (shiftStr) => {
    const parts = shiftStr.split(" ");
    return { day: parts[0] || "", shift: parts[1] || "" };
  };

  const isIssueRelevantForUser = (issueDay, userSelectedDays) => {
    return !userSelectedDays.some(
      (d) => d.day.toLowerCase() === issueDay.toLowerCase()
    );
  };

  useEffect(() => {
  const rawUser = localStorage.getItem("user");
  try {
    const savedUser = JSON.parse(rawUser);
    if (!savedUser) return;

    setUser(savedUser);
    const selectedDays = savedUser.selectedDays || [];

    fetch(`/api/generated-schedules/${encodeURIComponent(savedUser.Workplace)}`)
      .then((res) => res.json())
      .then((data) => {
        console.log("📦 Fetched schedule data:", data);

        const newNotes = data.next?.notes || [];
   

        console.log("🟢 New notes count:", newNotes.length);
  

        const processNotes = (notes, label) => {
          if (savedUser.job === "management") {
            console.log(`🔍 ${label}: management sees all notes`);
            return notes;
          }

          if (savedUser.ShiftManager === true) {
            const filtered = notes.filter((i) =>
              isIssueRelevantForUser(parseShift(i.shift).day, selectedDays)
            );
            if(filtered.length>0)
            console.log(` ShiftManager filtered notes count:`, filtered.length);
          
            return filtered;
          }

          const foundWeaponIssue = notes.some((i) => i.weapon === true);
          const foundNonWeaponIssue = notes.some((i) => i.weapon === false);
          const isSUP = notes.some((i) => i.position === "Shift Supervisor");

          if (foundWeaponIssue && savedUser.WeaponCertified && !isSUP) {
            const filtered = notes.filter(
              (i) =>
                i.weapon === true &&
                isIssueRelevantForUser(parseShift(i.shift).day, selectedDays)
            );
            console.log(`🔫 ${label}: WeaponCertified, filtered count:`, filtered.length);
            return filtered;
          }

          if (foundNonWeaponIssue && !savedUser.WeaponCertified && !isSUP) {
            const filtered = notes.filter(
              (i) =>
                i.weapon === false &&
                isIssueRelevantForUser(parseShift(i.shift).day, selectedDays)
            );
            console.log(`🚫 ${label}: Non-WeaponCertified, filtered count:`, filtered.length);
            return filtered;
          }

          console.log(`❗ ${label}: No relevant issues`);
          return [];
        };

        const processedNew = processNotes(newNotes, "New");
    

        setNewWarnings(processedNew);

      })
      .catch((err) => {
        console.error("❌ Failed to fetch schedule data:", err);
      });
  } catch (err) {
    console.error("❌ Failed to parse user data:", err);
  }
}, []);


  useEffect(() => {
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAnnouncements(data.announcements);
      });
  }, []);

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
          fetch("/api/announcements")
            .then((res) => res.json())
            .then((data) => {
              if (data.success) setAnnouncements(data.announcements);
            });
        }
      });
  };

  const handleDeleteAnnouncement = (id) => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק את ההודעה?")) return;

    fetch(`/api/announcements/${id}`, {
      method: "DELETE"
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAnnouncements(announcements.filter((a) => a._id !== id));
        }
      })
      .catch((err) => console.error("❌ Error deleting announcement:", err));
  };

  const handleCellClick = (path) => {
    navigate(path);
  };

  return (
    <div className="homepage">
      <h1>Welcome, {user ? user.name : "Guest"}!</h1>

      {(newWarnings.length > 0 ) && (
  <div className="warning-banner">
    <strong>
      <span role="img" aria-label="Warning">⚠️</span> Partial schedule issues:
    </strong>

    {newWarnings.length > 0 && (
      <>
        <h4> Problems this week :</h4>
        <ul>
          {newWarnings.map((i, idx) => {
            const { day, shift } = parseShift(i.shift);
            return <li key={`new-${idx}`}>{day} — {shift} — {i.position}</li>;
          })}
        </ul>
      </>
    )}

    <p>
      {user?.job === "management"
        ? "please change the demand of work arrangement"
        : "please send another work arrangement"}
    </p>
  </div>
)}

      {/* פורום הודעות */}
      <div
        className="announcement-forum"
        onMouseEnter={() => setPauseScroll(true)}
        onMouseLeave={() => setPauseScroll(false)}
      >
        <h3>
          <span role="img" aria-label="Announcement">📢</span> פורום עדכונים
        </h3>

        <div className={`announcement-list ${pauseScroll ? "paused" : ""}`}>
          <div className="announcement-items-wrapper">
            {announcements.map((a) => (
              <div className="announcement-item" key={a._id}>
  <strong>{new Date(a.date).toLocaleDateString()}:</strong>
  <span className="message-text">{a.message}</span>
  {user?.job === "management" && (
    <button
      className="delete-btn"
      onClick={() => handleDeleteAnnouncement(a._id)}
      title="מחק הודעה"
    >
      <span role="img" aria-label="delete">❌</span>
    </button>
  )}
</div>
            ))}
          </div>
        </div>
      </div>

      {/* טופס למנהל */}
      {user?.job === "management" && (
        <div className="announcement-form">
          <h4>הוסף הודעה חדשה</h4>
          <textarea
            value={newAnnouncement}
            onChange={(e) => setNewAnnouncement(e.target.value)}
            placeholder="כתוב כאן את ההודעה שלך..."
          />
          <button onClick={handleAnnouncementSubmit}>שלח</button>
        </div>
      )}

      <div className="table-container">
        <table className="custom-table">
          <tbody>
            <tr>
              <td onClick={() => handleCellClick("/weekleyScu")}>
                <img src={weekleyScu} alt="Weekly Schedule" />
              </td>
            </tr>

            {user?.job === "Employee" && (
              <tr>
                <td onClick={() => handleCellClick("/EmployeeRequest")}>
                  <img src={Employee_Request} alt="Employee Request" />
                </td>
              </tr>
            )}

            {user?.job === "management" && (
              <tr>
                <td onClick={() => handleCellClick("/manage-hours")}>
                  <img src={ManageHours} alt="Manage Hours" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HomePage;
