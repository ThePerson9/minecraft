import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 10000);
const MAX_GUESTS = 5;
const MAX_ROOMS = 200;
const MAX_CONNECTIONS = 400;
const MAX_PAYLOAD = 1024 * 1024;
const MAX_BUFFERED = 4 * 1024 * 1024;
const rooms = new Map();
let nextGuestId = 1;

const live = s => s?.readyState === WebSocket.OPEN;
const message = (s, obj) => { if (live(s)) s.send(JSON.stringify(obj)); };
const close = (s, code, why) => { if (live(s)) s.close(code, why); };
function code() {
  let c;
  do c = crypto.randomBytes(9).toString('base64url'); while (rooms.has(c));
  return c;
}
function send(s, data, binary = true) {
  if (!live(s)) return false;
  if (s.bufferedAmount + data.length > MAX_BUFFERED) {
    close(s, 1013, 'slow consumer');
    return false;
  }
  s.send(data, {binary});
  return true;
}
function dropGuest(room, id, closeSocket = false) {
  const g = room.guests.get(id);
  if (!g) return;
  room.guests.delete(id);
  if (closeSocket) close(g, 1000, 'stream ended');
  message(room.host, {type: 'guest-close', id});
  message(room.host, {type: 'peer-count', count: room.guests.size});
}
function finishRoom(room) {
  if (rooms.get(room.code) !== room) return;
  rooms.delete(room.code);
  for (const g of room.guests.values()) close(g, 1001, 'host left');
  room.guests.clear();
}
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
    res.end(JSON.stringify({ok: true, version: 2, rooms: rooms.size}));
    return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({server: httpServer, maxPayload: MAX_PAYLOAD});
wss.on('connection', (socket) => {
  if (wss.clients.size > MAX_CONNECTIONS) { close(socket, 1013, 'relay busy'); return; }
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  let role = 'pending';
  let room = null;
  let guestId = 0;
  // Terminate sockets that do not complete a handshake within 10 seconds.
  const handshakeTimer = setTimeout(() => {
    if (role === 'pending') close(socket, 1008, 'hello timeout');
  }, 10000);
  socket.once('message', (raw, binary) => {
    if (role !== 'pending') return;
    clearTimeout(handshakeTimer);
    if (binary || raw.length > 1024) { close(socket, 1008, 'invalid hello'); return; }
    let hello;
    try { hello = JSON.parse(raw.toString('utf8')); }
    catch { close(socket, 1008, 'invalid hello'); return; }
    if (!hello || hello.version !== 2 || !['host', 'join'].includes(hello.role)) {
      close(socket, 1008, 'unsupported protocol'); return;
    }
    if (hello.role === 'host') {
      if (rooms.size >= MAX_ROOMS) { close(socket, 1013, 'relay busy'); return; }
      const c = code();
      room = {code: c, host: socket, guests: new Map()};
      rooms.set(c, room);
      role = 'host';
      message(socket, {type: 'room', code: c});
    } else {
      const c = typeof hello.code === 'string' ? hello.code : '';
      room = rooms.get(c);
      if (!room || !live(room.host) || room.guests.size >= MAX_GUESTS) {
        close(socket, 1008, 'room unavailable'); return;
      }
      role = 'guest';
      guestId = nextGuestId++;
      if (nextGuestId > 0x7fffffff) nextGuestId = 1;
      room.guests.set(guestId, socket);
      message(socket, {type: 'joined', code: c});
      message(room.host, {type: 'guest-open', id: guestId});
      message(room.host, {type: 'peer-count', count: room.guests.size});
    }
    socket.on('message', (data, isBinary) => {
      if (!room) return;
      if (role === 'host') {
        if (rooms.get(room.code) !== room) return;
        if (!isBinary) {
          let command;
          try { command = JSON.parse(data.toString('utf8')); } catch { return; }
          if (command?.type === 'guest-close' && Number.isInteger(command.id)) {
            dropGuest(room, command.id, true);
          }
          return;
        }
        if (data.length < 5) return;
        const id = data.readUInt32BE(0);
        const guest = room.guests.get(id);
        if (guest) send(guest, data.subarray(4));
      } else if (role === 'guest') {
        if (!isBinary) { close(socket, 1008, 'binary only'); return; }
        if (!room.guests.has(guestId)) return;
        const frame = Buffer.allocUnsafe(4 + data.length);
        frame.writeUInt32BE(guestId, 0);
        data.copy(frame, 4);
        if (!send(room.host, frame)) close(socket, 1011, 'host unavailable');
      }
    });
  });
  socket.on('close', () => {
    clearTimeout(handshakeTimer);
    if (role === 'host' && room) finishRoom(room);
    if (role === 'guest' && room) dropGuest(room, guestId);
  });
  socket.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    if (live(socket)) socket.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));
httpServer.listen(PORT, '0.0.0.0', () => console.log(`MC LAN Relay v2 listening on ${PORT}`));
