// index.js — Atomberg Care: Real-Time Video Support Platform (server)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');
const db = require('./db');
const sfu = require('./sfu');

const PORT = process.env.PORT || 4000;
const RECONNECT_GRACE_MS = 30 * 1000; // 30s reconnect window (3.3 Reconnect Handling)

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ---------------------------------------------------------------------------
// In-memory live-state (mirrors DB, used for fast admin dashboard / presence)
// sessionId -> { participants: Map(socketId -> {role,name,joinedAt}), ... }
// ---------------------------------------------------------------------------
const liveSessions = new Map();
// pending disconnects awaiting reconnect grace window
const pendingDisconnects = new Map(); // key: `${sessionId}:${role}:${name}` -> timeout handle + state

function nowTs() { return Date.now(); }

// ---------------------------------------------------------------------------
// REST API — Session Management (2.1)
// ---------------------------------------------------------------------------

// Agent creates a new support session
app.post('/api/sessions', (req, res) => {
  const { title, agentName } = req.body;
  const id = nanoid(10);
  db.prepare(
    `INSERT INTO sessions (id, title, created_by, status, created_at) VALUES (?,?,?,?,?)`
  ).run(id, title || 'Support Session', agentName || 'Agent', 'created', nowTs());

  // Generate a shareable customer invite token
  const token = nanoid(16);
  db.prepare(
    `INSERT INTO invites (token, session_id, role, created_at) VALUES (?,?,?,?)`
  ).run(token, id, 'customer', nowTs());

  liveSessions.set(id, { participants: new Map(), startedAt: nowTs() });

  res.json({
    sessionId: id,
    agentJoinUrl: `/session/${id}?role=agent`,
    customerInviteUrl: `/session/${id}?token=${token}`,
  });
});

// Validate an invite / agent access before joining
app.get('/api/sessions/:id/access', (req, res) => {
  const { id } = req.params;
  const { token, role } = req.query;
  const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (role === 'agent') {
    // In production: verify agent auth (JWT/session). Kept simple for demo.
    return res.json({ ok: true, role: 'agent', session });
  }

  // Customer must present a valid, session-scoped invite token
  const invite = db.prepare('SELECT * FROM invites WHERE token=? AND session_id=?').get(token, id);
  if (!invite) return res.status(403).json({ error: 'Invalid or expired invite link' });

  res.json({ ok: true, role: 'customer', session });
});

// Session history (who joined, when, duration) — queryable record
app.get('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!session) return res.status(404).json({ error: 'Not found' });

  const participants = db.prepare('SELECT * FROM participants WHERE session_id=? ORDER BY joined_at').all(id);
  const chat = db.prepare('SELECT * FROM chat_messages WHERE session_id=? ORDER BY created_at').all(id);
  const recording = db.prepare('SELECT * FROM recordings WHERE session_id=?').get(id) || { status: 'none' };
  const events = db.prepare('SELECT * FROM events WHERE session_id=? ORDER BY created_at').all(id);

  res.json({ session, participants, chat, recording, events });
});

// List all sessions (for support team history view)
app.get('/api/sessions', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100').all();
  res.json({ sessions });
});

// ---------------------------------------------------------------------------
// Admin Dashboard APIs (3.4)
// ---------------------------------------------------------------------------
app.get('/api/admin/live', (req, res) => {
  const live = [];
  for (const [sessionId, state] of liveSessions.entries()) {
    const participants = [...state.participants.values()].map(p => ({
      role: p.role,
      name: p.name,
      joinedAt: p.joinedAt,
      durationSec: Math.round((nowTs() - p.joinedAt) / 1000),
    }));
    if (participants.length > 0) {
      live.push({ sessionId, participants, startedAt: state.startedAt });
    }
  }
  res.json({ live });
});

