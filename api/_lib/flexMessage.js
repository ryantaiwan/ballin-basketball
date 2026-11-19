/**
 * LINE Flex Message 卡片產生器
 *
 * 產生 carousel（橫向滑動卡片）格式的球局通知：
 *   1. 橘色卡 — 球局資訊 + 報名按鈕
 *   2. 綠色卡 — 正選名單
 *   3. 灰色卡 — 候補名單
 */

// === 主題色 ===
const COLOR_PRIMARY = '#f26522';   // 橘：球局資訊卡
const COLOR_SUCCESS = '#1aad19';   // 綠：正選名單卡
const COLOR_WAIT = '#8a8a8a';      // 灰：候補名單卡
const COLOR_TEXT = '#1a1a1a';
const COLOR_SUBTEXT = '#555555';
const COLOR_LINE = '#e8e8e8';

// 名單最大顯示筆數（避免訊息過長；超過則顯示「…等 N 人」）
const MAX_ROSTER_ROWS = 12;

/**
 * 格式化日期：2026-11-22 → 11/22 (週日)
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  return `${mo}/${d} (${weekdays[date.getDay()]})`;
}

/**
 * 格式化時間區間：18:00 - 20:00
 */
function formatTimeRange(startTime, endTime) {
  if (!startTime) return '';
  return endTime ? `${startTime} - ${endTime}` : startTime;
}

/**
 * 產生 icon + 文字的橫列（用 emoji 文字實作，避開 icon 元件的 PNG 限制）
 */
function infoRow(emoji, label, value, valueColor = COLOR_TEXT) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'xs',
    contents: [
      {
        type: 'text',
        text: emoji,
        size: 'sm',
        flex: 0,
      },
      {
        type: 'text',
        text: label,
        size: 'sm',
        color: COLOR_SUBTEXT,
        flex: 0,
        margin: 'md',
      },
      {
        type: 'text',
        text: String(value),
        size: 'sm',
        color: valueColor,
        weight: 'bold',
        flex: 3,
        wrap: true,
      },
    ],
  };
}

/**
 * 建立第 1 張卡：球局資訊
 */
function buildGameInfoBubble(game, opts = {}) {
  const {
    gameUrl = '',
    statusLabel = '開放報名',
    statusColor = COLOR_SUCCESS,
    priceText = '',
    guestPriceText = '',
    extraNote = '',
    showRegisterButton = true,
  } = opts;

  const regCount = Number(game.registeredCount || 0);
  const maxPlayers = Number(game.maxPlayers || 0);
  const waitCount = Number(game.waitlistCount || 0);

  const bodyContents = [
    // 球局標題
    {
      type: 'text',
      text: game.title || '球局',
      size: 'lg',
      weight: 'bold',
      color: COLOR_TEXT,
      wrap: true,
    },
    { type: 'separator', margin: 'md' },
    infoRow('📅', '日期', formatDate(game.gameDate)),
    infoRow('⏰', '時間', formatTimeRange(game.gameTime, game.endTime)),
    infoRow('📍', '地點', game.location || ''),
  ];

  if (priceText) {
    bodyContents.push(infoRow('💰', '費用', priceText));
  }
  if (guestPriceText) {
    bodyContents.push(infoRow('🆕', '臨打', guestPriceText, COLOR_PRIMARY));
  }

  // 報名人數
  bodyContents.push({ type: 'separator', margin: 'md' });
  bodyContents.push({
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    contents: [
      {
        type: 'text',
        text: '👥 正選',
        size: 'sm',
        weight: 'bold',
        color: '#2b2b6b',
        flex: 0,
      },
      {
        type: 'text',
        text: `${regCount} / ${maxPlayers}`,
        size: 'sm',
        weight: 'bold',
        color: COLOR_TEXT,
        flex: 0,
        margin: 'sm',
      },
      {
        type: 'text',
        text: `　尚有 ${Math.max(maxPlayers - regCount, 0)} 個正選名額`,
        size: 'sm',
        color: COLOR_SUCCESS,
        flex: 2,
        wrap: true,
      },
    ],
  });

  if (waitCount > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'xs',
      contents: [
        {
          type: 'text',
          text: '⏳ 候補',
          size: 'sm',
          color: COLOR_SUBTEXT,
          flex: 0,
        },
        {
          type: 'text',
          text: `${waitCount} 人`,
          size: 'sm',
          color: COLOR_TEXT,
          weight: 'bold',
          flex: 0,
          margin: 'sm',
        },
      ],
    });
  }

  if (game.minPlayers > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'xs',
      contents: [
        {
          type: 'text',
          text: '⚠️ 最少',
          size: 'sm',
          color: COLOR_SUBTEXT,
          flex: 0,
        },
        {
          type: 'text',
          text: `${game.minPlayers} 人開打`,
          size: 'sm',
          color: COLOR_PRIMARY,
          weight: 'bold',
          flex: 2,
          wrap: true,
        },
      ],
    });
  }

  if (extraNote) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push({
      type: 'text',
      text: extraNote,
      size: 'xs',
      color: COLOR_SUBTEXT,
      wrap: true,
    });
  }

  // footer — 報名按鈕
  let footer = null;
  if (showRegisterButton && gameUrl) {
    footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          height: 'md',
          action: {
            type: 'uri',
            label: '🆕 立即報名',
            uri: gameUrl,
          },
        },
      ],
    };
  }

  return {
    type: 'bubble',
    size: 'kilo',
    styles: {
      header: { backgroundColor: COLOR_PRIMARY },
      body: { backgroundColor: '#ffffff' },
      footer: footer ? { backgroundColor: '#ffffff' } : undefined,
    },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `${statusLabel}`,
          size: 'lg',
          weight: 'bold',
          color: '#ffffff',
          wrap: true,
        },
        {
          type: 'text',
          text: `${regCount} / ${maxPlayers} 人`,
          size: 'xs',
          color: '#ffe9df',
          weight: 'bold',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: bodyContents,
    },
    footer: footer || undefined,
  };
}

