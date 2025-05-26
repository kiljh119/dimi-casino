// .env 파일 로드
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const sessionMiddleware = require('../middlewares/sessionMiddleware');
const { authenticateJWT } = require('../middlewares/authMiddleware');
const authRoutes = require('../routes/authRoutes');
const gameRoutes = require('../routes/gameRoutes');
const { initializeDatabase } = require('./database');
const { setupGameSocket } = require('../socket/gameHandler');
const { setupHorseRacingSocket } = require('../socket/horseRacingHandler');

// Express 앱 생성
const app = express();
const server = http.createServer(app);

// Socket.IO 설정
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, 'https://*.vercel.app', 'https://casino-net.vercel.app'] 
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// 보안 미들웨어 설정
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "ws:", "wss:", "https://*.supabase.co", "https://*.vercel.app"]
    }
  },
  crossOriginEmbedderPolicy: false,
  xssFilter: true
}));

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(sessionMiddleware({
  secret: process.env.SESSION_SECRET || 'bacaraGameSessionKey2025',
  cookieName: 'bacarat.sid',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// API 라우트
app.use('/api', authRoutes);
app.use('/api', gameRoutes);

// 정적 파일 서빙 (index.html 제외)
app.use(express.static(path.join(__dirname, '../../public'), {
  index: false // index.html 자동 서빙 비활성화
}));

// 로그인 체크 미들웨어
const checkLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

// 로그인/회원가입 페이지는 로그인 체크 제외
app.get(['/login', '/register'], (req, res) => {
  if (req.session.userId) {
    return res.redirect('/menu');
  }
  res.sendFile(path.join(__dirname, '../../public', 'menu.html'));
});

// 보호된 라우트 - 로그인 필요
app.get(['/', '/index.html', '/menu', '/baccarat', '/horse-racing', '/ranking', '/admin', '/my-page', '/leaderboard', '/chat'], checkLogin, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'menu.html'));
});

// 404 처리 - 없는 파일은 404, 나머지는 menu.html로 리다이렉트
app.get('*', (req, res) => {
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|mp3|wav)$/)) {
    res.status(404).send('File not found');
  } else {
    res.redirect('/menu');
  }
});

// 에러 핸들링
app.use((err, req, res, next) => {
  console.error('서버 에러:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 데이터베이스 초기화 및 서버 시작
initializeDatabase()
  .then(() => {
    console.log('데이터베이스가 초기화되었습니다.');
    
    // 소켓 설정
    setupGameSocket(io);
    setupHorseRacingSocket(io);

    // 서버 시작 (로컬 개발 환경에서만)
    if (process.env.NODE_ENV !== 'production') {
      const PORT = process.env.PORT || 3000;
      server.listen(PORT, () => {
        console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`접속 방법: http://localhost:${PORT} (본인)`);
      });
    }
  })
  .catch(err => {
    console.error('데이터베이스 초기화 실패:', err);
  });

// Vercel 배포를 위해 app만 내보내기
module.exports = app; 