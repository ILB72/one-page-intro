const express = require('express');
const router = express.Router();

// 비공개 자료 조회 — 로그인 필요 (카드 1 · C16~C17)
router.get('/private', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 로그인 후 3개 항목 반환
  res.json({
    items: [
      {
        title: '써보고 싶은 AI 도구/모델',
        content: 'Claude Code, GPT-6-Astra, Claude Opus 5.5, GPT-6.1 Sol'
      },
      {
        title: '보고 싶은 소설',
        content: '악마와 함께 춤을, 장미와 나이프, 가공범, 용의자 시리즈'
      },
      {
        title: '해보고 싶은/해볼 게임',
        content: '실버펠리스, 아주르프로말리아, GTA6'
      }
    ]
  });
});

module.exports = router;