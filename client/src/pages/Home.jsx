import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="container">
      <h1>Atomberg Care Connect</h1>
      <p className="subtitle">
        Face-to-face support for fans, kitchen appliances, water purifiers &amp; smart locks —
        owned end-to-end on Atomberg's own infrastructure. No third-party video SDKs,
        no data leaving our servers.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <h2>For Support Agents</h2>
        <p style={{ color: '#6B7280', fontSize: 14 }}>
          Start a live video session, get an instant link for the customer, see exactly
          what they see, and resolve the issue in one call — whether it's a flickering
          BLDC fan remote, a water purifier filter-change indicator, or a smart lock
          pairing problem.
        </p>
        <Link to="/new"><button className="btn btn-primary">+ Start New Support Session</button></Link>
      </div>

      <div className="card">
        <h2>How it works</h2>
        <ol style={{ color: '#444', fontSize: 14, lineHeight: 1.8 }}>
          <li>Agent creates a session and shares a one-time link / WhatsApp message with the customer.</li>
          <li>Customer joins instantly from any browser — no app download, just like Atomberg's "Request a Service" flow.</li>
          <li>Both sides see live video, can mute/unmute, and chat — all media is relayed through Atomberg's own SFU server.</li>
          <li>Agent can record the call for QA/training and review the full transcript + recording afterwards.</li>
        </ol>
      </div>
    </div>
  );
}
