import React from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./components/HomePage";
import Login from "./components/Login";
import WeekleyScu from "./pages/WeekleyScu";
import ManageHours from "./pages/ManageHours";
import EmployeeRequest from "./pages/EmployeeRequest";
import AgentChat from "./pages/AgentChat";
function App() {
  return (
    <>
      <Navbar />
      {/* Define Routes for Home, Login, and other pages */}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/weekleyScu" element={<WeekleyScu />} />
        <Route path="/manage-hours" element={<ManageHours />} />
        <Route path="/EmployeeRequest" element={<EmployeeRequest />} />
        <Route path="/agent" element={<AgentChat />} />
      </Routes>
    </>
  );
}

export default App;
