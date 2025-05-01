const { app, server, io } = require('./config/server');
const { db, initializeDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const { setupGameSocket } = require('./socket/gameHandler');
const fs = require('fs');
const path = require('path');
const net = require('net');

// .env 파일이 없으면 생성
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.log('.env 파일이 없습니다. 기본 .env 파일을 생성합니다.');
  
  const defaultEnvContent = `# 서버 설정
PORT=3001

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

// 포트가 사용 가능한지 확인하는 함수
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port);
  });
}

// 서버 시작 함수
async function startServer(initialPort) {
  let port = initialPort;
  const maxPort = initialPort + 10; // 최대 10개의 다른 포트 시도
  
  while (port <= maxPort) {
    const available = await isPortAvailable(port);
    if (available) {
      server.listen(port, () => {
        console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
        console.log(`접속 방법: http://localhost:${port} (본인)`);
        console.log(`네트워크 접속 방법: http://<your-local-ip>:${port} (친구들)`);
      });
      return;
    }
    console.log(`포트 ${port}는 이미 사용 중입니다. 다음 포트 시도...`);
    port++;
  }
  
  console.error(`사용 가능한 포트를 찾을 수 없습니다. (${initialPort} ~ ${maxPort})`);
}

// 서버 시작
const PORT = parseInt(process.env.PORT || '3001');
startServer(PORT); 