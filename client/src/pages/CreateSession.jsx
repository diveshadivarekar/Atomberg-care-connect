import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api';

export default function CreateSession() {
  const [title, setTitle] = useState('Ceiling Fan — Remote Pairing Issue');
  const [agentName, setAgentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  async function createSession(e) {
    e.preventDefault();
    setLoading(true);
    const res = await apiPost('/api/sessions', { title, agentName: agentName || 'Agent' });
    setResult(res);
    setLoading(false);
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
  }

  const origin = window.location.origin;

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <h1>Start a Support Session</h1>
      <p className="subtitle">Create a session, then share the customer link via WhatsApp / SMS / email.</p>

      <div className="card">
        {!result ? (
          <form onSubmit={createSession}>
            <label>Your Name (Agent)</label>
            <input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Riya (Support)" required />

            <label>Session Title / Issue Summary</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Water Purifier — Filter Replacement Help" required />

            <button className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Session'}
            </button>
          </form>
        ) : (
          <div>
            <h2>Session ready ✅</h2>

            <label>Customer invite link (share this)</label>
            <div className="copy-box">
              <span style={{ flex: 1 }}>{origin}{result.customerInviteUrl}</span>
              <button className="btn btn-outline" onClick={() => copy(origin + result.customerInviteUrl)}>Copy</button>
            </div>

            <button className="btn btn-dark" onClick={() => navigate(`/session/${result.sessionId}?role=agent&name=${encodeURIComponent(agentName || 'Agent')}`)}>
              Join as Agent →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
