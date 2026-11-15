/**
 * API 客戶端 — 與後端通訊
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 15000,
});

/**
 * 設定授權 header
 */
let _accessToken = null;
export function setAccessToken(token) {
  _accessToken = token;
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
}

// ===== 球局 API =====

export async function fetchGames() {
  const { data } = await api.get('/games');
  return data;
}

export async function fetchGameDetail(gameId) {
  const { data } = await api.get(`/games/${gameId}`);
  return data;
}

export async function createGame(gameData) {
  const { data } = await api.post('/games', gameData);
  return data;
}

export async function updateGame(gameId, gameData) {
  const { data } = await api.put(`/games/${gameId}`, gameData);
  return data;
}

export async function deleteGame(gameId) {
  const { data } = await api.delete(`/games/${gameId}`);
  return data;
}

// ===== 報名 API =====

export async function registerGame(gameId, displayName) {
  const { data } = await api.post(`/registrations/${gameId}/register`, { displayName });
  return data;
}

export async function leaveGame(gameId, targetUserId) {
  const { data } = await api.post(`/registrations/${gameId}/leave`, { targetUserId });
  return data;
}

export async function updateName(gameId, displayName) {
  const { data } = await api.put(`/registrations/${gameId}/name`, { displayName });
  return data;
}

export async function fetchMyRegistrations() {
  const { data } = await api.get('/registrations/me');
  return data;
}

// ===== 使用者 API =====

export async function fetchUserInfo() {
  const { data } = await api.get('/user/me');
  return data;
}
