const dotenv = require('dotenv');
dotenv.config(); // .env 파일 로드

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

// 데이터베이스 초기화
initializeDatabase()
  .then(() => {
    console.log('데이터베이스가 초기화되었습니다.');
  })
  .catch(err => {
    console.error('데이터베이스 초기화 실패:', err);
  });

// 소켓 설정
setupGameSocket(io);
setupHorseRacingSocket(io);

// 필요한 함수와 객체 내보내기
module.exports = {
  app,
  server,
  io
}; 