const { db } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  // 사용자 생성
  static async create(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        db.run(
          'INSERT INTO users (username, password) VALUES (?, ?)',
          [username, hashedPassword],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // 사용자명으로 찾기
  static findByUsername(username) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, user) => {
          if (err) return reject(err);
          resolve(user);
        }
      );
    });
  }

  // 아이디로 찾기
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE id = ?',
        [id],
        (err, user) => {
          if (err) return reject(err);
          resolve(user);
        }
      );
    });
  }

  // 잔액 업데이트
  static updateBalance(userId, amount, isWin) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET 
         balance = balance ${isWin ? '+' : '-'} ?, 
         ${isWin ? 'wins = wins + 1' : 'losses = losses + 1'}, 
         profit = profit ${isWin ? '+' : '-'} ? 
         WHERE id = ?`,
        [amount, amount, userId],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  // 상위 랭킹 가져오기
  static getTopRankings(limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT username, profit, wins, losses,
         CASE WHEN (wins + losses) > 0 THEN (wins * 100.0 / (wins + losses)) ELSE 0 END as win_rate
         FROM users
         ORDER BY profit DESC
         LIMIT ?`,
        [limit],
        (err, rankings) => {
          if (err) return reject(err);
          
          const formattedRankings = rankings.map(user => ({
            username: user.username,
            profit: user.profit || 0,
            games: (user.wins || 0) + (user.losses || 0),
            winRate: user.win_rate.toFixed(1)
          }));
          
          resolve(formattedRankings);
        }
      );
    });
  }
  
  // 관리자용 - 모든 사용자 조회
  static getAllUsers() {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, username, balance, wins, losses, profit, 
        CASE WHEN (wins + losses) > 0 THEN (wins * 100.0 / (wins + losses)) ELSE 0 END as win_rate,
        datetime(created_at, 'localtime') as created_at
        FROM users
        ORDER BY username`,
        [],
        (err, users) => {
          if (err) return reject(err);
          resolve(users);
        }
      );
    });
  }
  
  // 관리자용 - 사용자 검색
  static searchUsers(query) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, username, balance, wins, losses, profit, 
        CASE WHEN (wins + losses) > 0 THEN (wins * 100.0 / (wins + losses)) ELSE 0 END as win_rate,
        datetime(created_at, 'localtime') as created_at
        FROM users
        WHERE username LIKE ?
        ORDER BY username`,
        [`%${query}%`],
        (err, users) => {
          if (err) return reject(err);
          resolve(users);
        }
      );
    });
  }
  
  // 관리자용 - 잔액 증가
  static addBalance(userId, amount) {
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET balance = balance + ? WHERE id = ?`,
        [amount, userId],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }
  
  // 관리자용 - 잔액 감소
  static subtractBalance(userId, amount) {
    return new Promise((resolve, reject) => {
      // 먼저 현재 잔액을 확인하여 마이너스가 되지 않도록 함
      db.get(
        'SELECT balance FROM users WHERE id = ?',
        [userId],
        (err, user) => {
          if (err) return reject(err);
          if (!user) return reject(new Error('사용자를 찾을 수 없습니다.'));
          
          // 차감할 금액이 현재 잔액보다 많으면 현재 잔액만큼만 차감
          const deductAmount = Math.min(amount, user.balance);
          
          db.run(
            `UPDATE users SET balance = balance - ? WHERE id = ?`,
            [deductAmount, userId],
            function (err) {
              if (err) return reject(err);
              resolve({ 
                changes: this.changes, 
                deductedAmount: deductAmount,
                newBalance: user.balance - deductAmount 
              });
            }
          );
        }
      );
    });
  }
}

module.exports = User; 