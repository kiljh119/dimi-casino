const { db } = require('../config/database');

class GameHistory {
  // 게임 히스토리 추가
  static add(userId, gameResult, amount, winLose, playerScore, bankerScore) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO game_history 
         (user_id, game_result, amount, win_lose, player_score, banker_score) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, gameResult, amount, winLose, playerScore, bankerScore],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  // 사용자별 게임 히스토리 조회
  static getUserHistory(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT game_result as result, amount, win_lose, player_score, banker_score, 
                datetime(created_at, 'localtime') as time 
         FROM game_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, limit],
        (err, history) => {
          if (err) return reject(err);
          resolve(history);
        }
      );
    });
  }

  // 사용자별 게임 히스토리를 포맷팅하여 반환
  static async getFormattedUserHistory(userId, limit = 50) {
    try {
      const history = await this.getUserHistory(userId, limit);
      return history.map(h => 
        `[${h.time.split(' ')[1]}] ${h.win_lose === 'win' ? '승리!' : '패배!'} ${h.win_lose === 'win' ? '+$' + h.amount.toFixed(2) : '-$' + h.amount} (P${h.player_score}:B${h.banker_score})`
      );
    } catch (error) {
      console.error('History formatting error:', error);
      return [];
    }
  }
}

module.exports = GameHistory; 