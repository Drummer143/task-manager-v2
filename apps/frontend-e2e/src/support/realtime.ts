import type { Page, WebSocketRoute } from '@playwright/test';
import { SOCKET_ORIGIN } from './env';

/** A Phoenix message (serializer v2): `[join_ref, ref, topic, event, payload]`. */
type PhoenixMessage = [string | null, string | null, string, string, unknown];

interface Connection {
  ws: WebSocketRoute;
  /** The `token` the socket connected with. */
  token: string | null;
  /** Topics joined so far. */
  joined: Set<string>;
  joinRefs: Map<string, string | null>;
}

/**
 * socket-service: accepts every connection, answers heartbeats and joins with ok, and lets a
 * test push events into joined channels.
 */
export async function fakeRealtime(page: Page) {
  const connections: Connection[] = [];
  const socketUrl = new URL('/socket/websocket', SOCKET_ORIGIN.replace(/^http/, 'ws'));

  await page.routeWebSocket(
    (url) => url.host === socketUrl.host && url.pathname === socketUrl.pathname,
    (ws) => {
      const connection: Connection = {
        ws,
        token: new URL(ws.url()).searchParams.get('token'),
        joined: new Set(),
        joinRefs: new Map(),
      };
      connections.push(connection);

      ws.onMessage((raw) => {
        const [joinRef, ref, topic, event] = JSON.parse(String(raw)) as PhoenixMessage;
        const reply = (response: unknown = {}) =>
          ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));

        if (event === 'phx_join') {
          connection.joined.add(topic);
          connection.joinRefs.set(topic, joinRef);
          reply();
        } else if (event === 'phx_leave') {
          connection.joined.delete(topic);
          reply();
        } else if (event === 'heartbeat') {
          reply();
        }
      });
    },
  );

  return {
    connections,
    /** Sends `event` to every connection that joined `topic`. */
    push(topic: string, event: string, payload: unknown) {
      for (const { ws, joined, joinRefs } of connections) {
        if (joined.has(topic)) ws.send(JSON.stringify([joinRefs.get(topic) ?? null, null, topic, event, payload]));
      }
    },
  };
}

export type FakeRealtime = Awaited<ReturnType<typeof fakeRealtime>>;
