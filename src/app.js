const { app, server, io } = require('./config/server');
const { db, initializeDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const { setupGameSocket } = require('./socket/gameHandler');

// API 라우트 설정
app.use('/api', authRoutes);
app.use('/api', gameRoutes);

// 소켓 설정
setupGameSocket(io);

// 서버 시작
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`접속 방법: http://localhost:${PORT} (본인)`);
  console.log(`네트워크 접속 방법: http://<your-local-ip>:${PORT} (친구들)`);
}); 