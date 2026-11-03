const express = require('express');
const router = express.Router();

// 계정별 비공개 자료 (T08-C36: 각각 다른 비공개 내용)
const dataByUser = {
  kms: [
    { title: '써보고 싶은 AI 도구/모델', content: 'Claude Code, GPT-6-Astra, Claude Opus 5.5, GPT-6.1 Sol' },
    { title: '보고 싶은 소설', content: '악마와 함께 춤을, 장미와 나이프, 가공범, 용의자 시리즈' },
    { title: '해보고 싶은/해볼 게임', content: '실버펠리스, 아주르프로말리아, GTA6' }
  ],
  kms2: [
    { title: 'kms2의 비밀 메모', content: '이 메모는 kms2만 볼 수 있습니다.' },
    { title: 'kms2의 학습 계획', content: '이번 주: WebAuthn 흐름 복습, 다음 주: 세션 관리 정리' },
    { title: 'kms2의 관심사', content: '네트워크 보안, 접근성, 문서화' }
  ]
};

// 비공개 자료 조회 — 로그인 필요 (C15, C16, C17)
router.get('/private', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // 본인 자료만 반환 (C40: 다른 계정 적어 보내도 내 자료만)
  const items = dataByUser[req.session.userId] || [];
  res.json({ items });
});

module.exports = router;