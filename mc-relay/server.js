import http from "node:http";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 10000);
const rooms = new Map();

function code() {
  let value;
  do value = crypto.randomInt(100000, 1000000).toString();
  while (rooms.has(value));
  return value;
}

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 2 * 1024 * 1024 });

wss.on("connection", (socket) => {
  let room;
  let peer;

  socket.once("message", (raw) => {
    let hello;
    try { hello = JSON.parse(raw.toString()); } catch { socket.close(1008, "bad hello"); return; }
    if (!hello || !["host", "join"].includes(hello.role)) { socket.close(1008, "bad role"); return; }

    if (hello.role === "host") {
      room = code();
      rooms.set(room, { host: socket, guests: new Set() });
      socket.send(JSON.stringify({ type: "room", code: room }));
    } else {
      room = String(hello.code || "");
      const entry = rooms.get(room);
      if (!entry || entry.guests.size >= 5) { socket.close(1008, "room unavailable"); return; }
      entry.guests.add(socket);
      peer = entry.host;
      socket.send(JSON.stringify({ type: "joined", code: room }));
      entry.host.send(JSON.stringify({ type: "peer-count", count: entry.guests.size }));
    }

    socket.on("message", (data, binary) => {
      const entry = rooms.get(room);
      if (!entry) return;
      if (hello.role === "host") {
        for (const guest of entry.guests) if (guest.readyState === 1) guest.send(data, { binary });
      } else if (entry.host.readyState === 1) {
        entry.host.send(data, { binary });
      }
    });
    socket.on("close", () => {
      const entry = rooms.get(room);
      if (!entry) return;
      if (hello.role === "host") {
        for (const guest of entry.guests) guest.close(1001, "host left");
        rooms.delete(room);
      } else {
        entry.guests.delete(socket);
        if (entry.host.readyState === 1) entry.host.send(JSON.stringify({ type: "peer-count", count: entry.guests.size }));
      }
    });
  });
});

httpServer.listen(port, () => console.log(`MC relay listening on ${port}`));
