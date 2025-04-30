const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const { calculateGameResult } = require('../utils/gameUtils');
const { setupBlackjackSocket } = require('./blackjackHandler');

// 사용자, 게임 데이터 저장
const onlinePlayers = {};
const games = {};

// 게임 소켓 핸들러
function setupGameSocket(io) {
  // 블랙잭 소켓 설정
  setupBlackjackSocket(io);
  
  // 모든 소켓 연결에 대한 이벤트 처리
  io.on('connection', (socket) => {
    console.log('새로운 사용자가 연결되었습니다:', socket.id);
    
    // 유저 로그인
    socket.on('login', async (userData) => {
      const username = userData.username;
      
      // 이미 로그인된 사용자인지 확인
      if (onlinePlayers[username]) {
        socket.emit('login_response', { 
          success: false, 
          message: '이미 접속 중인 사용자입니다.' 
        });
        return;
      }
      
      try {
        // 데이터베이스에서 사용자 정보 조회
        const user = await User.findByUsername(username);
        
        if (!user) {
          socket.emit('login_response', { 
            success: false, 
            message: '등록되지 않은 사용자입니다. 회원가입을 해주세요.' 
          });
          return;
        }
        
        // 사용자 정보 업데이트
        socket.username = username;
        socket.userId = user.id;
        onlinePlayers[username] = {
          id: socket.id,
          userId: user.id,
          username: username,
          lastActive: Date.now()
        };
        
        // 히스토리 조회
        const history = await GameHistory.getFormattedUserHistory(user.id);
        
        // 로그인 성공 응답
        socket.emit('login_response', { 
          success: true, 
          user: {
            id: user.id,
            username: user.username,
            balance: user.balance,
            history
          }
        });
        
        // 모든 사용자에게 접속자 목록 업데이트 알림
        io.emit('online_players_update', Object.keys(onlinePlayers));
        
        // 랭킹 업데이트
        updateAndSendRankings(io);
      } catch (error) {
        console.error('Login error:', error);
        socket.emit('login_response', { 
          success: false, 
          message: '서버 오류가 발생했습니다.'
        });
      }
    });
    
    // 로그아웃
    socket.on('logout', () => {
      if (socket.username && onlinePlayers[socket.username]) {
        // 현재 사용자 정보 삭제
        delete onlinePlayers[socket.username];
        socket.username = null;
        socket.userId = null;
        
        // 모든 사용자에게 접속자 목록 업데이트 알림
        io.emit('online_players_update', Object.keys(onlinePlayers));
      }
    });
    
    // 베팅 시작
    socket.on('place_bet', async (betData) => {
      if (!socket.username || !socket.userId) return;
      
      const { choice, amount } = betData;
      const username = socket.username;
      const userId = socket.userId;
      
      try {
        // 데이터베이스에서 현재 잔액 확인
        const user = await User.findById(userId);
        
        if (!user) {
          socket.emit('bet_response', { 
            success: false, 
            message: '사용자 정보를 불러올 수 없습니다.' 
          });
          return;
        }
        
        // 잔액 확인
        if (amount <= 0 || amount > user.balance) {
          socket.emit('bet_response', { 
            success: false, 
            message: '유효하지 않은 베팅 금액입니다.' 
          });
          return;
        }
        
        // 게임 ID 생성
        const gameId = `game_${username}_${Date.now()}`;
        
        // 게임 정보 저장
        games[gameId] = {
          id: gameId,
          userId: userId,
          player: username,
          choice: choice,
          bet: amount,
          status: 'started',
          time: Date.now()
        };
        
        // 모든 사용자에게 새 게임 알림
        io.emit('game_started', {
          gameId,
          player: username,
          choice,
          bet: amount
        });
        
        // 결과 계산 (1.5초 후에 결과 전송)
        setTimeout(async () => {
          try {
            // 카드 생성 및 결과 계산
            const result = calculateGameResult(choice, amount);
            const { playerCards, bankerCards, playerScore, bankerScore, isWin, winAmount } = result;
            
            // 게임 결과 업데이트
            games[gameId] = {
              ...games[gameId],
              playerCards,
              bankerCards,
              playerScore,
              bankerScore,
              isWin,
              winAmount,
              status: 'completed'
            };
            
            // 트랜잭션 처리는 모델에서 진행
            const db = require('../config/database').db;
            
            db.serialize(async () => {
              db.run('BEGIN TRANSACTION');
              
              try {
                // 사용자 잔액 및 통계 업데이트
                await User.updateBalance(userId, isWin ? winAmount : amount, isWin);
                
                // 게임 히스토리 저장
                await GameHistory.add(
                  userId, 
                  choice, 
                  isWin ? winAmount : amount, 
                  isWin ? 'win' : 'lose', 
                  playerScore, 
                  bankerScore
                );
                
                db.run('COMMIT');
                
                // 현재 잔액 조회
                const updatedUser = await User.findById(userId);
                const timeStr = new Date().toLocaleTimeString();
                const historyItem = `[${timeStr}] ${isWin ? '승리!' : '패배!'} ${isWin ? '+$'+winAmount.toFixed(2) : '-$'+amount} (P${playerScore}:B${bankerScore})`;
                
                // 결과 전송
                socket.emit('game_result', {
                  gameId,
                  playerCards,
                  bankerCards,
                  playerScore,
                  bankerScore,
                  isWin,
                  winAmount,
                  bet: amount,
                  newBalance: updatedUser ? updatedUser.balance : 0,
                  historyItem
                });
                
                // 모든 사용자에게 게임 결과 알림
                io.emit('game_completed', {
                  gameId,
                  player: username,
                  isWin,
                  playerScore,
                  bankerScore
                });
                
                // 랭킹 데이터 계산 및 전송
                updateAndSendRankings(io);
              } catch (error) {
                db.run('ROLLBACK');
                console.error('Game update error:', error);
                socket.emit('error', { message: '게임 결과를 처리하는데 오류가 발생했습니다.' });
              }
            });
          } catch (error) {
            console.error('Game result error:', error);
            socket.emit('error', { message: '게임 결과 처리 중 오류가 발생했습니다.' });
          }
        }, 1500); // 1.5초 후 결과 계산 (카드 애니메이션 처리 시간)
      } catch (error) {
        console.error('Bet error:', error);
        socket.emit('bet_response', { 
          success: false, 
          message: '베팅 처리 중 오류가 발생했습니다.' 
        });
      }
    });
    
    // 채팅 메시지
    socket.on('chat_message', (message) => {
      if (!socket.username) return;
      
      // 모든 사용자에게 메시지 전달
      io.emit('chat_message', {
        sender: socket.username,
        message,
        time: Date.now()
      });
    });
    
    // 연결 종료
    socket.on('disconnect', () => {
      if (socket.username && onlinePlayers[socket.username]) {
        // 현재 사용자 정보 삭제
        delete onlinePlayers[socket.username];
        
        // 모든 사용자에게 접속자 목록 업데이트 알림
        io.emit('online_players_update', Object.keys(onlinePlayers));
      }
      console.log('사용자 연결이 종료되었습니다:', socket.id);
    });
  });
}

// 랭킹 업데이트 및 전송 함수
async function updateAndSendRankings(io) {
  try {
    const rankings = await User.getTopRankings();
    io.emit('rankings_update', rankings);
  } catch (error) {
    console.error('Rankings update error:', error);
  }
}

module.exports = { setupGameSocket, onlinePlayers, games }; 