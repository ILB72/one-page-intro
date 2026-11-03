const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const DB_PATH = path.join(__dirname, '../data/db.json');

// DB 읽기/쓰기 (폴더 자동 생성 포함)
function readDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], challenges: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// RP 설정
const rpName = '김민석 소개 페이지';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:3000';

// ===== 등록용 challenge 생성 (C19, C20) =====
router.post('/register/challenge', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const db = readDB();
  const user = db.users.find(u => u.username === username);

  // 이미 등록된 패스키의 id를 Uint8Array로 변환 (에러 해결 핵심)
  const excludeCredentials = user
    ? user.credentials.map(c => ({
        id: new Uint8Array(Buffer.from(c.id, 'base64url')),
        type: 'public-key',
        transports: c.transports || []
      }))
    : [];

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: username,
    userName: username,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'
    }
  });

  // challenge를 서버에 저장 (C19)
  db.challenges[username] = options.challenge;
  writeDB(db);

  res.json(options);
});

// ===== 등록 검증 + 공개키 저장 (C21, C23) =====
router.post('/register/verify', async (req, res) => {
  const { username, credential, credentialName } = req.body;
  if (!username || !credential) {
    return res.status(400).json({ error: 'username and credential required' });
  }

  const db = readDB();
  const expectedChallenge = db.challenges[username];
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No challenge found. Request challenge first.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    let user = db.users.find(u => u.username === username);
    if (!user) {
      user = { username, credentials: [] };
      db.users.push(user);
    }

    // 공개키 저장 (C21) — 비밀번호 아님 (C22)
    user.credentials.push({
      id: Buffer.from(credentialID).toString('base64url'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      transports: credential.response.transports || [],
      name: credentialName || '내 패스키',
      createdAt: new Date().toISOString()
    });

    delete db.challenges[username];
    writeDB(db);

    res.json({ verified: true, message: '패스키가 등록되었습니다.' });
  } catch (err) {
    console.error('Register verify error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ===== 로그인용 challenge (카드 3) =====
router.post('/login/challenge', async (req, res) => {
  const { username } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: user.credentials.map(c => ({
      id: new Uint8Array(Buffer.from(c.id, 'base64url')),
      type: 'public-key',
      transports: c.transports || []
    })),
    userVerification: 'preferred'
  });

  db.challenges[username] = options.challenge;
  writeDB(db);

  res.json(options);
});

// ===== 로그인 검증 (카드 3) =====
router.post('/login/verify', async (req, res) => {
  const { username, credential } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const expectedChallenge = db.challenges[username];
  if (!expectedChallenge) {
    return res.status(400).json({ error: 'No challenge found' });
  }

  const cred = user.credentials.find(c => c.id === credential.id);
  if (!cred) return res.status(400).json({ error: 'Credential not found' });

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: new Uint8Array(Buffer.from(cred.id, 'base64url')),
        credentialPublicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
        counter: cred.counter
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    cred.counter = verification.authenticationInfo.newCounter;
    delete db.challenges[username];
    writeDB(db);

    req.session.userId = username;
    res.json({ verified: true, message: '로그인 성공' });
  } catch (err) {
    console.error('Login verify error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ===== 로그아웃 =====
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;