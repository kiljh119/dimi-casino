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
      // 더 상세한 히스토리 정보를 가져오도록 SQL 수정
      const history = await new Promise((resolve, reject) => {
        db.all(
          `SELECT 
            h.id as gameId,
            h.game_result as result, 
            h.amount, 
            h.win_lose, 
            h.player_score, 
            h.banker_score, 
            datetime(h.created_at, 'localtime') as time,
            u.username as player
           FROM game_history h
           JOIN users u ON h.user_id = u.id
           WHERE h.user_id = ? 
           ORDER BY h.created_at DESC 
           LIMIT ?`,
          [userId, limit],
          (err, history) => {
            if (err) return reject(err);
            resolve(history);
          }
        );
      });
      
      console.log(`사용자 ID ${userId}의 게임 기록: ${history.length}개`);
      
      // 객체 형식으로 변환
      return history.map(h => ({
        gameId: h.gameId,
        player: h.player,
        time: new Date(h.time).getTime(),
        isWin: h.win_lose === 'win',
        choice: h.result.toLowerCase(),  // player, banker, tie
        bet: h.amount,
        playerScore: h.player_score,
        bankerScore: h.banker_score,
        winAmount: h.win_lose === 'win' ? h.amount : 0,
        winner: h.player_score > h.banker_score ? 'player' : 
                h.banker_score > h.player_score ? 'banker' : 'tie'
      }));
    } catch (error) {
      console.error('History formatting error:', error);
      return [];
    }
  }
}

module.exports = GameHistory; 