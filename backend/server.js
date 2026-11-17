require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const privateRoutes = require('./routes/private');

const app = express();

// ★ Render 프록시 신뢰 (세션 쿠키 전송을 위해 필수)
app.set('trust proxy', 1);

// CORS: 허용 출처만 (쉼표로 구분, ALLOWED_ORIGINS 미설정 시 기본값 사용)
const DEFAULT_ALLOWED_ORIGINS = 'https://ilb72.github.io,http://localhost:5500,http://127.0.0.1:5500';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(requestOrigin, callback) {
    // Origin 헤더가 없는 요청(서버 간 호출·헬스 체크 등)은 CORS 대상이 아님
    if (!requestOrigin) return callback(null, true);
    // 허용되지 않은 출처에는 CORS 헤더를 붙이지 않아 브라우저가 응답을 차단
    return callback(null, allowedOrigins.includes(requestOrigin));
  },
  credentials: true
}));

// 세션 비밀값: 프로덕션(NODE_ENV=production 또는 Render)에서는 필수
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    console.error('SESSION_SECRET 환경 변수가 설정되지 않았습니다. 서버를 시작하지 않습니다.');
    process.exit(1);
  }
  sessionSecret = require('crypto').randomBytes(32).toString('hex');
  console.warn('[경고] SESSION_SECRET이 없어 개발용 임시 랜덤값을 사용합니다. 재시작하면 세션이 모두 끊깁니다.');
}

app.use(express.json());
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,           // Render는 HTTPS
    sameSite: 'none',       // 크로스 사이트 쿠키 허용 (GitHub Pages ↔ Render)
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// 라우트 연결
app.use('/api', authRoutes);
app.use('/api', privateRoutes);

// 헬스 체크
app.get('/', (req, res) => res.send('Passkey backend running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));