/**
 * 建立名單卡（正選 / 候補）
 */
function buildRosterBubble(title, subtitle, items, color, emptyText) {
  const contents = [];

  if (!items || items.length === 0) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      contents: [
        {
          type: 'text',
          text: emptyText || '目前沒有人',
          size: 'sm',
          color: COLOR_SUBTEXT,
          align: 'center',
        },
      ],
    });
  } else {
    const shown = items.slice(0, MAX_ROSTER_ROWS);
    shown.forEach((item, idx) => {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          {
            type: 'text',
            text: String(idx + 1).padStart(2, '0'),
            size: 'sm',
            color: COLOR_SUBTEXT,
            flex: 0,
          },
          {
            type: 'text',
            text: item.displayName,
            size: 'sm',
            color: COLOR_TEXT,
            weight: 'bold',
            flex: 2,
            wrap: true,
          },
        ],
      });
    });

    if (items.length > shown.length) {
      contents.push({
        type: 'box',
        layout: 'horizontal',
        margin: 'xs',
        contents: [
          {
            type: 'text',
            text: `…等共 ${items.length} 人`,
            size: 'xs',
            color: COLOR_SUBTEXT,
            flex: 0,
          },
        ],
      });
    }
  }

  return {
    type: 'bubble',
    size: 'kilo',
    styles: {
      header: { backgroundColor: color },
      body: { backgroundColor: '#ffffff' },
    },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: title,
          size: 'lg',
          weight: 'bold',
          color: '#ffffff',
        },
        {
          type: 'text',
          text: subtitle,
          size: 'xs',
          color: '#ffffff',
          weight: 'bold',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents,
    },
  };
}

/**
 * 組裝完整的 carousel 卡片
 *
 * @param {object} game - 球局資料（已轉為 camelCase）
 * @param {object} opts
 * @returns {object} Flex Message message object
 */
