# MC LAN Relay v2

Node.js WebSocket relay for Minecraft LAN worlds. For private invitations only: it forwards encrypted (WSS) raw Minecraft TCP streams between a host's Fabric mod and its guests. It does **not** run Minecraft. Host and guest must use the matching Fabric mod v0.2.0.

- `npm install`, `npm start`; listens on the Render-provided `PORT` or `10000`.
- `GET /health` returns `{ "ok": true, "version": 2, "rooms": n }`.
- Host sends `{ "role": "host", "version": 2 }` and receives a 12-character random room code.
- Guest sends `{ "role": "join", "version": 2, "code": "..." }` and receives `joined`.
- Host receives `guest-open` / `guest-close` / `peer-count` JSON controls.
- Guest-to-host binary payload: 4-byte big-endian guest ID followed by unmodified Minecraft TCP bytes.
- Host-to-guest binary payload: same format, server strips the ID and forwards raw payload only to the corresponding guest.
- Up to five guest streams per room, 200 rooms and 400 sockets process-wide by default.
- 30-second ping/pong heartbeat; socket backpressure guard; 10-second hello timeout.

Deploy by replacing the existing `mc-relay/server.js` and `mc-relay/package.json` in the GitHub repository connected to Render. This server **replaces** the incompatible v1 broadcast protocol. Existing v1 clients must be upgraded.

**Security:** codes are invitation secrets, not accounts. Anyone who knows the code can request a connection; share codes privately. For a large public deployment, add authentication, anti-abuse controls, resource monitoring, and explicit access policies.
