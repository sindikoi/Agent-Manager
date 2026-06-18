import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/EmployeeRequest.css";

const EmployeeRequest = () => {
  const [userId, setUserId] = useState(null);
  const [selectedDays, setSelectedDays] = useState([]);
  const navigate = useNavigate();

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shiftTypes = ["Morning", "Afternoon", "Evening"];

// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  const userData = JSON.parse(localStorage.getItem("user"));
  if (userData && userData.id) {
    setUserId(userData.id);

    fetch(`/EmployeeRequest?userId=${userData.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.selectedDays)) {
          const cleaned = daysOfWeek.map((day) => {
            const found = data.selectedDays.find(d => d.day.toLowerCase() === day.toLowerCase());
            return found ? {
              day,
              shifts: shiftTypes.filter(shift => found.shifts.includes(shift))
            } : null;
          }).filter(Boolean);
          setSelectedDays(cleaned);
        }
      })
      .catch((err) => console.error("Failed to fetch existing availability:", err));
  } else {
    console.error("User data not found in localStorage.");
    navigate("/login");
  }
}, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps


  const handleDayCheckboxChange = (day) => {
    setSelectedDays((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((d) => d.day === day);
      if (index !== -1) {
        updated.splice(index, 1);
      } else {
        updated.push({ day, shifts: [] });
      }
      return updated;
    });
  };

  const handleShiftCheckboxChange = (day, shift) => {
    setSelectedDays((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((d) => d.day === day);
      if (index !== -1) {
        const shifts = updated[index].shifts;
        if (shifts.includes(shift)) {
          updated[index].shifts = shifts.filter((s) => s !== shift);
        } else {
          updated[index].shifts.push(shift);
        }
      }
      return updated;
    });
  };

  const countSelectedShifts = () => {
    return selectedDays.reduce((total, day) => total + day.shifts.length, 0);
  };

  const handleSend = async () => {
    if (!userId) {
      alert("User ID is not defined.");
      return;
    }

    if (countSelectedShifts() < 5) {
      alert("Minimum of 5 shifts per worker");
      return;
    }

    const requestData = selectedDays.map((d) => ({
      day: d.day,
      shifts: d.shifts.length > 0 ? d.shifts : shiftTypes
    }));

    try {
      const response = await fetch("/EmployeeRequest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, selectedDays: requestData })
      });

      if (response.ok) {
        alert("✅ Great job! See you on shift.");
        navigate("/home");
      } else {
        const errorMessage = await response.text();
        console.error("Server error:", errorMessage);
      }
    } catch (error) {
      console.error("An error occurred:", error);
    }
  };

  return (
    <div className="employee-request">
      <h1>Employee Request</h1>
      <p>Select the days and shifts you are available:</p>
      <p><strong>Note:</strong> Minimum of 5 shifts per worker</p>
      <table className="availability-table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Available</th>
            {shiftTypes.map((shift) => (
              <th key={shift}>{shift}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {daysOfWeek.map((day) => {
            const dayObj = selectedDays.find((d) => d.day === day);
            return (
              <tr key={day} className={dayObj ? "selected-row" : ""}>
                <td>{day}</td>
                <td>
                  <input
                    type="checkbox"
                    onChange={() => handleDayCheckboxChange(day)}
                    checked={!!dayObj}
                  />
                </td>
                {shiftTypes.map((shift) => (
                  <td key={shift}>
                    <input
                      type="checkbox"
                      onChange={() => handleShiftCheckboxChange(day, shift)}
                      checked={dayObj?.shifts.includes(shift) || false}
                      disabled={!dayObj}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="send-button" onClick={handleSend} disabled={!userId}>
        Send
      </button>
    </div>
  );
};

export default EmployeeRequest;
