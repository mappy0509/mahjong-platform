import * as SecureStore from "expo-secure-store";
import { config } from "../config";

const API_URL = config.apiUrl;

let accessToken: string | null = null;

export async function initAuth(): Promise<boolean> {
  accessToken = await SecureStore.getItemAsync("accessToken");
  return !!accessToken;
}

export function getToken(): string | null {
  return accessToken;
}

export async function setTokens(access: string, refresh: string) {
  accessToken = access;
  await SecureStore.setItemAsync("accessToken", access);
  await SecureStore.setItemAsync("refreshToken", refresh);
}

export async function clearTokens() {
  accessToken = null;
  await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = await SecureStore.getItemAsync("refreshToken");
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ===== Auth API =====

export async function register(
  username: string,
  password: string,
  displayName: string
) {
  const data = await apiRequest<any>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, displayName }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function login(username: string, password: string) {
  const data = await apiRequest<any>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  await setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  await clearTokens();
}

// ===== Game Stats & History API =====

export interface PlayerStats {
  totalGames: number;
  wins: number;
  placements: number[];
  avgScore: number;
  winRate: number;
  currentBalance: number;
}

export interface GameHistoryItem {
  roomId: string;
  roomName: string;
  finishedAt: string;
  players: { userId: string; displayName: string; seat: number }[];
  finalScores: Record<string, number> | null;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalScore: number;
  games: number;
  wins: number;
}

export function getPlayerStats(clubId: string) {
  return apiRequest<PlayerStats>(`/games/clubs/${clubId}/stats`);
}

export function getGameHistory(clubId: string, limit = 20, offset = 0) {
  return apiRequest<GameHistoryItem[]>(
    `/games/clubs/${clubId}/history?limit=${limit}&offset=${offset}`,
  );
}

export function getClubLeaderboard(clubId: string, limit = 20) {
  return apiRequest<LeaderboardEntry[]>(
    `/games/clubs/${clubId}/leaderboard?limit=${limit}`,
  );
}

// ===== Game Replay API =====

export interface GameEventLogEntry {
  sequence: number;
  eventType: string;
  payload: any;
  createdAt: string;
}

export interface GameReplayData {
  roomId: string;
  rules: any;
  players: { userId: string; seat: number }[];
  events: GameEventLogEntry[];
}

export function getGameReplay(roomId: string) {
  return apiRequest<GameReplayData>(`/games/rooms/${roomId}/events`);
}

// ===== Profile API =====

export function updateProfile(displayName: string) {
  return apiRequest<{ id: string; username: string; displayName: string }>(
    "/users/me",
    { method: "PATCH", body: JSON.stringify({ displayName }) },
  );
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ message: string }>("/users/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
