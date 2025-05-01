const { app, server, io } = require('./config/server');
const { db, initializeDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const { setupGameSocket } = require('./socket/gameHandler');
const fs = require('fs');
const path = require('path');

// .env 파일이 없으면 생성
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.log('.env 파일이 없습니다. 기본 .env 파일을 생성합니다.');
  
  const defaultEnvContent = `# 서버 설정
PORT=3000

# JWT 비밀키
JWT_SECRET=bacaraGameSecretKey2025

# 세션 비밀키
SESSION_SECRET=bacaraGameSessionKey2025

# 데이터베이스 설정
DB_PATH=./database.sqlite
`;
  try {
    fs.writeFileSync(envPath, defaultEnvContent);
    console.log('.env 파일이 성공적으로 생성되었습니다.');
    
    // 환경 변수 다시 로드
    require('dotenv').config();
  } catch (err) {
    console.error('.env 파일 생성 중 오류 발생:', err);
  }
}

// API 라우트 설정
app.use('/api', authRoutes);
app.use('/api', gameRoutes);

// 소켓 설정
setupGameSocket(io);

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`접속 방법: http://localhost:${PORT} (본인)`);
  console.log(`네트워크 접속 방법: http://<your-local-ip>:${PORT} (친구들)`);
}); 