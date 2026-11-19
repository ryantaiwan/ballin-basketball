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

export async function fetchGames(includeAll = false) {
  const { data } = await api.get('/games', { params: includeAll ? { includeAll: 'true' } : {} });
  return data;
}

export async function fetchGameDetail(gameId) {
  const { data } = await api.get(`/games/${gameId}`);
  return data;
}

/**
 * 取得球局的 Flex Message JSON（供 liff.sendMessages 使用）
 */
export async function fetchGameFlex(gameId) {
  const { data } = await api.get(`/games/${gameId}`, { params: { flex: 'true' } });
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

/**
 * 手動發佈排程中球局（管理者）
 */
export async function publishGame(gameId) {
  const { data } = await api.post(`/games/${gameId}`, null, { params: { publish: 'true' } });
  return data;
}

// ===== 報名 API =====

export async function registerGame(gameId, displayName) {
  const { data } = await api.post(`/registrations/${gameId}/register`, { displayName });
  return data;
}

export async function leaveGame(gameId, targetUserId, targetDisplayName) {
  const { data } = await api.post(`/registrations/${gameId}/leave`, { targetUserId, targetDisplayName });
  return data;
}

/**
 * 臨打代報（需有報名的人，球局發佈後24h）
 */
export async function guestRegister(gameId, guestName) {
  const { data } = await api.post(`/registrations/${gameId}/guest-register`, { guestName });
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

// ===== 付款方式 API（本人選擇/修改） =====

export async function updatePaymentMethod(gameId, paymentMethod) {
  const { data } = await api.put(`/registrations/${gameId}/payment`, { paymentMethod });
  return data;
}

// ===== 收款管理 API（管理者） =====

export async function markPaid(gameId, targetUserId, paid, targetDisplayName) {
  const { data } = await api.post(`/registrations/${gameId}/mark-paid`, { targetUserId, paid, targetDisplayName });
  return data;
}

// ===== 付款方式維護 API（管理者 CRUD） =====

export async function fetchPaymentOptions() {
  const { data } = await api.get('/payment-options');
  return data;
}

export async function createPaymentOption(name, displayOrder) {
  const { data } = await api.post('/payment-options', { name, displayOrder });
  return data;
}

export async function updatePaymentOption(id, updates) {
  const { data } = await api.put(`/payment-options/${id}`, updates);
  return data;
}

export async function deletePaymentOption(id) {
  const { data } = await api.delete(`/payment-options/${id}`);
  return data;
}

// ===== 使用者 API =====

export async function fetchUserInfo() {
  const { data } = await api.get('/user/me');
  return data;
}
