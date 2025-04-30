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
  static getTopRankings(limit = 10) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, username, balance, profit, wins, losses,
         (wins + losses) as total_games,
         CASE WHEN (wins + losses) > 0 THEN (wins * 100.0 / (wins + losses)) ELSE 0 END as win_rate
         FROM users
         ORDER BY balance DESC
         LIMIT ?`,
        [limit],
        (err, rankings) => {
          if (err) return reject(err);
          
          const formattedRankings = rankings.map(user => ({
            id: user.id,
            username: user.username,
            balance: user.balance || 0,
            profit: user.profit || 0,
            wins: user.wins || 0,
            losses: user.losses || 0,
            totalGames: user.total_games || 0,
            winRate: (user.wins && user.total_games) ? (user.wins / user.total_games) : 0
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
  
  // 관리자용 - 계정 삭제
  static deleteUser(userId) {
    return new Promise((resolve, reject) => {
      // 트랜잭션 시작
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        try {
          // 관리자 계정은 삭제 불가
          db.get(
            'SELECT username FROM users WHERE id = ?',
            [userId],
            (err, user) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              
              if (!user) {
                db.run('ROLLBACK');
                return reject(new Error('사용자를 찾을 수 없습니다.'));
              }
              
              if (user.username === 'admin') {
                db.run('ROLLBACK');
                return reject(new Error('관리자 계정은 삭제할 수 없습니다.'));
              }
              
              // 사용자의 게임 히스토리 삭제
              db.run(
                'DELETE FROM game_history WHERE user_id = ?',
                [userId],
                (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  // 사용자 계정 삭제
                  db.run(
                    'DELETE FROM users WHERE id = ?',
                    [userId],
                    function (err) {
                      if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                      }
                      
                      db.run('COMMIT');
                      resolve({
                        success: true,
                        message: '계정이 성공적으로 삭제되었습니다.',
                        changes: this.changes
                      });
                    }
                  );
                }
              );
            }
          );
        } catch (error) {
          db.run('ROLLBACK');
          reject(error);
        }
      });
    });
  }
}

module.exports = User; 