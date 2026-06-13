import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../lib/api';

export default function AdminDashboard() {
  const [live, setLive] = useState([]);

  async function refresh() {
    const res = await apiGet('/api/admin/live');
    setLive(res.live || []);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  async function endSession(sessionId) {
    await apiPost(`/api/admin/sessions/${sessionId}/end`, {});
    refresh();
  }

  return (
    <div className="container">
      <h1>Operations Dashboard</h1>
      <p className="subtitle">Live sessions across all support agents — auto-refreshes every 4s.</p>

      {live.length === 0 && (
        <div className="card"><p style={{ color: '#888' }}>No live sessions right now.</p></div>
      )}

      {live.map(s => (
        <div className="card" key={s.sessionId} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Session {s.sessionId} <span className="badge live">live</span></h2>
            <button className="btn btn-danger" onClick={() => endSession(s.sessionId)}>End Session</button>
          </div>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Name</th><th>Role</th><th>Duration</th></tr></thead>
            <tbody>
              {s.participants.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{p.role}</td>
                  <td>{p.durationSec}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card">
        <h2>Metrics</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          A Prometheus-compatible scrape endpoint is exposed at <code>/metrics</code>, exporting
          <code> atomberg_care_active_sessions</code>, <code>atomberg_care_connected_participants</code>
          and <code> atomberg_care_rooms_total</code> for Grafana dashboards.
        </p>
        <a className="btn btn-outline" href="/metrics" target="_blank" rel="noreferrer">View raw metrics</a>
      </div>
    </div>
  );
}
