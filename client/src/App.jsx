import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="app-shell">
      <div className="topbar">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand">
            <span className="dot" />
            atomberg <small>CARE CONNECT — Live Video Support</small>
          </div>
        </Link>
        <div>
          <Link className="nav-link" to="/new">New Session</Link>
          <Link className="nav-link" to="/history">Session History</Link>
          <Link className="nav-link" to="/admin">Admin</Link>
        </div>
      </div>
      <Outlet />
      <div className="footer-note">
        Atomberg Care Connect · Server-routed video support · Built for AtomQuest Hackathon 1.0
      </div>
    </div>
  );
}
