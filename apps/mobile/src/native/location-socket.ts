import type { WsClientMessage, WsServerMessage } from "@walk-together/shared-types";

type Handlers = {
  onMessage: (message: WsServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

export type LocationSocket = {
  send: (message: WsClientMessage) => void;
  close: () => void;
};

export function connectLocationSocket(url: string, handlers: Handlers): LocationSocket {
  if (typeof WebSocket === "function" && typeof document !== "undefined") {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => handlers.onOpen?.());
    socket.addEventListener("close", () => handlers.onClose?.());
    socket.addEventListener("error", () => handlers.onError?.());
    socket.addEventListener("message", (event) => {
      const parsed = parseMessage(String(event.data));
      if (parsed) {
        handlers.onMessage(parsed);
      }
    });
    return {
      send(message) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      },
      close() {
        socket.close();
      },
    };
  }

  const task = uni.connectSocket({
    url,
    complete: () => undefined,
  });
  task.onOpen(() => handlers.onOpen?.());
  task.onClose(() => handlers.onClose?.());
  task.onError(() => handlers.onError?.());
  task.onMessage((event) => {
    const parsed = parseMessage(String(event.data));
    if (parsed) {
      handlers.onMessage(parsed);
    }
  });
  return {
    send(message) {
      task.send({ data: JSON.stringify(message) });
    },
    close() {
      task.close({});
    },
  };
}

function parseMessage(raw: string): WsServerMessage | null {
  try {
    return JSON.parse(raw) as WsServerMessage;
  } catch {
    return null;
  }
}
