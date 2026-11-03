require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const privateRoutes = require('./routes/private');

const app = express();

// ★ Render 프록시 신뢰 (세션 쿠키 전송을 위해 필수)
app.set('trust proxy', 1);

// CORS: 모든 origin 허용 (디버그용)
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
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