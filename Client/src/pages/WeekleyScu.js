import React, { useEffect, useState } from 'react';
import '../styles/WeekleyScu.css';

const SHIFTS = ['Morning', 'Afternoon', 'Evening'];

const getWeekDateRangeStringForDisplay = (startDate) => {
  if (!startDate) return 'Date not available';
  let start;
  if (typeof startDate === 'string') {
    start = new Date(startDate);
    if (isNaN(start)) return 'Invalid date';
  } else if (startDate instanceof Date) {
    start = new Date(startDate);
  } else {
    return 'Unknown date';
  }
  const dayOfWeek = start.getDay();
  const dateOfSunday = start.getDate() - dayOfWeek;
  start.setDate(dateOfSunday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const formatDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  };
  return `${formatDate(start)} - ${formatDate(end)}`;
};

const isDateInWeek = (dateToCheck, weekStartDateStr) => {
  if (!weekStartDateStr) return false;
  const weekStart = new Date(weekStartDateStr);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return dateToCheck >= weekStart && dateToCheck <= weekEnd;
};

const isDateAfterToday = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

const WeeklySchedule = () => {
  const [schedules, setSchedules] = useState({ latest: null, previous: [], next: null });
  const [selectedScheduleKey, setSelectedScheduleKey] = useState(null);
  const [selectedPreviousIndex, setSelectedPreviousIndex] = useState(0);
  const [viewMode, setViewMode] = useState('byDay');
  const [error, setError] = useState(null);

  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  });
  const hotelName = user?.Workplace || '';

  useEffect(() => {
    if (!hotelName) return;
    setError(null);

    fetch(`/api/generated-schedules/${encodeURIComponent(hotelName)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP error! status: ${res.status}`)))
      .then((data) => {
        const latestSchedule = data?.now || null;
        const previousSchedules = Array.isArray(data?.old) ? data.old : [];
        const nextSchedules = data?.next || null;

        setSchedules({
          latest: latestSchedule,
          previous: previousSchedules,
          next: nextSchedules,
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let foundKey = null;

        if (nextSchedules && isDateAfterToday(nextSchedules.relevantWeekStartDate)) {
          foundKey = 'next';
        } else if (latestSchedule && isDateInWeek(today, latestSchedule.relevantWeekStartDate)) {
          foundKey = 'current';
        } else if (previousSchedules.length > 0) {
          foundKey = 'previous';
        }

        setSelectedScheduleKey(foundKey);
      })
      .catch((err) => {
        console.error('Error loading schedules:', err);
        setError('Failed to load schedules. Please try again later.');
      });
  }, [hotelName]);

  const getWorkerName = (workerId, idToNameMap) => {
    const strId = String(workerId);
    const name = idToNameMap?.[strId];
    if (typeof name === 'string' && name.startsWith('No Worker')) return 'Empty';
    if (workerId < 0) return 'Empty';
    return name || `ID: ${workerId}`;
  };

  const getWorkerClass = (name) => {
    if (!name || name === 'Empty' || name.startsWith('ID:')) return 'worker-missing';
    if (user && name === user.name) return 'highlight-user';
    return 'worker-ok';
  };

  const renderDayTable = (day, shifts, idToNameMap) => {
    const positionsSet = new Set();
    SHIFTS.forEach((shift) => {
      (shifts[shift] || []).forEach((entry) => positionsSet.add(entry.position));
    });
    const positions = Array.from(positionsSet).sort();
    return (
      <div className="day-section" key={day}>
        <h3>{day}</h3>
        <table className="schedule-grid">
          <thead><tr><th>Position</th>{SHIFTS.map((shift) => <th key={shift}>{shift}</th>)}</tr></thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position}>
                <td>{position}</td>
                {SHIFTS.map((shift) => {
                  const entries = (shifts[shift] || []).filter((e) => e.position === position);
                  return (
                    <td key={shift}>
                      {entries.map((entry, index) => {
                        const name = getWorkerName(entry.worker_id, idToNameMap);
                        const className = getWorkerClass(name);
                        return (
                          <span key={`${entry.worker_id}-${index}`} className={className}>
                            {name}{index < entries.length - 1 ? ', ' : ''}
                          </span>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderWideTable = (schedule) => {
    const { schedule: scheduleData, idToName: idToNameMap } = schedule;
    const days = Object.keys(scheduleData);
    return SHIFTS.map((shift) => {
      const positionsSet = new Set();
      days.forEach((day) => {
        (scheduleData[day][shift] || []).forEach((entry) => positionsSet.add(entry.position));
      });
      const positions = Array.from(positionsSet).sort();
      return (
        <div className="day-section" key={shift}>
          <h3>{shift} Shift – Weekly View</h3>
          <table className="schedule-grid">
            <thead><tr><th>Position</th>{days.map((day) => <th key={day}>{day}</th>)}</tr></thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position}>
                  <td>{position}</td>
                  {days.map((day) => {
                    const entries = (scheduleData[day][shift] || []).filter((e) => e.position === position);
                    return (
                      <td key={day}>
                        {entries.map((entry, index) => {
                          const name = getWorkerName(entry.worker_id, idToNameMap);
                          const className = getWorkerClass(name);
                          return (
                            <span key={`${entry.worker_id}-${index}`} className={className}>
                              {name}{index < entries.length - 1 ? ', ' : ''}
                            </span>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    });
  };

  let scheduleToDisplay = null;
  if (selectedScheduleKey === 'current') {
    scheduleToDisplay = schedules.latest;
  } else if (selectedScheduleKey === 'next') {
    scheduleToDisplay = schedules.next;
  } else if (selectedScheduleKey === 'previous') {
    scheduleToDisplay = schedules.previous[selectedPreviousIndex] || null;
  }

  if (error) return <div className="error-message">{error}</div>;
  if (!hotelName && user) return <div className="error-message">User has no assigned workplace.</div>;
  if (!user) return null;

  return (
    <div className="content-wrapper weekly-schedule-page">
      <h1>Work Schedule View - {hotelName}</h1>
      <div className="button-fixed-right">
  {/* כפתור החלפת תצוגה */}
  {scheduleToDisplay && (
    <button
      onClick={() => setViewMode((prev) => (prev === 'byDay' ? 'wide' : 'byDay'))}
      className="btn btn-toggle"
    >
      {viewMode === 'byDay' ? '🔄 Show by Week' : '📅 Show by Day'}
    </button>
  )}

  {/* dropdown לבחירת שבוע קודם */}
  {selectedScheduleKey === 'previous' && schedules.previous.length > 1 && (
    <div className="dropdown-previous-selector">
      <label htmlFor="previousWeekSelect">Select Week:&nbsp;</label>
      <select
        id="previousWeekSelect"
        value={selectedPreviousIndex}
        onChange={(e) => setSelectedPreviousIndex(Number(e.target.value))}
      >
        {schedules.previous.map((prev, index) => (
          <option key={index} value={index}>
            {getWeekDateRangeStringForDisplay(prev.relevantWeekStartDate)}
          </option>
        ))}
      </select>
    </div>
  )}
</div>
      
     

      {scheduleToDisplay ? (
        <div className="schedule-content">
          <p className="schedule-header">
            Schedule for: {getWeekDateRangeStringForDisplay(scheduleToDisplay.relevantWeekStartDate)}{' '}
            {scheduleToDisplay.status === 'partial' && <span className="partial-schedule-note">(Partial schedule)</span>}
          </p>
          {viewMode === 'byDay'
            ? Object.entries(scheduleToDisplay.schedule).map(([day, shifts]) =>
                renderDayTable(day, shifts, scheduleToDisplay.idToName || {})
              )
            : renderWideTable(scheduleToDisplay)}
        </div>
      ) : (
        <div className="no-schedule-message">{error || 'No schedule available to display.'}</div>
      )}
    </div>
  );
};

export default WeeklySchedule;
