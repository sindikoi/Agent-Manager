import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";
import logo from "../images/Screenshot 2025-05-29 141545.png"; // נתיב ללוגו

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

  const handleHomePage = () => {
    navigate("/home");
  };

  const handleAgentChat = () => {
    navigate("/agent");
  };

  return (
    location.pathname !== "/login" && (
      <nav className="navbar">
        <div className="navbar-left">
        <img src={logo} alt="SafeShift Logo" className="navbar-logo" />
        </div>
        <div className="navbar-center">
          {user && (
            <span className="welcome-text">
             {user.job}
            </span>
          )}
        </div>

        <div className="navbar-right">
          <button className="home-button" onClick={handleHomePage}>
            Home
          </button>
          {user && user.ShiftManager && (
            <button className="agent-button" onClick={handleAgentChat}>
              🤖 סוכן AI
            </button>
          )}
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>
    )
  );
};

export default Navbar;
