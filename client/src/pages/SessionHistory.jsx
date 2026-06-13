import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../lib/api';

export default function SessionHistory() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    apiGet('/api/sessions').then(res => setSessions(res.sessions || []));
  }, []);

  return (
    <div className="container">
      <h1>Session History</h1>
      <p className="subtitle">All support sessions, queryable by status, agent and time.</p>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.created_by}</td>
                <td><span className={`badge ${s.status === 'active' ? 'live' : s.status === 'ended' ? 'ended' : ''}`}>{s.status}</span></td>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td><Link className="btn btn-outline" to={`/history/${s.id}`}>View</Link></td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#aaa' }}>No sessions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
