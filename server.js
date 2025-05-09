// .env 파일을 로드하여 환경 변수 설정
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const { server } = require('./src/config/server');
const authRoutes = require('./src/routes/authRoutes');
const gameRoutes = require('./src/routes/gameRoutes');

// API 라우트 설정
app.use('/api', authRoutes);
app.use('/api', gameRoutes);

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 추가 라우트 설정 - 기존 페이지 지원
const pages = ['menu', 'baccarat', 'horse-racing', 'ranking', 'admin', 'my-page', 'leaderboard', 'chat', 'login', 'register'];

pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
  });
});

// 루트 라우트 및 다른 모든 경로를 index.html로 라우팅
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

// 404 처리 - 없는 페이지는 메뉴로 리다이렉트
app.get('*', (req, res) => {
  // 정적 파일을 요청하는 경우 제외
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|mp3|wav)$/)) {
    res.status(404).send('File not found');
  } else {
    res.redirect('/menu');
  }
});

// 서버 포트 설정 (환경 변수 또는 기본값 3000)
const PORT = process.env.PORT || 3000;

// Vercel 배포를 위한 조건부 서버 시작
if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`접속 방법: http://localhost:${PORT} (본인)`);
  });
}

module.exports = app;