import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiGet } from '../lib/api';

export default function SessionDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    apiGet(`/api/sessions/${id}`).then(setData);
  }, [id]);

  if (!data) return <div className="container">Loading…</div>;
  if (data.error) return <div className="container">Not found</div>;

  const { session, participants, chat, recording, events } = data;

  function duration(p) {
    if (!p.left_at) return 'still connected';
    const sec = Math.round((p.left_at - p.joined_at) / 1000);
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  }

  return (
    <div className="container">
      <Link className="nav-link" style={{ color: '#888' }} to="/history">← Back to history</Link>
      <h1 style={{ marginTop: 10 }}>{session.title}</h1>
      <p className="subtitle">
        <span className={`badge ${session.status === 'active' ? 'live' : 'ended'}`}>{session.status}</span>
        {'  '}Session ID: {session.id}
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Participants</h2>
        <table>
          <thead><tr><th>Name</th><th>Role</th><th>Joined</th><th>Duration</th></tr></thead>
          <tbody>
            {participants.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.role}</td>
                <td>{new Date(p.joined_at).toLocaleTimeString()}</td>
                <td>{duration(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Recording</h2>
        {recording.status === 'none' && <p style={{ color: '#888' }}>No recording was made for this session.</p>}
        {recording.status === 'in_progress' && <p><span className="badge recording">In progress</span></p>}
        {recording.status === 'processing' && <p><span className="badge recording">Processing…</span></p>}
        {recording.status === 'ready' && (
          <p>
            <span className="badge live">Ready</span>{' '}
            <a className="btn btn-outline" href={recording.file_path} download>Download recording</a>
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Chat Transcript</h2>
        {chat.length === 0 && <p style={{ color: '#888' }}>No chat messages.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chat.map(m => (
            <div key={m.id} style={{ fontSize: 13 }}>
              <b>{m.sender_name}</b> <span style={{ color: '#aaa' }}>({m.sender_role}) · {new Date(m.created_at).toLocaleTimeString()}</span>
              <div>{m.body}{m.file_url && <a href={m.file_url}> 📎 {m.file_name}</a>}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Event Log</h2>
        <table>
          <thead><tr><th>Time</th><th>Event</th><th>Details</th></tr></thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleTimeString()}</td>
                <td>{e.type}</td>
                <td style={{ color: '#888' }}>{e.payload}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
