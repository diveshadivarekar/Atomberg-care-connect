import * as mediasoupClient from 'mediasoup-client';

// Thin helper that wraps the socket signaling + mediasoup Device so the
// SessionRoom component stays focused on UI/state.
export async function setupMediasoup({ socket, localStream, onRemoteTrack }) {
  const sendTransportPromise = (cb) => new Promise((resolve) => {
    socket.emit('create-transport', { direction: 'send' }, resolve);
  });

  return {
    device: null,
    sendTransport: null,
    recvTransport: null,
    producers: {},
  };
}

export function emitAsync(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

export async function createDevice(routerRtpCapabilities) {
  const device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities });
  return device;
}

export async function createSendTransport(socket, device) {
  const info = await emitAsync(socket, 'create-transport', { direction: 'send' });
  const transport = device.createSendTransport(info);

  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitAsync(socket, 'connect-transport', { transportId: transport.id, dtlsParameters })
      .then(() => callback()).catch(errback);
  });

  transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
    emitAsync(socket, 'produce', { transportId: transport.id, kind, rtpParameters })
      .then(({ id }) => callback({ id })).catch(errback);
  });

  return transport;
}

export async function createRecvTransport(socket, device) {
  const info = await emitAsync(socket, 'create-transport', { direction: 'recv' });
  const transport = device.createRecvTransport(info);

  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    emitAsync(socket, 'connect-transport', { transportId: transport.id, dtlsParameters })
      .then(() => callback()).catch(errback);
  });

  return transport;
}

export async function consume(socket, device, recvTransport, { producerId, kind }) {
  const data = await emitAsync(socket, 'consume', {
    transportId: recvTransport.id,
    producerId,
    rtpCapabilities: device.rtpCapabilities,
  });
  if (data.error) throw new Error(data.error);

  const consumer = await recvTransport.consume({
    id: data.id,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters,
  });
  return consumer;
}