function buildGameCarouselMessage(game, opts = {}) {
  const {
    registrations = [],
    waitlist = [],
    gameUrl = '',
    statusLabel = '開放報名',
    showRegisterButton = true,
    altText = null,
    includeWaitlistCard = true,
  } = opts;

  const priceText = Number(game.price) > 0 ? `NT$ ${game.price}` : '免費';
  const guestPriceText =
    Number(game.guestPrice) > 0 ? `NT$ ${game.guestPrice}` : '';

  const bubbles = [
    buildGameInfoBubble(
      { ...game, registeredCount: registrations.length, waitlistCount: waitlist.length },
      {
        gameUrl,
        statusLabel,
        priceText,
        guestPriceText,
        showRegisterButton,
        extraNote: game.notes ? String(game.notes).substring(0, 100) : '',
      }
    ),
    buildRosterBubble(
      '✅ 正選名單',
      `共 ${registrations.length} 人`,
      registrations,
      COLOR_SUCCESS,
      '還沒有人報名，快搶第一個名額！'
    ),
  ];

  if (includeWaitlistCard) {
    bubbles.push(
      buildRosterBubble(
        '⏳ 候補名單',
        waitlist.length > 0 ? `共 ${waitlist.length} 人` : '目前沒有候補',
        waitlist,
        COLOR_WAIT,
        '目前沒有候補者'
      )
    );
  }

  return {
    type: 'flex',
    altText:
      altText ||
      `${game.title || '球局'} ${formatDate(game.gameDate)} ${formatTimeRange(game.gameTime, game.endTime)} ${game.location || ''}`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 產生取消球局的 Flex Message（單一 bubble）
 */
function buildCancelMessage(game) {
  return {
    type: 'flex',
    altText: `【球局取消通知】${game.title || '球局'}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        header: { backgroundColor: '#d93025' },
        body: { backgroundColor: '#ffffff' },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '⚠️ 球局取消通知',
            size: 'lg',
            weight: 'bold',
            color: '#ffffff',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: game.title || '球局',
            size: 'lg',
            weight: 'bold',
            color: COLOR_TEXT,
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          infoRow('📅', '日期', formatDate(game.gameDate)),
          infoRow('⏰', '時間', formatTimeRange(game.gameTime, game.endTime)),
          infoRow('📍', '地點', game.location || ''),
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: '如有疑問請聯繫管理員。',
            size: 'sm',
            color: COLOR_SUBTEXT,
            wrap: true,
          },
        ],
      },
    },
  };
}

/**
 * 產生候選遞補成功的 Flex Message
 */
function buildPromoteMessage(game, promotedName, leaverName) {
  return {
    type: 'flex',
    altText: '【自動遞補通知】恭喜您已遞補進入球局',
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: {
        header: { backgroundColor: COLOR_SUCCESS },
        body: { backgroundColor: '#ffffff' },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎉 自動遞補成功',
            size: 'lg',
            weight: 'bold',
            color: '#ffffff',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: game.title || '球局',
            size: 'lg',
            weight: 'bold',
            color: COLOR_TEXT,
            wrap: true,
          },
          { type: 'separator', margin: 'md' },
          infoRow('📅', '日期', formatDate(game.gameDate)),
          infoRow('⏰', '時間', formatTimeRange(game.gameTime, game.endTime)),
          infoRow('📍', '地點', game.location || ''),
          { type: 'separator', margin: 'md' },
          {
            type: 'text',
            text: `因「${leaverName}」退出，您已由候補轉為正式報名。`,
            size: 'sm',
            color: COLOR_TEXT,
            wrap: true,
          },
        ],
      },
    },
  };
}

/**
 * 產生提醒用的單張球局資訊卡（無報名按鈕）
 */
function buildReminderMessage(game, opts = {}) {
  const { statusLabel = '球局提醒', extraNote = '' } = opts;

  const priceText = Number(game.price) > 0 ? `NT$ ${game.price}` : '免費';

  return {
    type: 'flex',
    altText: `${statusLabel} ${game.title || '球局'}`,
    contents: buildGameInfoBubble(game, {
      statusLabel,
      priceText,
      guestPriceText: Number(game.guestPrice) > 0 ? `NT$ ${game.guestPrice}` : '',
      showRegisterButton: false,
      extraNote,
    }),
  };
}

module.exports = {
  buildGameCarouselMessage,
  buildCancelMessage,
  buildPromoteMessage,
  buildReminderMessage,
  buildGameInfoBubble,
  buildRosterBubble,
  formatDate,
  formatTimeRange,
};
