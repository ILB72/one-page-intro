const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

// Supabase 클라이언트 (Secret key 사용)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// RP 설정
const rpName = '김민석 소개 페이지';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || 'http://localhost:3000';

// ===== 등록용 challenge 생성 (C19, C20) =====
router.post('/register/challenge', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  // 기존 사용자 조회
  const { data: user } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .maybeSingle();

  // 기존 패스키 조회 (excludeCredentials용)
  const excludeCredentials = [];
/*
  let excludeCredentials = [];
  if (user) {
    const { data: creds } = await supabase
      .from('credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    excludeCredentials = (creds || []).map(c => ({
      id: new Uint8Array(Buffer.from(c.credential_id, 'base64url')),
      type: 'public-key',
      transports: c.transports || []
    }));
  }
*/
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

  // challenge를 Supabase에 저장 (이전 것 삭제)
  await supabase.from('challenges').delete().eq('username', username);
  await supabase.from('challenges').insert({
    username,
    challenge: options.challenge
  });

  res.json(options);
});

// ===== 등록 검증 + 공개키 저장 (C21, C23) =====
router.post('/register/verify', async (req, res) => {
  const { username, credential, credentialName } = req.body;
  if (!username || !credential) {
    return res.status(400).json({ error: 'username and credential required' });
  }

  // Supabase에서 challenge 조회
  const { data: challengeRow } = await supabase
    .from('challenges')
    .select('challenge')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challengeRow) {
    return res.status(400).json({ error: 'No challenge found. Request challenge first.' });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

    // 사용자 찾기 또는 생성
    let { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (!user) {
      const { data: newUser } = await supabase
        .from('users')
        .insert({ username })
        .select('id')
        .single();
      user = newUser;
    }

    // 공개키 저장 (C21) — 비밀번호 아님 (C22)
    await supabase.from('credentials').insert({
      user_id: user.id,
      credential_id: Buffer.from(credentialID).toString('base64url'),
      public_key: Buffer.from(credentialPublicKey).toString('base64url'),
      counter,
      transports: credential.response.transports || [],
      name: credentialName || '내 패스키'
    });

    // 사용한 challenge 삭제
    await supabase.from('challenges').delete().eq('username', username);

    res.json({ verified: true, message: '패스키가 등록되었습니다.' });
  } catch (err) {
    console.error('Register verify error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ===== 로그인용 challenge (카드 3) =====
router.post('/login/challenge', async (req, res) => {
  const { username } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found' });

  const { data: creds } = await supabase
    .from('credentials')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: (creds || []).map(c => ({
      id: new Uint8Array(Buffer.from(c.credential_id, 'base64url')),
      type: 'public-key',
      transports: c.transports || []
    })),
    userVerification: 'preferred'
  });

  await supabase.from('challenges').delete().eq('username', username);
  await supabase.from('challenges').insert({
    username,
    challenge: options.challenge
  });

  res.json(options);
});

// ===== 로그인 검증 (카드 3) =====
router.post('/login/verify', async (req, res) => {
  const { username, credential } = req.body;

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found' });

  const { data: challengeRow } = await supabase
    .from('challenges')
    .select('challenge')
    .eq('username', username)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challengeRow) {
    return res.status(400).json({ error: 'No challenge found' });
  }

  const { data: cred } = await supabase
    .from('credentials')
    .select('*')
    .eq('user_id', user.id)
    .eq('credential_id', credential.id)
    .maybeSingle();

  if (!cred) return res.status(400).json({ error: 'Credential not found' });

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: new Uint8Array(Buffer.from(cred.credential_id, 'base64url')),
        credentialPublicKey: new Uint8Array(Buffer.from(cred.public_key, 'base64url')),
        counter: cred.counter
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    // counter 업데이트
    await supabase
      .from('credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', cred.id);

    // challenge 삭제
    await supabase.from('challenges').delete().eq('username', username);

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

// ===== 패스키 목록 조회 (C43) =====
router.get('/credentials', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', req.session.userId)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found' });

  const { data: creds } = await supabase
    .from('credentials')
    .select('id, name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  res.json({ credentials: creds || [] });
});

// ===== 패스키 삭제 (C44, C45, C46) =====
router.delete('/credentials/:id', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('username', req.session.userId)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'User not found' });

  // 남은 패스키 개수 확인 (C46)
  const { data: creds } = await supabase
    .from('credentials')
    .select('id')
    .eq('user_id', user.id);

  if (!creds || creds.length <= 1) {
    return res.status(400).json({ error: '마지막 패스키는 삭제할 수 없습니다. 먼저 새 패스키를 등록하세요.' });
  }

  await supabase
    .from('credentials')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', user.id);

  res.json({ ok: true });
});

module.exports = router;