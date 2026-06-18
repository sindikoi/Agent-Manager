import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../styles/ManageHours.css';

const DAYS = [
  { key: 'Sunday', label: 'ראשון' },
  { key: 'Monday', label: 'שני' },
  { key: 'Tuesday', label: 'שלישי' },
  { key: 'Wednesday', label: 'רביעי' },
  { key: 'Thursday', label: 'חמישי' },
  { key: 'Friday', label: 'שישי' },
  { key: 'Saturday', label: 'שבת' },
];

const getStartOfWeek = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const formatDate = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const ManageHours = () => {
  const [user, setUser] = useState(null);
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [shiftTypes, setShiftTypes] = useState([]);
  const [roles, setRoles] = useState([]);
  const [requirements, setRequirements] = useState({});
  const [targetWeek, setTargetWeek] = useState(null);
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (storedUser) {
      setUser(storedUser);
      setOrgId(storedUser.organizationId || storedUser.Workplace || '');
      setOrgName(storedUser.organizationName || storedUser.Workplace || '');
    }
    const nextWeek = getStartOfWeek();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setTargetWeek(nextWeek);
  }, []);

  const loadConfig = useCallback(() => {
    if (!orgId) return;
    axios
      .get(`/get-schedule/${encodeURIComponent(orgId)}`)
      .then((res) => {
        setShiftTypes(res.data?.shiftTypes || []);
        setRoles(res.data?.roles || []);
        setRequirements(res.data?.scheduleRequirements || {});
      })
      .catch(() => setStatus('לא ניתן לטעון את הגדרות הארגון.'));
  }, [orgId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const getCount = (day, shiftId, roleId) =>
    requirements?.[day]?.[shiftId]?.[roleId] ?? 0;

  const setCount = (day, shiftId, roleId, value) => {
    const count = Math.max(0, parseInt(value, 10) || 0);
    setRequirements((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || {}),
        [shiftId]: {
          ...((prev[day] || {})[shiftId] || {}),
          [roleId]: count,
        },
      },
    }));
  };

  const saveRequirements = async () => {
    if (!orgId) return Promise.reject();
    setStatus('שומר...');
    try {
      await axios.post(`/save-schedule/${encodeURIComponent(orgId)}`, {
        scheduleRequirements: requirements,
      });
      setStatus('✅ הדרישות נשמרו.');
    } catch (err) {
      setStatus('❌ שגיאה בשמירה.');
      throw err;
    }
  };

  const handleRunScheduler = async () => {
    if (!orgId || !targetWeek) return;
    try {
      await saveRequirements();
      if (!window.confirm(`לחשב סידור לשבוע ${formatDate(targetWeek)}?`)) return;
      setRunning(true);
      setStatus('מחשב סידור... זה עשוי לקחת עד דקה.');
      const targetDate = targetWeek.toISOString().split('T')[0];
      const res = await axios.post(`/api/run-scheduler/${encodeURIComponent(orgId)}`, {
        targetWeekStartDate: targetDate,
      });
      setStatus(res.data.message || '✅ הסידור חושב.');
    } catch (err) {
      setStatus('❌ ' + (err.response?.data?.message || 'שגיאה בהרצת הסקדולר.'));
    } finally {
      setRunning(false);
    }
  };

  if (!user) return <div className="ss-page">טוען נתוני משתמש...</div>;
  if (!orgId) return <div className="ss-page">למשתמש לא משויך ארגון.</div>;

  const noConfig = shiftTypes.length === 0 || roles.length === 0;

  return (
    <div className="ss-page manage-hours">
      <header className="mh-head">
        <div>
          <h1>ניהול דרישות הסידור</h1>
          <p className="ss-muted">{orgName}</p>
        </div>
        {targetWeek && (
          <div className="mh-week">
            <span className="ss-muted">שבוע התכנון</span>
            <strong>{formatDate(targetWeek)} – {formatDate(new Date(targetWeek.getTime() + 6 * 864e5))}</strong>
          </div>
        )}
      </header>

      {noConfig ? (
        <div className="mh-empty ss-card">
          <h3>הארגון עדיין לא הוגדר</h3>
          <p className="ss-muted">
            כדי לקבוע משמרות, תפקידים וכשירויות — הכי קל לדבר עם הסוכן החכם.
            לדוגמה: ״יש לי 3 משמרות ביום ושני תפקידים: אחראי וקופאי״.
          </p>
        </div>
      ) : (
        <>
          <p className="mh-hint ss-muted">
            הזינו כמה עובדים נדרשים בכל תפקיד, בכל יום ומשמרת. 0 = אין צורך.
          </p>

          {shiftTypes.map((shift) => (
            <section key={shift.id} className="mh-shift">
              <h3 className="mh-shift-title">
                משמרת {shift.name}
                {shift.startTime && (
                  <span className="mh-shift-time">{shift.startTime}–{shift.endTime}</span>
                )}
              </h3>
              <div className="mh-table-wrap">
                <table className="mh-table">
                  <thead>
                    <tr>
                      <th>תפקיד</th>
                      {DAYS.map((d) => <th key={d.key}>{d.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={role.id}>
                        <td className="mh-role-cell">
                          {role.name}
                          {role.isManagerRole && <span className="ss-badge ss-badge-info">ניהולי</span>}
                        </td>
                        {DAYS.map((d) => {
                          const val = getCount(d.key, shift.id, role.id);
                          return (
                            <td key={d.key} className={val > 0 ? 'mh-cell-active' : ''}>
                              <input
                                type="number"
                                min="0"
                                value={val}
                                onChange={(e) => setCount(d.key, shift.id, role.id, e.target.value)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      {status && <div className="mh-status">{status}</div>}

      <div className="mh-actions">
        <button className="ss-btn ss-btn-ghost" onClick={saveRequirements} disabled={noConfig || running}>
          שמירת דרישות
        </button>
        <button className="ss-btn ss-btn-primary" onClick={handleRunScheduler} disabled={noConfig || running}>
          {running ? 'מחשב...' : 'חישוב סידור לשבוע'}
        </button>
      </div>
    </div>
  );
};

export default ManageHours;
