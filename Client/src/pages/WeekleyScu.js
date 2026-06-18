import React, { useEffect, useState } from 'react';
import '../styles/WeekleyScu.css';

/* Shift names are no longer hardcoded — they are derived from the schedule
   data itself, so any organization's shift structure renders correctly. */
const deriveShifts = (scheduleData) => {
  const seen = [];
  Object.values(scheduleData || {}).forEach((dayShifts) => {
    Object.keys(dayShifts || {}).forEach((shift) => {
      if (!seen.includes(shift)) seen.push(shift);
    });
  });
  return seen;
};

const getWeekDateRangeStringForDisplay = (startDate) => {
  if (!startDate) return 'תאריך לא זמין';
  let start = new Date(startDate);
  if (isNaN(start)) return 'תאריך לא תקין';
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
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
  const orgName = user?.Workplace || '';

  useEffect(() => {
    if (!orgName) return;
    setError(null);

    fetch(`/api/generated-schedules/${encodeURIComponent(orgName)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        const latestSchedule = data?.now || null;
        const previousSchedules = Array.isArray(data?.old) ? data.old : [];
        const nextSchedules = data?.next || null;

        setSchedules({ latest: latestSchedule, previous: previousSchedules, next: nextSchedules });

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
        setError('טעינת הסידור נכשלה. נסו שוב מאוחר יותר.');
      });
  }, [orgName]);

  const getWorkerName = (workerId, idToNameMap) => {
    const name = idToNameMap?.[String(workerId)];
    if (typeof name === 'string' && name.startsWith('No Worker')) return 'ריק';
    if (workerId < 0) return 'ריק';
    return name || `ID: ${workerId}`;
  };

  const getWorkerClass = (name) => {
    if (!name || name === 'ריק' || name.startsWith('ID:')) return 'worker-missing';
    if (user && name === user.name) return 'highlight-user';
    return 'worker-ok';
  };

  const renderCellWorkers = (entries, idToNameMap) =>
    entries.map((entry, index) => {
      const name = getWorkerName(entry.worker_id, idToNameMap);
      return (
        <span key={`${entry.worker_id}-${index}`} className={getWorkerClass(name)}>
          {name}
          {index < entries.length - 1 ? ', ' : ''}
        </span>
      );
    });

  const renderDayTable = (day, shifts, idToNameMap) => {
    const shiftList = deriveShifts({ day: shifts });
    const positionsSet = new Set();
    shiftList.forEach((shift) => {
      (shifts[shift] || []).forEach((entry) => positionsSet.add(entry.position || entry.roleId));
    });
    const positions = Array.from(positionsSet).sort();
    return (
      <div className="day-section" key={day}>
        <h3>{day}</h3>
        <div className="schedule-grid-wrap">
          <table className="schedule-grid">
            <thead>
              <tr>
                <th>תפקיד</th>
                {shiftList.map((shift) => <th key={shift}>{shift}</th>)}
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => (
                <tr key={position}>
                  <td className="pos-cell">{position}</td>
                  {shiftList.map((shift) => {
                    const entries = (shifts[shift] || []).filter(
                      (e) => (e.position || e.roleId) === position
                    );
                    return <td key={shift}>{renderCellWorkers(entries, idToNameMap)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderWideTable = (schedule) => {
    const { schedule: scheduleData, idToName: idToNameMap } = schedule;
    const days = Object.keys(scheduleData);
    const shiftList = deriveShifts(scheduleData);
    return shiftList.map((shift) => {
      const positionsSet = new Set();
      days.forEach((day) => {
        (scheduleData[day][shift] || []).forEach((entry) =>
          positionsSet.add(entry.position || entry.roleId)
        );
      });
      const positions = Array.from(positionsSet).sort();
      return (
        <div className="day-section" key={shift}>
          <h3>משמרת {shift} — תצוגה שבועית</h3>
          <div className="schedule-grid-wrap">
            <table className="schedule-grid">
              <thead>
                <tr>
                  <th>תפקיד</th>
                  {days.map((day) => <th key={day}>{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position}>
                    <td className="pos-cell">{position}</td>
                    {days.map((day) => {
                      const entries = (scheduleData[day][shift] || []).filter(
                        (e) => (e.position || e.roleId) === position
                      );
                      return <td key={day}>{renderCellWorkers(entries, idToNameMap)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    });
  };

  let scheduleToDisplay = null;
  if (selectedScheduleKey === 'current') scheduleToDisplay = schedules.latest;
  else if (selectedScheduleKey === 'next') scheduleToDisplay = schedules.next;
  else if (selectedScheduleKey === 'previous')
    scheduleToDisplay = schedules.previous[selectedPreviousIndex] || null;

  if (error) return <div className="ss-page"><div className="error-message">{error}</div></div>;
  if (!orgName && user)
    return <div className="ss-page"><div className="error-message">למשתמש לא משויך מקום עבודה.</div></div>;
  if (!user) return null;

  return (
    <div className="ss-page weekly-schedule-page">
      <header className="weekly-head">
        <div>
          <h1>סידור עבודה</h1>
          <p className="ss-muted">{orgName}</p>
        </div>
        <div className="weekly-toolbar">
          {scheduleToDisplay && (
            <button
              onClick={() => setViewMode((p) => (p === 'byDay' ? 'wide' : 'byDay'))}
              className="ss-btn ss-btn-ghost"
            >
              {viewMode === 'byDay' ? 'תצוגה לפי שבוע' : 'תצוגה לפי יום'}
            </button>
          )}
          {selectedScheduleKey === 'previous' && schedules.previous.length > 1 && (
            <select
              className="ss-select"
              style={{ width: 'auto' }}
              value={selectedPreviousIndex}
              onChange={(e) => setSelectedPreviousIndex(Number(e.target.value))}
            >
              {schedules.previous.map((prev, index) => (
                <option key={index} value={index}>
                  {getWeekDateRangeStringForDisplay(prev.relevantWeekStartDate)}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {scheduleToDisplay ? (
        <div className="schedule-content">
          <p className="schedule-header">
            סידור לשבוע: {getWeekDateRangeStringForDisplay(scheduleToDisplay.relevantWeekStartDate)}{' '}
            {scheduleToDisplay.status === 'partial' && (
              <span className="partial-schedule-note">(סידור חלקי)</span>
            )}
          </p>
          {viewMode === 'byDay'
            ? Object.entries(scheduleToDisplay.schedule).map(([day, shifts]) =>
                renderDayTable(day, shifts, scheduleToDisplay.idToName || {})
              )
            : renderWideTable(scheduleToDisplay)}
        </div>
      ) : (
        <div className="no-schedule-message">{error || 'אין סידור זמין להצגה.'}</div>
      )}
    </div>
  );
};

export default WeeklySchedule;
