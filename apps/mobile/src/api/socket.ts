import { io, Socket } from "socket.io-client";
import { getToken } from "./client";
import { config } from "../config";

const SOCKET_URL = config.socketUrl;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/game`, {
      auth: { token: getToken() },
      transports: ["websocket"],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    // Update token before connecting
    s.auth = { token: getToken() };
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
