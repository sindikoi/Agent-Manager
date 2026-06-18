import React, { useState, useEffect, useCallback } from 'react';
import '../styles/ManageHours.css';
import axios from 'axios';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const shifts = ['Morning', 'Afternoon', 'Evening'];
const defaultPositions = ['Control', 'Patrol', 'Entrance Security', 'Shift Supervisor'];

const createInitialSchedule = () => {
  const schedule = {};
  shifts.forEach((shift) => {
    schedule[shift] = {};
    defaultPositions.forEach((position) => {
      schedule[shift][position] = {};
      days.forEach((day) => {
        schedule[shift][position][day] = {
          noWeapon: 0,
          weapon: position === 'Shift Supervisor' ? 1 : 0,
        };
      });
    });
  });
  return schedule;
};

const getStartOfWeek = (date = new Date()) => {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diffToSunday = d.getDate() - dayOfWeek;
  d.setHours(0, 0, 0, 0);
  return new Date(d.setDate(diffToSunday));
};

const getWeekDateRangeString = (startDate) => {
  if (!startDate) return "Loading date range...";
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const formatDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  };
  return `Planning Week: ${formatDate(start)} - ${formatDate(end)}`;
};

const ManageHours = () => {
  const [schedule, setSchedule] = useState(createInitialSchedule());
  const [currentDayViewIndex, setCurrentDayViewIndex] = useState(0);
  const [targetWeekForPlanning, setTargetWeekForPlanning] = useState(null);
  const [user, setUser] = useState(null);
  const [hotelName, setHotelName] = useState('');
  const visibleDays = days.slice(currentDayViewIndex, currentDayViewIndex + 4);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user'));
    if (storedUser) {
      setUser(storedUser);
      setHotelName(storedUser.Workplace || '');
    }
    const today = new Date();
    const startOfWeek = getStartOfWeek(today);
    startOfWeek.setDate(startOfWeek.getDate() + 7);
    setTargetWeekForPlanning(startOfWeek);
  }, []);

  const fetchCurrentRequirements = useCallback(() => {
    if (hotelName) {
      axios.get(`/get-schedule/${encodeURIComponent(hotelName)}`)
        .then(res => {
          if (res.data?.schedule && Object.keys(res.data.schedule).length > 0) {
            setSchedule(res.data.schedule);
          } else {
            setSchedule(createInitialSchedule());
          }
        })
        .catch(() => setSchedule(createInitialSchedule()));
    }
  }, [hotelName]);

  useEffect(() => {
    if (hotelName) fetchCurrentRequirements();
  }, [hotelName, fetchCurrentRequirements]);

  const handleChange = (shift, position, day, weaponType, value) => {
    const finalValue = Math.max(0, parseInt(value, 10) || 0);
    setSchedule(prev => ({
      ...prev,
      [shift]: {
        ...prev[shift],
        [position]: {
          ...prev[shift][position],
          [day]: {
            ...prev[shift][position][day],
            [weaponType]: position === 'Shift Supervisor' && weaponType === 'weapon' && finalValue < 1 ? 1 : finalValue
          }
        }
      }
    }));
  };

  const shiftNavigation = (direction) => {
    const shiftAmount = direction === 'next' ? 4 : -4;
    const newIndex = Math.min(Math.max(currentDayViewIndex + shiftAmount, 0), days.length - 4);
    setCurrentDayViewIndex(newIndex);
  };
  const addPosition = (shift) => {
    const newPosition = prompt("Enter new position name:");
    if (newPosition) {
      setSchedule(prev => ({
        ...prev,
        [shift]: {
          ...prev[shift],
          [newPosition]: days.reduce((acc, day) => ({
            ...acc,
            [day]: { noWeapon: 0, weapon: 0 }
          }), {})
        }
      }));
    }
  };

  const removePosition = (shift, position) => {
    setSchedule(prev => {
      const updated = { ...prev };
      delete updated[shift][position];
      return updated;
    });
  };

  const saveSchedule = async () => {
  if (!hotelName) {
    alert("Hotel name not found.");
    return Promise.reject("Hotel name not found.");
  }
  try {
    await axios.post(`/save-schedule/${encodeURIComponent(hotelName)}`, { schedule });
    alert(`Requirements saved for week: ${targetWeekForPlanning?.toLocaleDateString('en-US') || 'unknown'}`);
  } catch (err) {
    alert("Error saving schedule.");
    return Promise.reject(err);
  }
};

  const handleRunScheduler = async () => {
  if (!hotelName || !targetWeekForPlanning) return alert("Missing hotel name or target week.");

  try {
    await saveSchedule(); // מחכים שהשמירה תסתיים בהצלחה

    const confirmRun = window.confirm(`Create schedule for week ${targetWeekForPlanning.toLocaleDateString('en-US')}?`);
    if (!confirmRun) return;

    const targetDate = targetWeekForPlanning.toISOString().split('T')[0];
    const res = await axios.post(`/api/run-scheduler/${encodeURIComponent(hotelName)}`, {
      targetWeekStartDate: targetDate
    });
    alert(res.data.message || "Scheduler run initiated.");

  } catch (err) {
    console.error(err);
  }
};


  if (!user) return <div>Loading user data...</div>;
  if (user && !hotelName) return <div>No workplace assigned.</div>;

  return (
    <div className="manage-hours-container">
      <div className="manage-hours-form">
        <h2>Manage Requirements - {hotelName}</h2>

        <div className="week-navigation-controls">
          {targetWeekForPlanning && <h3 className="week-range-title">{getWeekDateRangeString(targetWeekForPlanning)}</h3>}
        </div>

        {shifts.map(shift => (
          <div key={shift} className="shift-section">
            <h4 className="shift-title">{shift} Shift</h4>

          <div className="day-nav-controls">
  <button
    className="day-nav"
    onClick={() => shiftNavigation('prev')}
    disabled={currentDayViewIndex === 0}
  >
    <span role="img" aria-label="Previous Day">⬅️</span>
  </button>

  <button
    className="day-nav"
    onClick={() => shiftNavigation('next')}
    disabled={currentDayViewIndex >= days.length - 4}
  >
    <span role="img" aria-label="Next Day">➡️</span>
  </button>
</div>


            <table className="schedule-table">
              <thead>
                <tr>
                  <th rowSpan="2">Position</th>
                  {visibleDays.map(day => <th colSpan="2" key={day}>{day}</th>)}
                  <th rowSpan="2">Actions</th>
                </tr>
                <tr>
                  {visibleDays.map(day => (
                    <React.Fragment key={`${day}-sub`}>
                      <th>No Weapon</th>
                      <th>Weapon</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(schedule[shift] || {}).map((position) => (
                  <tr key={position}>
                    <td>{position}</td>
                    {visibleDays.map(day => (
                      <React.Fragment key={`${shift}-${position}-${day}`}>
                        <td className={schedule[shift][position][day].noWeapon > 0 ? 'selected-row' : ''}>
                          {position === 'Shift Supervisor' ? null : (
                            <input type="number" min="0" value={schedule[shift][position][day].noWeapon || 0} onChange={(e) => handleChange(shift, position, day, 'noWeapon', e.target.value)} />
                          )}
                        </td>
                        <td className={schedule[shift][position][day].weapon > 0 ? 'selected-row' : ''}>
                          <input type="number" min={position === 'Shift Supervisor' ? 1 : 0} value={schedule[shift][position][day].weapon || 0} onChange={(e) => handleChange(shift, position, day, 'weapon', e.target.value)} />
                        </td>
                      </React.Fragment>
                    ))}
                    <td><button className="remove-position" onClick={() => removePosition(shift, position)}>X</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="add-position" onClick={() => addPosition(shift)}>+ Add Position</button>
          </div>
        ))}

      <div className="bottom-buttons">
      <button className="save-all" onClick={saveSchedule}>Save Requirements</button>
      <button className="run-scheduler-button" onClick={handleRunScheduler}>Create Schedule for Current Week</button>
      </div>

      </div>
    </div>
  );
};

export default ManageHours;