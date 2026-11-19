/**
 * LIFF Hook — 管理 LINE LIFF 初始化與使用者狀態
 */
import { useState, useEffect, useCallback } from 'react';
import liff from '@line/liff';
import { setAccessToken, fetchUserInfo } from '../api';

const LIFF_ID = import.meta.env.VITE_LIFF_ID;

export function useLiff() {
  const [liffReady, setLiffReady] = useState(false);
  const [liffError, setLiffError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await liff.getProfile();
      const token = liff.getAccessToken();

      setAccessToken(token);
      setUserProfile({
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      });
      setIsLoggedIn(true);

      // 向後端驗證並取得使用者資訊（含是否為管理者）
      try {
        const userInfo = await fetchUserInfo();
        setIsAdmin(userInfo.isAdmin);
      } catch (e) {
        console.warn('[LIFF] 後端驗證失敗:', e);
      }
    } catch (err) {
      console.error('[LIFF] 取得 profile 失敗:', err);
      setLiffError(err.message);
    }
  }, []);

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffReady(true);

        if (liff.isLoggedIn()) {
          // 已登入，直接載入 profile
          await loadProfile();
        } else if (liff.isInClient()) {
          // 在 LINE app 內部，自動觸發登入
          // liff.login() 會 redirect，回來後頁面重新載入，isLoggedIn 會是 true
          liff.login();
        }
        // 外部瀏覽器且未登入 → 等使用者點登入按鈕
      } catch (err) {
        console.error('[LIFF] 初始化失敗:', err);
        setLiffError(err.message);
      }
    };

    initLiff();
  }, [loadProfile]);

  const login = useCallback(() => {
    if (liffReady && !isLoggedIn) {
      // liff.login() 會 redirect 到 LINE 授權頁，回來後頁面重新載入
      liff.login();
    }
  }, [liffReady, isLoggedIn]);

  const logout = useCallback(() => {
    if (liffReady) {
      liff.logout();
      setUserProfile(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
      setAccessToken(null);
      window.location.reload();
    }
  }, [liffReady]);

  /**
   * 透過 liff.sendMessages() 發送訊息到使用者當前的聊天室
   * 仅在 LIFF 內部（LINE app）可用；外部瀏覽器會跳轉到 LINE
   * @param {object|array} messages - LINE message object 或陣列
   * @returns {Promise<boolean>} 是否成功
   */
  const sendMessages = useCallback(async (messages) => {
    if (!liffReady) {
      console.warn('[LIFF] 尚未初始化，無法 sendMessages');
      return false;
    }
    try {
      const msgs = Array.isArray(messages) ? messages : [messages];
      await liff.sendMessages(msgs);
      console.log('[LIFF] sendMessages 成功');
      return true;
    } catch (err) {
      console.error('[LIFF] sendMessages 失敗:', err);
      return false;
    }
  }, [liffReady]);

  return {
    liffReady,
    liffError,
    userProfile,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    reloadProfile: loadProfile,
    sendMessages,
  };
}
