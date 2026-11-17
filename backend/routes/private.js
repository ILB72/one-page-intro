const express = require('express');
const router = express.Router();

// 계정별 비공개 자료 (T08-C36: 각각 다른 비공개 내용)
// 비공개 내용과 계정 식별자는 공개 소스에 두지 않고 환경 변수 PRIVATE_ITEMS_JSON에서 읽는다.
// 형식: {"<사용자이름>": [{"title": "...", "content": "..."}, ...], ...}
const PLACEHOLDER_ITEMS = [
  { title: '안내', content: '서버에 비공개 항목이 설정되지 않았습니다' }
];

function loadPrivateItems() {
  const raw = process.env.PRIVATE_ITEMS_JSON;
  if (!raw) {
    console.warn('[private] PRIVATE_ITEMS_JSON이 설정되지 않아 자리표시 문구를 반환합니다.');
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    const result = {};
    for (const [user, items] of Object.entries(parsed)) {
      if (!Array.isArray(items)) throw new Error('shape');
      result[user] = items.map(item => ({
        title: String(item && item.title != null ? item.title : ''),
        content: String(item && item.content != null ? item.content : '')
      }));
    }
    return result;
  } catch (e) {
    // 값 일부가 로그에 남지 않도록 내용은 출력하지 않는다.
    console.error('[private] PRIVATE_ITEMS_JSON 형식이 올바르지 않아 자리표시 문구를 반환합니다.');
    return null;
  }
}

const dataByUser = loadPrivateItems();

// 비공개 자료 조회 — 로그인 필요 (C15, C16, C17)
router.get('/private', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!dataByUser) {
    return res.json({ items: PLACEHOLDER_ITEMS });
  }

  // 본인 자료만 반환 (C40: 다른 계정 적어 보내도 내 자료만)
  const items = Object.prototype.hasOwnProperty.call(dataByUser, req.session.userId)
    ? dataByUser[req.session.userId]
    : [];
  res.json({ items });
});

module.exports = router;
