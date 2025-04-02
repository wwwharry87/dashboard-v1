import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Login from './Login';
import ResetPasswordManual from './ResetPasswordManual';

const App = () => {
  const token = localStorage.getItem('token');
  return (
    <Router>
      <Routes>
        <Route path="//login" element={<Login />} />
        <Route path="/reset-password-manual" element={<ResetPasswordManual />} />
        <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Router>
  );
};

export default App;
