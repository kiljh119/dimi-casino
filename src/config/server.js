const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

// Express 앱 생성
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// 미들웨어 설정
app.use(express.static(path.join(__dirname, '../../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite' }),
  secret: 'baccarat-game-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30일
}));

module.exports = { app, server, io }; 