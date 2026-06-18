import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";

const isManager = (user) =>
  user && (user.ShiftManager === true || user.job === "management");

const Navbar = () => {
  const [user, setUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.state && location.state.user) {
      setUser(location.state.user);
    } else {
      const userData = localStorage.getItem("user");
      if (userData) {
        setUser(JSON.parse(userData));
      }
    }
  }, [location.state]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  if (location.pathname === "/login") return null;

  const initials = user?.name
    ? user.name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("")
    : "?";

  return (
    <nav className="navbar">
      <div
        className="navbar-brand"
        onClick={() => navigate("/home")}
        role="button"
        tabIndex={0}
      >
        <span className="navbar-logo-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="navbar-logo-text">SafeShift</span>
      </div>

      <div className="navbar-actions">
        <button className="navbar-link" onClick={() => navigate("/home")}>
          בית
        </button>
        {isManager(user) && (
          <button className="navbar-link navbar-link-accent" onClick={() => navigate("/agent")}>
            <span aria-hidden="true">✨</span> סוכן AI
          </button>
        )}

        {user && (
          <div className="navbar-user">
            <div className="navbar-avatar" title={user.name}>{initials}</div>
            <div className="navbar-user-meta">
              <span className="navbar-user-name">{user.name}</span>
              {user.Workplace && (
                <span className="navbar-user-org">{user.Workplace}</span>
              )}
            </div>
          </div>
        )}

        <button className="navbar-logout" onClick={handleLogout} title="התנתקות">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
