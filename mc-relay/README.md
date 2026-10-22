# Minecraft LAN relay prototype

This is only the public relay. It does not run Minecraft and does not inspect or modify game packets.

## Local test

```powershell
npm install
npm start
```

Health check: `http://localhost:10000/health`.

The Fabric client mod still needs to be written. It will connect as `host` or `join`, then carry the local LAN stream over this WebSocket. The room is limited to one host and five guests in this prototype.

## Render

Create a Web Service from this folder, use the Node runtime, and set the start command to `npm start`. Render supplies `PORT`; the server uses it automatically.