app.post('/api/admin/sessions/:id/end', (req, res) => {
  endSession(req.params.id, 'admin');
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Observability (3.5) — Prometheus-style metrics endpoint
// ---------------------------------------------------------------------------
app.get('/metrics', (req, res) => {
  let activeSessions = 0, connectedParticipants = 0;
  for (const state of liveSessions.values()) {
    if (state.participants.size > 0) {
      activeSessions += 1;
      connectedParticipants += state.participants.size;
    }
  }
  res.set('Content-Type', 'text/plain');
  res.send(
    `# HELP atomberg_care_active_sessions Number of sessions with at least one participant\n` +
    `# TYPE atomberg_care_active_sessions gauge\n` +
    `atomberg_care_active_sessions ${activeSessions}\n` +
    `# HELP atomberg_care_connected_participants Number of currently connected participants\n` +
    `# TYPE atomberg_care_connected_participants gauge\n` +
    `atomberg_care_connected_participants ${connectedParticipants}\n` +
    `# HELP atomberg_care_rooms_total Total mediasoup rooms in memory\n` +
    `# TYPE atomberg_care_rooms_total gauge\n` +
    `atomberg_care_rooms_total ${sfu.rooms.size}\n`
  );
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function logEvent(sessionId, type, payload = {}) {
  db.prepare(`INSERT INTO events (id, session_id, type, payload, created_at) VALUES (?,?,?,?,?)`)
    .run(nanoid(8), sessionId, type, JSON.stringify(payload), nowTs());
}

function endSession(sessionId, by = 'participant') {
  const state = liveSessions.get(sessionId);
  if (state) {
    for (const socketId of state.participants.keys()) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('session-ended', { by });
        sock.disconnect(true);
      }
      sfu.removePeer(sessionId, socketId);
    }
    liveSessions.delete(sessionId);
  }
  db.prepare(`UPDATE sessions SET status='ended', ended_at=? WHERE id=?`).run(nowTs(), sessionId);
  logEvent(sessionId, 'session_ended', { by });
}

// ---------------------------------------------------------------------------
// Socket.IO — Signaling, Audio/Video (2.2), Chat (2.3), Roles (2.4)
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  let ctx = { sessionId: null, role: null, name: null, participantId: null };

  socket.on('join-session', async ({ sessionId, role, name, token, reconnectKey }, cb) => {
    try {
      const session = db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId);
      if (!session) return cb({ error: 'Session not found' });
      if (session.status === 'ended') return cb({ error: 'This session has ended' });

      // --- Access control (2.4): customers MUST present a valid invite ---
      if (role === 'customer') {
        const invite = db.prepare('SELECT * FROM invites WHERE token=? AND session_id=?').get(token, sessionId);
        if (!invite) return cb({ error: 'Invalid invite link' });
      } else if (role !== 'agent') {
        return cb({ error: 'Invalid role' });
      }

      // --- Reconnect handling (3.3) ---
      const rkey = `${sessionId}:${role}:${name}`;
      if (pendingDisconnects.has(rkey)) {
        clearTimeout(pendingDisconnects.get(rkey).timeout);
        pendingDisconnects.delete(rkey);
        logEvent(sessionId, 'participant_reconnected', { role, name });
      }

      ctx = { sessionId, role, name, participantId: nanoid(8) };
      socket.join(sessionId);

      const state = liveSessions.get(sessionId) || { participants: new Map(), startedAt: nowTs() };
      state.participants.set(socket.id, { role, name, joinedAt: nowTs(), participantId: ctx.participantId });
      liveSessions.set(sessionId, state);

      db.prepare(
        `INSERT INTO participants (id, session_id, role, name, joined_at) VALUES (?,?,?,?,?)`
      ).run(ctx.participantId, sessionId, role, name, nowTs());

      db.prepare(`UPDATE sessions SET status='active' WHERE id=? AND status='created'`).run(sessionId);
      logEvent(sessionId, 'participant_joined', { role, name });

      const room = await sfu.getOrCreateRoom(sessionId);

      // notify others that someone joined
      socket.to(sessionId).emit('peer-joined', { role, name, socketId: socket.id });

      cb({
        ok: true,
        routerRtpCapabilities: room.router.rtpCapabilities,
        peers: [...state.participants.entries()]
          .filter(([id]) => id !== socket.id)
          .map(([id, p]) => ({ socketId: id, role: p.role, name: p.name })),
      });
    } catch (err) {
      console.error(err);
      cb({ error: 'join failed' });
    }
  });

  // --- WebRTC transport / produce / consume (server-routed media, 2.2) ---
  socket.on('create-transport', async ({ direction }, cb) => {
    try {
      const room = await sfu.getOrCreateRoom(ctx.sessionId);
      const transport = await sfu.createWebRtcTransport(room.router);

      let peer = room.peers.get(socket.id);
      if (!peer) {
        peer = { transports: new Map(), producers: new Map(), consumers: new Map() };
        room.peers.set(socket.id, peer);
      }
      peer.transports.set(transport.id, transport);

      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') transport.close();
      });

      cb({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      console.error(err);
      cb({ error: 'transport creation failed' });
    }
  });

  socket.on('connect-transport', async ({ transportId, dtlsParameters }, cb) => {
    const room = sfu.getRoom(ctx.sessionId);
    const peer = room?.peers.get(socket.id);
    const transport = peer?.transports.get(transportId);
    if (!transport) return cb({ error: 'transport not found' });
    await transport.connect({ dtlsParameters });
    cb({ ok: true });
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters }, cb) => {
    const room = sfu.getRoom(ctx.sessionId);
    const peer = room?.peers.get(socket.id);
    const transport = peer?.transports.get(transportId);
    if (!transport) return cb({ error: 'transport not found' });

    const producer = await transport.produce({ kind, rtpParameters });
    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => producer.close());

    // tell other peer a new producer is available
    socket.to(ctx.sessionId).emit('new-producer', {
      socketId: socket.id, producerId: producer.id, kind, role: ctx.role, name: ctx.name,
    });

    cb({ id: producer.id });
  });

  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, cb) => {
    const room = sfu.getRoom(ctx.sessionId);
    const peer = room?.peers.get(socket.id);
    const transport = peer?.transports.get(transportId);
    if (!transport) return cb({ error: 'transport not found' });

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      return cb({ error: 'cannot consume' });
    }

    const consumer = await transport.consume({
      producerId, rtpCapabilities, paused: false,
    });
    peer.consumers.set(consumer.id, consumer);

    cb({
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  });

  // --- Mute / camera-off signaling (2.2) ---
  socket.on('media-state', ({ kind, enabled }) => {
    socket.to(ctx.sessionId).emit('peer-media-state', { socketId: socket.id, kind, enabled, role: ctx.role });
  });

  // --- In-call chat (2.3) ---
  socket.on('chat-message', ({ body, fileUrl, fileName }) => {
    if (!ctx.sessionId) return;
    const msg = {
      id: nanoid(10),
      sessionId: ctx.sessionId,
      sender_role: ctx.role,
      sender_name: ctx.name,
      body: body || null,
      file_url: fileUrl || null,
      file_name: fileName || null,
      created_at: nowTs(),
    };
    db.prepare(
      `INSERT INTO chat_messages (id, session_id, sender_role, sender_name, body, file_url, file_name, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(msg.id, msg.sessionId, msg.sender_role, msg.sender_name, msg.body, msg.file_url, msg.file_name, msg.created_at);

    io.to(ctx.sessionId).emit('chat-message', msg);
  });

  // --- Recording controls (3.1) ---
  socket.on('recording-start', () => {
    if (ctx.role !== 'agent') return;
    db.prepare(
      `INSERT INTO recordings (session_id, status, started_at) VALUES (?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET status='in_progress', started_at=excluded.started_at`
    ).run(ctx.sessionId, 'in_progress', nowTs());
    logEvent(ctx.sessionId, 'recording_started', {});
    io.to(ctx.sessionId).emit('recording-status', { status: 'in_progress' });
    // NOTE: actual media capture is performed by the recorder worker (see
    // server/src/recorder.js) which subscribes to this room's producers
    // via a mediasoup PlainTransport and pipes RTP into ffmpeg/GStreamer.
  });

  socket.on('recording-stop', () => {
    if (ctx.role !== 'agent') return;
    db.prepare(
      `UPDATE recordings SET status='processing', ended_at=? WHERE session_id=?`
    ).run(nowTs(), ctx.sessionId);
    logEvent(ctx.sessionId, 'recording_stopped', {});
    io.to(ctx.sessionId).emit('recording-status', { status: 'processing' });

    // Simulate async post-processing completion (replace with real ffmpeg job)
    setTimeout(() => {
      const filePath = `/recordings/${ctx.sessionId}.webm`;
      db.prepare(`UPDATE recordings SET status='ready', file_path=? WHERE session_id=?`)
        .run(filePath, ctx.sessionId);
      io.to(ctx.sessionId).emit('recording-status', { status: 'ready', filePath });
    }, 4000);
  });

  // --- End session (2.1) ---
  socket.on('end-session', () => {
    if (!ctx.sessionId) return;
    endSession(ctx.sessionId, ctx.role);
  });

  // --- Disconnect / reconnect grace window (3.3) ---
  socket.on('disconnect', () => {
    if (!ctx.sessionId) return;
    const { sessionId, role, name, participantId } = ctx;

    sfu.removePeer(sessionId, socket.id);

    const state = liveSessions.get(sessionId);
    if (state) state.participants.delete(socket.id);

    db.prepare(`UPDATE participants SET left_at=? WHERE id=?`).run(nowTs(), participantId);

    const rkey = `${sessionId}:${role}:${name}`;
    logEvent(sessionId, 'participant_disconnected', { role, name });

    // Hold state for RECONNECT_GRACE_MS; do NOT notify the other party yet.
    const timeout = setTimeout(() => {
      pendingDisconnects.delete(rkey);
      // grace window expired -> treat as fully left
      socket.to(sessionId).emit('peer-left', { socketId: socket.id, role, name });
      logEvent(sessionId, 'participant_left', { role, name });
    }, RECONNECT_GRACE_MS);

    pendingDisconnects.set(rkey, { timeout });
  });
});

// ---------------------------------------------------------------------------
sfu.init().then(() => {
  server.listen(PORT, () => console.log(`Atomberg Care server listening on :${PORT}`));
});
