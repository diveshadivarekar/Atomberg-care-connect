import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiGet } from '../lib/api';
import {
  createDevice, createSendTransport, createRecvTransport, consume, emitAsync,
} from '../lib/mediasoup';

export default function SessionRoom() {
  const { id: sessionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const role = params.get('role') === 'agent' ? 'agent' : 'customer';
  const token = params.get('token') || '';
  const [name, setName] = useState(params.get('name') || '');
  const [nameLocked, setNameLocked] = useState(!!params.get('name'));

  const [status, setStatus] = useState('checking'); // checking | denied | lobby | in-call | ended
  const [error, setError] = useState('');

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteMicOn, setRemoteMicOn] = useState(true);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [remotePresent, setRemotePresent] = useState(false);
  const [remoteInfo, setRemoteInfo] = useState(null);

  const [tab, setTab] = useState('chat');
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [recStatus, setRecStatus] = useState('none');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const deviceRef = useRef(null);
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new MediaStream());

  // 1. Validate access (role/invite token)
  useEffect(() => {
    apiGet(`/api/sessions/${sessionId}/access?role=${role}${token ? `&token=${token}` : ''}`)
      .then((res) => {
        if (res.error) {
          setError(res.error);
          setStatus('denied');
        } else {
          setStatus('lobby');
        }
      })
      .catch(() => { setError('Could not reach server'); setStatus('denied'); });
  }, [sessionId, role, token]);

  async function joinCall() {
    if (!name.trim()) return;
    setNameLocked(true);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', async () => {
      const res = await emitAsync(socket, 'join-session', { sessionId, role, name, token });
      if (res.error) { setError(res.error); setStatus('denied'); return; }

      const device = await createDevice(res.routerRtpCapabilities);
      deviceRef.current = device;

      const sendTransport = await createSendTransport(socket, device);
      sendTransportRef.current = sendTransport;
      const recvTransport = await createRecvTransport(socket, device);
      recvTransportRef.current = recvTransport;

      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      if (audioTrack) await sendTransport.produce({ track: audioTrack });
      if (videoTrack) await sendTransport.produce({ track: videoTrack });

      if (res.peers && res.peers[0]) setRemoteInfo(res.peers[0]);

      setStatus('in-call');
    });

    socket.on('new-producer', async ({ producerId, kind, role: peerRole, name: peerName }) => {
      const consumer = await consume(socket, deviceRef.current, recvTransportRef.current, { producerId, kind });
      remoteStreamRef.current.addTrack(consumer.track);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      setRemotePresent(true);
      setRemoteInfo({ role: peerRole, name: peerName });
    });

    socket.on('peer-joined', ({ role: peerRole, name: peerName }) => {
      setRemoteInfo({ role: peerRole, name: peerName });
    });

    socket.on('peer-left', () => {
      setRemotePresent(false);
      remoteStreamRef.current.getTracks().forEach(t => remoteStreamRef.current.removeTrack(t));
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    });

    socket.on('peer-media-state', ({ kind, enabled }) => {
      if (kind === 'audio') setRemoteMicOn(enabled);
      if (kind === 'video') setRemoteCamOn(enabled);
    });

    socket.on('chat-message', (msg) => {
      setChat((prev) => [...prev, msg]);
    });

    socket.on('recording-status', ({ status: rstatus }) => setRecStatus(rstatus));

    socket.on('session-ended', () => {
      cleanup();
      setStatus('ended');
    });
  }

  function cleanup() {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    socketRef.current?.disconnect();
  }

  useEffect(() => () => cleanup(), []);

  function toggleMic() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    socketRef.current.emit('media-state', { kind: 'audio', enabled: track.enabled });
  }

  function toggleCam() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
    socketRef.current.emit('media-state', { kind: 'video', enabled: track.enabled });
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socketRef.current.emit('chat-message', { body: chatInput.trim() });
    setChatInput('');
  }

  function endCall() {
    socketRef.current.emit('end-session');
    cleanup();
    setStatus('ended');
  }

  function toggleRecording() {
    if (recStatus === 'in_progress') socketRef.current.emit('recording-stop');
    else socketRef.current.emit('recording-start');
  }

  // ---------------- Render states ----------------
  if (status === 'checking') return <div className="container">Checking session…</div>;

  if (status === 'denied') return (
    <div className="container">
      <div className="card">
        <h2>Access denied</h2>
        <p style={{ color: '#888' }}>{error}</p>
      </div>
    </div>
  );

  if (status === 'ended') return (
    <div className="container">
      <div className="card">
        <h2>Session ended</h2>
        <p style={{ color: '#888' }}>Thanks for using Atomberg Care Connect. This session's transcript and recording (if any) are saved to the session record.</p>
        <button className="btn btn-dark" onClick={() => navigate('/')}>Back to Home</button>
      </div>
    </div>
  );

  if (status === 'lobby') return (
    <div className="container" style={{ maxWidth: 480 }}>
      <div className="card">
        <h2>{role === 'agent' ? 'Join as Support Agent' : 'Join your support call'}</h2>
        <label>Your Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" disabled={nameLocked} />
        <button className="btn btn-primary" onClick={joinCall} disabled={!name.trim()}>
          Join Call
        </button>
      </div>
    </div>
  );

  // in-call
  return (
    <div className="call-screen">
      <div className="video-stage">
        {remotePresent ? (
          <video ref={remoteVideoRef} className="remote" autoPlay playsInline />
        ) : (
          <div className="empty-stage">
            <p>Waiting for {role === 'agent' ? 'customer' : 'agent'} to join…</p>
            <p style={{ fontSize: 12 }}>Share the invite link if not sent yet.</p>
          </div>
        )}
        {remotePresent && !remoteCamOn && (
          <div className="empty-stage" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1F2127' }}>
            <p>{remoteInfo?.name || 'Participant'}'s camera is off</p>
          </div>
        )}
        <div className="self-pip">
          <video ref={localVideoRef} autoPlay playsInline muted />
        </div>

        <div className="controls-bar">
          <button className={`ctrl-btn ${!micOn ? 'off' : ''}`} onClick={toggleMic} title="Toggle microphone">🎤</button>
          <button className={`ctrl-btn ${!camOn ? 'off' : ''}`} onClick={toggleCam} title="Toggle camera">📷</button>
          {role === 'agent' && (
            <button className={`ctrl-btn rec ${recStatus === 'in_progress' ? 'active' : ''}`} onClick={toggleRecording} title="Record session">
              {recStatus === 'in_progress' ? '⏹' : '⏺'}
            </button>
          )}
          <button className="ctrl-btn end" onClick={endCall} title="End call">⏹ End</button>
        </div>

        {recStatus !== 'none' && (
          <div style={{ position: 'absolute', top: 12, left: 12 }}>
            <span className={`badge ${recStatus === 'in_progress' ? 'recording' : ''}`}>
              REC: {recStatus.replace('_', ' ')}
            </span>
          </div>
        )}
        {!remoteMicOn && remotePresent && (
          <div style={{ position: 'absolute', top: 12, right: 12 }}>
            <span className="badge">🔇 {remoteInfo?.name || 'Participant'} muted</span>
          </div>
        )}
      </div>

      <div className="side-panel">
        <div className="side-tabs">
          <div className={`side-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</div>
          <div className={`side-tab ${tab === 'info' ? 'active' : ''}`} onClick={() => setTab('info')}>Session Info</div>
        </div>

        {tab === 'chat' ? (
          <>
            <div className="chat-list">
              {chat.length === 0 && <p style={{ color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 20 }}>No messages yet</p>}
              {chat.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.sender_name === name ? 'me' : ''}`}>
                  <div className="meta">{m.sender_name} · {m.sender_role}</div>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Type a message…"
              />
              <button className="btn btn-primary" onClick={sendChat}>Send</button>
            </div>
          </>
        ) : (
          <div className="info-panel">
            <div className="info-row"><span>Session ID</span><b>{sessionId}</b></div>
            <div className="info-row"><span>Your role</span><b>{role}</b></div>
            <div className="info-row"><span>Other participant</span><b>{remoteInfo?.name || '—'}</b></div>
            <div className="info-row"><span>Recording</span><b>{recStatus}</b></div>
            <p style={{ fontSize: 12 }}>
              All audio/video and chat is routed through Atomberg's own media server (no
              third-party video SDK). The full transcript and recording will be available
              in Session History once the call ends.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
