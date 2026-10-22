# Client protocol

The first WebSocket frame is UTF-8 JSON:

* host: `{ "role": "host" }`; the server replies with `{ "type": "room", "code": "123456" }`.
* guest: `{ "role": "join", "code": "123456" }`; the server replies with `{ "type": "joined", "code": "123456" }`.

After the handshake, binary frames are forwarded unchanged. JSON control frames use the same channel and must be ignored by the Minecraft stream adapter.
