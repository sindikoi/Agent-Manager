import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Login.css";

const Login = () => {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");

    if (isNaN(id) || id === "") {
      setError("נא להזין מספר זהות תקין.");
      return;
    }

    setLoading(true);
    axios
      .post("http://localhost:3002/login", { id: parseInt(id), password })
      .then((response) => {
        if (response.data.success) {
          const userData = {
            id: response.data.id,
            job: response.data.job,
            name: response.data.name,
            Workplace: response.data.Workplace,
            ShiftManager: response.data.ShiftManager,
            selectedDays: response.data.selectedDays || [],
            WeaponCertified: response.data.WeaponCertified,
          };
          localStorage.setItem("user", JSON.stringify(userData));
          navigate("/home", { state: { user: userData } });
        } else {
          setError("מספר זהות או סיסמה שגויים.");
        }
      })
      .catch(() => {
        setError("אירעה שגיאה. נא לנסות שוב.");
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="login-page">
      <div className="login-brand">
        <span className="login-logo-icon" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <h1 className="login-logo-title">SafeShift</h1>
        <p className="login-tagline">מערכת חכמה לסידור עבודה</p>
      </div>

      <form className="login-card" onSubmit={handleLogin}>
        <h2>התחברות</h2>
        <p className="login-subtitle">היכנסו עם פרטי המשתמש שלכם</p>

        <label htmlFor="id">מספר זהות</label>
        <input
          className="ss-input"
          type="text"
          id="id"
          inputMode="numeric"
          placeholder="לדוגמה: 123456789"
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
        />

        <label htmlFor="password">סיסמה</label>
        <input
          className="ss-input"
          type="password"
          id="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="ss-btn ss-btn-primary login-submit" disabled={loading}>
          {loading ? "מתחבר..." : "התחברות"}
        </button>
      </form>
    </div>
  );
};

export default Login;
