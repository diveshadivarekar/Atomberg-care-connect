// sfu.js — thin wrapper around mediasoup giving us per-session Routers
// (Server-routed media: every participant sends to the server (Producer)
// and receives from the server (Consumer). No direct P2P ever happens.)

const mediasoup = require('mediasoup');

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
];

const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1';
const RTC_MIN_PORT = parseInt(process.env.RTC_MIN_PORT || '40000', 10);
const RTC_MAX_PORT = parseInt(process.env.RTC_MAX_PORT || '40100', 10);

let worker;
const rooms = new Map(); // sessionId -> { router, peers: Map }

async function init() {
  worker = await mediasoup.createWorker({
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
  });
  worker.on('died', () => {
    console.error('mediasoup worker died, exiting');
    process.exit(1);
  });
}

async function getOrCreateRoom(sessionId) {
  let room = rooms.get(sessionId);
  if (room) return room;

  const router = await worker.createRouter({ mediaCodecs });
  room = { router, peers: new Map() }; // peers: socketId -> { transports, producers, consumers }
  rooms.set(sessionId, room);
  return room;
}

function getRoom(sessionId) {
  return rooms.get(sessionId);
}

async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 800000,
  });
  return transport;
}

function removePeer(sessionId, socketId) {
  const room = rooms.get(sessionId);
  if (!room) return;
  const peer = room.peers.get(socketId);
  if (!peer) return;
  for (const t of peer.transports.values()) {
    try { t.close(); } catch (_) {}
  }
  room.peers.delete(socketId);
  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(sessionId);
  }
}

module.exports = {
  init,
  getOrCreateRoom,
  getRoom,
  createWebRtcTransport,
  removePeer,
  rooms,
};
