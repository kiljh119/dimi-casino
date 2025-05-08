const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');

// Express 앱 생성
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// 보안 미들웨어 설정 - 외부 리소스 허용
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "ws:", "wss:", "https://*.supabase.co"] // Supabase 연결 허용
    }
  },
  crossOriginEmbedderPolicy: false, // 외부 리소스 임베딩 허용
  xssFilter: true
}));

// 미들웨어 설정
app.use(express.static(path.join(__dirname, '../../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정

const SERVER_CONFIG = {
    port: process.env.PORT,
    /* ... 다른 설정들 ... */
};

module.exports = { app, server, io }; 