# Atomberg Care Connect
### Real-Time Video Support Platform — AtomQuest Hackathon 1.0 (Grand Finale)

Atomberg Care Connect is a **self-hosted, server-routed video calling platform** purpose-built
for Atomberg's customer support workflows — helping agents visually troubleshoot ceiling fans,
mixer grinders, water purifiers and smart locks with customers over a simple browser link,
with full session recording, chat transcripts, and an operations dashboard.

No third-party video SDK (Twilio/Agora/Daily/Vonage) is used. All media is routed through our
own **mediasoup SFU** running on our infrastructure.

---

## 1. Why this matters for Atomberg

Atomberg runs a pan-India service network (3000+ daily services, 99% pincode coverage) and a
support line for products like BLDC ceiling fans, the Intellon water purifier, mixer grinders
and Smart Locks. A large share of support calls are visual in nature:

- "My fan remote isn't pairing — can you see what I'm doing wrong?"
- "The Intellon purifier's filter-change light is blinking — what does this mean?"
- "My Smart Lock won't register my fingerprint — can you walk me through it?"

Today these are voice-only calls. Care Connect adds a **video layer that Atomberg fully owns**:
no per-minute third-party billing, full control over data residency (important given Atomberg's
customer grievance & privacy policies), and recordings that feed directly into the support
team's QA and training loop.

---

## 2. Architecture

```
┌──────────────┐        WebSocket (Socket.IO)        ┌────────────────────────┐
│  Agent (web)  │ ───────── signaling ──────────────▶ │                        │
│  Browser      │ ◀──── WebRTC (audio/video/DTLS) ──▶ │   Atomberg Care Server │
└──────────────┘                                      │  ┌──────────────────┐  │
                                                       │  │ mediasoup SFU     │  │
┌──────────────┐                                      │  │ (one Router per   │  │
│ Customer (web)│ ───────── signaling ──────────────▶ │  │  session)         │  │
│  Browser      │ ◀──── WebRTC (audio/video/DTLS) ──▶ │  └──────────────────┘  │
└──────────────┘                                      │  Express REST API      │
                                                       │  SQLite (sessions,     │
                                                       │   participants, chat,  │
                                                       │   recordings, events)  │
                                                       └────────────────────────┘
```

- **Media routing**: every participant opens a WebRTC `SendTransport` (to publish their
  mic/camera) and `RecvTransport` (to receive the other participant's tracks) to our
  **mediasoup** Router. Peer-to-peer connections never happen — both audio and video are
  relayed through the server, satisfying the "media must route through a server" requirement
  and giving us a natural hook point for recording.
- **Signaling**: Socket.IO carries session join, transport/produce/consume negotiation, chat,
  mute/camera state, and recording controls.
- **Persistence**: SQLite (file-based, zero external dependency for the demo — swap for
  Postgres in production) stores sessions, invites, participants (join/leave timestamps),
  chat transcripts, recording status, and an event log.
- **Roles & access (2.4)**: an *agent* creates a session (assumed to be behind Atomberg's
  internal auth in production) and receives a one-time **invite token** for the *customer*.
  The server validates the token before allowing a customer socket to join, and all
  agent-only actions (recording start/stop, ending the session via the admin API) check
  `role === 'agent'` server-side — not just hidden in the UI.

---

## 3. Feature mapping to the problem statement

| Requirement | Implementation |
|---|---|
| 2.1 Session Management | `POST /api/sessions` creates a session + invite token; both join via browser; `end-session` event closes all connections; full history in SQLite, queryable via `/api/sessions/:id` |
| 2.2 Audio/Video | mediasoup SFU — server-routed, no P2P; mute/camera toggles broadcast via `media-state` |
| 2.3 In-call Chat | Socket.IO `chat-message`, persisted to `chat_messages`, retrievable via session detail page |
| 2.4 Roles & Access | `agent` vs `customer`; customer requires valid invite token; server-side role checks |
| 3.1 Recording | Recording state machine (`in_progress → processing → ready`) wired through sockets + DB; `server/src/recorder.js` documents the production GStreamer/ffmpeg pipeline via mediasoup PlainTransport |
| 3.2 File sharing in chat | `chat-message` payload supports `fileUrl`/`fileName`; see extension notes below |
| 3.3 Reconnect handling | 30s grace window (`pendingDisconnects`) — `peer-left` is only emitted after the window expires |
| 3.4 Admin dashboard | `/admin` — live sessions, participants, durations, "End Session" button, backed by `/api/admin/live` |
| 3.5 Observability | `/metrics` — Prometheus-style gauges for active sessions, connected participants, room count |

---

## 4. Tech stack

- **Server**: Node.js, Express, Socket.IO, **mediasoup** (SFU), better-sqlite3
- **Client**: React + Vite, mediasoup-client, react-router, plain CSS (Atomberg yellow/black theme)
- **Storage**: SQLite (file) — swap to Postgres/managed DB for production scale
- **Deploy target**: any VM/container with open UDP range for mediasoup (40000–40100 by default)

---

## 5. Running locally

### Server
```bash
cd server
cp .env.example .env
npm install
npm start          # listens on :4000
```

### Client
```bash
cd client
npm install
npm run dev         # http://localhost:5173, proxies /api and /socket.io to :4000
```

### Demo flow
1. Open `http://localhost:5173/new`, enter agent name + issue title → **Create Session**.
2. Click **Join as Agent** (grants mic/camera permission).
3. Copy the customer invite link, open it in a second browser/incognito window (acts as the customer) and join.
4. Both sides see live video, can mute/unmute camera & mic, and chat.
5. Agent clicks ⏺ to start a recording, ⏹ to stop — status flows `in_progress → processing → ready`.
6. Either side clicks **End** — both connections close cleanly.
7. Visit `/history` to see the session, participants with join/leave timestamps, chat transcript,
   recording status and full event log. Visit `/admin` to see live sessions while a call is active.

---

## 6. Known limitations / next steps

- **Recording**: the signaling + state machine + DB schema are complete and wired end-to-end;
  the actual RTP capture (`server/src/recorder.js`) is documented as the next integration step
  using mediasoup `PlainTransport` → ffmpeg, the standard pattern from the mediasoup demo.
- **File sharing**: chat message schema already supports `file_url`/`file_name`; an
  `/api/sessions/:id/upload` multipart endpoint (multer → local/object storage) is the natural
  next addition.
- **Auth**: agent identity is currently entered freeform for demo purposes; in production this
  binds to Atomberg's internal SSO and the invite token is generated against a real ticket ID.
- **TURN server**: for customers behind restrictive corporate NATs, add a coturn TURN server
  and pass its credentials to `createWebRtcTransport`.
- **Scale-out**: one mediasoup worker is created per server instance; for horizontal scale,
  shard rooms across multiple mediasoup workers/instances behind a Redis-backed signaling layer.
