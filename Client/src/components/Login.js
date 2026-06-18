import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Login.css";
import logo from "../images/safeshift_logo.png";

const Login = () => {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    if (isNaN(id)) {
      alert("Please enter a valid ID.");
      return;
    }

    axios.post("http://localhost:3002/login", {
      id: parseInt(id),
      password,
    })
      .then((response) => {
        if (response.data.success) {
          const userData = {
            id: response.data.id,
            job: response.data.job,
            name: response.data.name,
            Workplace: response.data.Workplace,
            ShiftManager: response.data.ShiftManager,
            selectedDays: response.data.selectedDays || [],
            WeaponCertified:response.data.WeaponCertified,
          };
          localStorage.setItem("user", JSON.stringify(userData));
          navigate("/home", { state: { user: userData } });
        } else {
          alert("Invalid ID or password");
        }
      })
      .catch((error) => {
        console.error("Login error", error);
        alert("An error occurred. Please try again.");
      });
  };

  return (
    <div className="login-page">
      <div className="logo-area bounce">
        <img src={logo} alt="SafeShift Logo" className="logo-img" />
        
        <p className="logo-tagline">Workforce Shift Management Platform</p>
      </div>

      <form className="login-form bounce" onSubmit={handleLogin}>
        <h2>Login</h2>
        <label htmlFor="id">ID Number</label>
        <input
          type="text"
          id="id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="login-button">Login</button>
      </form>
    </div>
  );
};

export default Login;
