const { supabase } = require('../config/database');

class GameHistory {
  // 게임 히스토리 추가
  static async add(userId, gameResult, amount, winLose, playerScore, bankerScore) {
    return new Promise(async (resolve, reject) => {
      try {
        // 현재 시간으로 타임스탬프 추가하여 충돌 방지
        const timestamp = new Date();
        
        const { data, error } = await supabase
          .from('game_history')
          .insert([{
            user_id: userId,
            game_result: gameResult,
            amount: amount,
            win_lose: winLose,
            player_score: playerScore,
            banker_score: bankerScore,
            created_at: timestamp
          }])
          .select();
        
        if (error) throw error;
        
        resolve(data[0].id);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 사용자별 게임 히스토리 조회
  static async getUserHistory(userId, limit = 50) {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('game_history')
          .select(`
            id,
            game_result,
            amount,
            win_lose,
            player_score,
            banker_score,
            created_at
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        // 시간 포맷 변환
        const formattedData = data.map(item => ({
          ...item,
          result: item.game_result,
          time: new Date(item.created_at).toLocaleString()
        }));
        
        resolve(formattedData);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 사용자별 게임 히스토리를 포맷팅하여 반환
  static async getFormattedUserHistory(userId, limit = 50) {
    try {
      console.log(`사용자 ID ${userId}의 게임 기록 조회 시작`);
      
      // 더 상세한 히스토리 정보 조회
      const { data: history, error } = await supabase
        .from('game_history')
        .select(`
          id,
          user_id,
          game_result,
          amount,
          win_lose,
          player_score,
          banker_score,
          created_at,
          users:user_id (username)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      
      console.log(`사용자 ID ${userId}의 게임 기록: ${history ? history.length : 0}개`);
      
      // 기록이 없는 경우 빈 배열 반환
      if (!history || history.length === 0) {
        return [];
      }
      
      // 객체 형식으로 변환
      return history.map(h => ({
        gameId: h.id,
        player: h.users ? h.users.username : '알 수 없음',
        time: new Date(h.created_at).getTime(),
        isWin: h.win_lose === 'win',
        choice: h.game_result.toLowerCase(),  // player, banker, tie
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