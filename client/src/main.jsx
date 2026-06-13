import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
import App from './App.jsx';
import Home from './pages/Home.jsx';
import CreateSession from './pages/CreateSession.jsx';
import SessionRoom from './pages/SessionRoom.jsx';
import SessionHistory from './pages/SessionHistory.jsx';
import SessionDetail from './pages/SessionDetail.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<CreateSession />} />
          <Route path="/session/:id" element={<SessionRoom />} />
          <Route path="/history" element={<SessionHistory />} />
          <Route path="/history/:id" element={<SessionDetail />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
