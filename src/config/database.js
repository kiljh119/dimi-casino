const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');

// 환경변수 로드
dotenv.config();

// 환경변수에서 데이터베이스 경로 가져오기
const dbPath = process.env.DB_PATH || './database.sqlite';

// 데이터베이스 연결 생성
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    console.log(`Database path: ${dbPath}`);
    initializeDatabase();
  }
});

// 데이터베이스 초기화
function initializeDatabase() {
  db.serialize(() => {
    // 기존 테이블이 없으면 생성
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      balance REAL DEFAULT 1000.0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      profit REAL DEFAULT 0.0,
      is_admin BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 게임 히스토리 테이블
    db.run(`CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_result TEXT NOT NULL,
      amount REAL NOT NULL,
      win_lose TEXT NOT NULL,
      player_score INTEGER NOT NULL,
      banker_score INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);
  });
}

module.exports = { db, initializeDatabase }; 