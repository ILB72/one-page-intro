const express = require('express');
const router = express.Router();

// 등록용 challenge 생성 (카드 2 · C19~C20)
router.post('/register/challenge', (req, res) => {
  // TODO: @simplewebauthn/server의 generateRegistrationOptions 사용
  res.json({ message: 'register/challenge placeholder' });
});

// 등록 검증 + 공개키 저장 (카드 2 · C21~C24)
router.post('/register/verify', (req, res) => {
  // TODO: verifyRegistrationResponse 사용
  res.json({ message: 'register/verify placeholder' });
});

// 로그인용 challenge 생성 (카드 3 · C27~C28)
router.post('/login/challenge', (req, res) => {
  // TODO: generateAuthenticationOptions 사용
  res.json({ message: 'login/challenge placeholder' });
});

// 로그인 검증 + 세션 발급 (카드 3 · C29~C32)
router.post('/login/verify', (req, res) => {
  // TODO: verifyAuthenticationResponse 사용
  res.json({ message: 'login/verify placeholder' });
});

// 로그아웃 (카드 3 · C33)
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;