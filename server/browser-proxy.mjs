import { WebSocket, WebSocketServer } from "ws";

// The browser component sees only this authenticated, same-origin endpoint.
// Provider JWTs and internal ports never leave the server.
export function attachBrowserProxy(server, { handle, db, workbench, port }) {
  const sockets = new Set(), pending = new Set();
  let closed = false;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  server.on("upgrade", async (req, socket, head) => {
    let upstream;
    const opening = { socket, upstream: null }; pending.add(opening);
    const forget = () => pending.delete(opening);
    socket.once("close", forget);
    const reject = () => { forget(); upstream?.terminate(); if (!socket.destroyed) socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); };
    try {
      if (closed) return reject();
      const host = req.headers.host;
      if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host) || req.headers.origin !== `http://${host}` || !req.headers.cookie) return reject();
      const url = new URL(req.url, `http://${host}`);
      const match = url.pathname.match(/^\/api\/workspace\/spaces\/([a-f0-9-]{36})\/browser\/socket$/);
      if (!match || url.search || !workbench?.available) return reject();
      const allowed = async () => {
        const response = await handle(new Request(`http://${host}/api/workspace/spaces/${match[1]}/browser`, { headers: { cookie: req.headers.cookie } }), db);
        if (!response.ok) return false;
        const data = await response.json();
        return data.available && data.state === "running";
      };
      if (!await allowed() || socket.destroyed) return reject();
      const connection = await workbench.browserSocket(match[1]);
      upstream = new WebSocket(connection.url, { headers: connection.headers, handshakeTimeout: 8000, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
      opening.upstream = upstream;
      await new Promise((resolve, fail) => { upstream.once("open", resolve); upstream.once("error", fail); });
      if (closed || socket.destroyed || !await allowed()) { upstream.terminate(); return reject(); }
      forget();
      wss.handleUpgrade(req, socket, head, client => {
        const pair = { client, upstream }; sockets.add(pair);
        let checking = false, timer;
        const close = () => { clearInterval(timer); sockets.delete(pair); client.terminate(); upstream.terminate(); };
        const forward = (target, data, isBinary) => {
          if (target.readyState !== WebSocket.OPEN || target.bufferedAmount > 4 * 1024 * 1024) return close();
          target.send(data, { binary: isBinary });
        };
        client.on("message", (data, binary) => forward(upstream, data, binary));
        upstream.on("message", (data, binary) => forward(client, data, binary));
        client.on("error", close); upstream.on("error", close);
        client.on("close", close); upstream.on("close", close);
        timer = setInterval(async () => {
          if (checking) return;
          checking = true;
          try { if (!await allowed()) close(); } catch { close(); }
          finally { checking = false; }
        }, 2000);
      });
    } catch { reject(); }
  });
  return () => { closed=true; for (const {socket,upstream} of pending) { upstream?.terminate(); socket.destroy(); } pending.clear(); for (const { client, upstream } of sockets) { client.terminate(); upstream.terminate(); } wss.close(); };
}
