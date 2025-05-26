const dotenv = require('dotenv');
dotenv.config(); // .env 파일 로드

const path = require('path');
const express = require('express');
const { app, server, io } = require('./config/server');
const { initializeDatabase } = require('./config/database');
const { setupGameSocket } = require('./socket/gameHandler');
const { setupHorseRacingSocket } = require('./socket/horseRacingHandler');

// 환경 변수 확인 및 기본값 설정
if (!process.env.SESSION_SECRET) {
  console.warn('경고: SESSION_SECRET이 설정되지 않았습니다. 기본값을 사용합니다.');
  process.env.SESSION_SECRET = 'bacaraGameSessionKey2025';
}

if (!process.env.JWT_SECRET) {
  console.warn('경고: JWT_SECRET이 설정되지 않았습니다. 기본값을 사용합니다.');
  process.env.JWT_SECRET = 'bacaraGameSecretKey2025';
}

// Supabase 연결 정보 확인
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('오류: SUPABASE_URL 또는 SUPABASE_ANON_KEY가 설정되지 않았습니다.');
  console.error('Supabase 연결이 실패할 수 있습니다.');
}

// 정적 파일 서빙 설정
app.use(express.static(path.join(__dirname, '../public')));

// 기본 라우트 설정
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 데이터베이스 초기화 및 서버 시작
async function startServer() {
  try {
    await initializeDatabase();
    console.log('데이터베이스가 초기화되었습니다.');

    // 소켓 설정
    setupGameSocket(io);
    setupHorseRacingSocket(io);

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    });
  } catch (err) {
    console.error('서버 시작 실패:', err);
    process.exit(1);
  }
}

startServer();

// 필요한 함수와 객체 내보내기
module.exports = {
  app,
  server,
  io
}; 