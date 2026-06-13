// recorder.js — (extension point, not wired into the live demo)
//
// Production recording pipeline for Atomberg Care Connect, following the
// standard mediasoup recording pattern:
//
// 1. When an agent calls `recording-start`, for each existing Producer in the
//    room (audio + video, both participants):
//      - create a PlainTransport on the router (rtcpMux: true, comedia: true)
//      - `consume()` the producer on that PlainTransport
//      - the PlainTransport now sends raw RTP to a local UDP port
//
// 2. Generate an SDP file describing these RTP streams (codec, payload type,
//    port) and launch ffmpeg (or GStreamer) with that SDP as input, writing
//    a combined .webm/.mp4 to disk:
//
//      ffmpeg -protocol_whitelist file,rtp,udp -i recording.sdp \
//             -c:v copy -c:a copy /recordings/<sessionId>.webm
//
// 3. On `recording-stop`, send SIGINT to the ffmpeg process for a clean
//    container finalisation, then update `recordings.status = 'ready'` and
//    `recordings.file_path` once ffmpeg exits.
//
// 4. The file is served statically (e.g. `app.use('/recordings', express.static(...))`)
//    and surfaced in the Session Detail page's "Recording" card.
//
// This file intentionally documents the integration rather than shipping a
// full ffmpeg dependency in the hackathon build — index.js already implements
// the full state machine (in_progress -> processing -> ready) and UI so the
// pipeline above can be dropped in without touching the client.

module.exports = {};
