const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const { calculateGameResult } = require('../utils/gameUtils');

// 사용자, 게임 데이터 저장
const onlinePlayers = {};
const games = {};

// 소켓 ID로 사용자 검색
const socketIdsByUsername = {};

// 게임 소켓 핸들러
function setupGameSocket(io) {
  console.log('게임 소켓 핸들러 설정 완료');
  
  // 모든 소켓 연결에 대한 이벤트 처리
  io.on('connection', (socket) => {
    console.log('새로운 사용자가 연결되었습니다:', socket.id);
    
    // 초기 데이터 전송
    try {
      // 랭킹 데이터 전송
      updateAndSendRankings(io);
      
      // 온라인 플레이어 목록 전송
      updateOnlinePlayers(io);
    } catch (error) {
      console.error('초기 데이터 전송 오류:', error);
    }
    
    // 유저 로그인
    socket.on('login', async (userData) => {
      console.log('로그인 시도:', userData);
      const username = userData.username;
      
      // 이미 로그인된 사용자인지 확인
      if (onlinePlayers[username]) {
        // 기존 연결 강제 종료를 위해 소켓 ID 찾기
        const existingSocketId = socketIdsByUsername[username];
        if (existingSocketId) {
          // 기존 소켓에 강제 로그아웃 이벤트 발송
          io.to(existingSocketId).emit('forced_logout', {
            message: '다른 기기에서 로그인되었습니다. 현재 세션이 종료됩니다.'
          });
          
          // 온라인 상태에서 제거
          delete onlinePlayers[username];
          delete socketIdsByUsername[username];
          
          console.log(`사용자 ${username}의 기존 세션(${existingSocketId})을 강제 종료했습니다.`);
        }
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
        
        // 소켓 ID 매핑 업데이트
        socketIdsByUsername[username] = socket.id;
        
        // 히스토리 조회
        const history = await GameHistory.getFormattedUserHistory(user.id);
        
        console.log('로그인 성공:', username, '사용자 수:', Object.keys(onlinePlayers).length);
        
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
        updateOnlinePlayers(io);
        
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
        delete socketIdsByUsername[socket.username];
        socket.username = null;
        socket.userId = null;
        
        // 모든 사용자에게 접속자 목록 업데이트 알림
        io.emit('online_players_update', Object.keys(onlinePlayers));
      }
    });
    
    // 베팅 시작
    socket.on('place_bet', async (betData) => {
      console.log('베팅 시도:', socket.username, betData);
      
      // 소켓에 사용자 정보가 없는 경우 클라이언트에서 전송된 username 사용
      if (!socket.username && betData.username) {
        // 데이터베이스에서 사용자 조회
        try {
          const user = await User.findByUsername(betData.username);
          if (user) {
            socket.username = betData.username;
            socket.userId = user.id;
            console.log('사용자 정보 복구:', socket.username, socket.userId);
          }
        } catch (error) {
          console.error('사용자 조회 오류:', error);
        }
      }
      
      if (!socket.username || !socket.userId) {
        console.log('베팅 실패: 로그인 필요', socket.id);
        socket.emit('bet_response', { 
          success: false, 
          message: '로그인이 필요합니다.' 
        });
        return;
      }
      
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
        
        console.log('게임 시작:', gameId, username, choice, amount);
        
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
                  historyItem,
                  choice
                });
                
                // 게임 완료 및 랭킹 업데이트는 베팅 후 정확히 10초 후에 처리
                setTimeout(() => {
                  // 모든 사용자에게 게임 결과 알림
                  io.emit('game_completed', {
                    gameId,
                    player: username,
                    choice,
                    bet: amount,
                    isWin,
                    playerScore,
                    bankerScore,
                    status: 'completed',
                    time: Date.now(),
                    winner: playerScore > bankerScore ? 'player' : 
                            bankerScore > playerScore ? 'banker' : 'tie'
                  });
                  
                  // 랭킹 데이터 계산 및 전송
                  updateAndSendRankings(io);
                  
                  // 시스템 메시지로 알림
                  io.emit('system_message', `베팅 후 10초: ${username}님의 게임 결과가 랭킹과 기록에 반영되었습니다.`);
                  
                  console.log('10초 후 게임 결과 및 랭킹 업데이트 완료:', gameId);
                }, 10000); // 베팅 확정 후 정확히 10초 후
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
      
      // 메시지 형식 처리 (문자열 또는 객체)
      let formattedMessage;
      
      if (typeof message === 'string') {
        formattedMessage = {
          sender: socket.username,
          message: message,
          time: Date.now()
        };
      } else if (typeof message === 'object') {
        formattedMessage = {
          sender: socket.username, // 항상 소켓의 username을 사용 (보안)
          message: message.message || message.text || '',
          time: message.time || Date.now()
        };
        
        // 특수 명령어 처리 (관리자만 가능)
        const isAdmin = onlinePlayers[socket.username] && onlinePlayers[socket.username].isAdmin;
        if (isAdmin && formattedMessage.message.startsWith('/')) {
          const command = formattedMessage.message.slice(1).split(' ')[0];
          const params = formattedMessage.message.slice(command.length + 2);
          
          switch (command) {
            case 'announce':
              // 전체 공지
              io.emit('system_message', params);
              return;
            case 'clear':
              // 채팅창 정리 명령
              io.emit('clear_chat');
              return;
            case 'kick':
              // 유저 강퇴
              const targetUser = params.trim();
              if (onlinePlayers[targetUser]) {
                const targetSocketId = onlinePlayers[targetUser].id;
                io.to(targetSocketId).emit('system_message', '관리자에 의해 강제 퇴장되었습니다.');
                io.to(targetSocketId).emit('return_to_menu');
              }
              return;
          }
        }
      } else {
        return; // 유효하지 않은 메시지 형식
      }
      
      // 관리자 여부 확인
      const isAdmin = onlinePlayers[socket.username] && onlinePlayers[socket.username].isAdmin;
      if (isAdmin) {
        formattedMessage.isAdmin = true;
      }
      
      console.log('채팅 메시지 전송:', formattedMessage);
      
      // 금지어 필터링
      formattedMessage.message = filterMessage(formattedMessage.message);
      
      // 모든 사용자에게 메시지 전달
      io.emit('chat_message', formattedMessage);
    });
    
    // 금지어 필터링 함수
    function filterMessage(message) {
      // 금지어 목록 (필요에 따라 확장 가능)
      const badWords = ['욕설', '비속어', '심한말'];
      
      let filteredMessage = message;
      badWords.forEach(word => {
        // 금지어를 *로 대체
        const regex = new RegExp(word, 'gi');
        filteredMessage = filteredMessage.replace(regex, '*'.repeat(word.length));
      });
      
      return filteredMessage;
    }
    
    // 게임 데이터 요청
    socket.on('request_game_data', async () => {
      console.log('게임 데이터 요청:', socket.username);
      
      if (!socket.username) {
        console.log('로그인 하지 않은 사용자의 데이터 요청');
        return;
      }
      
      try {
        // 랭킹 데이터 가져오기
        const rankings = await User.getTopRankings(10);
        console.log('랭킹 데이터 가져옴:', rankings.length);
        
        // 게임 히스토리 가져오기
        let history = [];
        if (socket.userId) {
          history = await GameHistory.getFormattedUserHistory(socket.userId);
          console.log('사용자 게임 기록 가져옴:', history.length);
        }
        
        // 온라인 플레이어 목록
        const onlinePlayersList = Object.keys(onlinePlayers);
        
        // 데이터 전송
        console.log(`${socket.username}에게 게임 데이터 전송: 랭킹=${rankings.length}, 히스토리=${history.length}`);
        socket.emit('game_data', {
          rankings,
          history,
          onlinePlayers: onlinePlayersList
        });
      } catch (error) {
        console.error('게임 데이터 요청 처리 중 오류:', error);
        socket.emit('error_message', '데이터를 불러오는 중 오류가 발생했습니다.');
      }
    });
    
    // 연결 종료
    socket.on('disconnect', () => {
      console.log('사용자 연결이 종료되었습니다:', socket.id);
      
      if (socket.username && onlinePlayers[socket.username]) {
        // 현재 사용자 정보 삭제
        delete onlinePlayers[socket.username];
        delete socketIdsByUsername[socket.username];
        
        // 모든 사용자에게 접속자 목록 업데이트 알림
        updateOnlinePlayers(io);
      }
    });
  });
}

// 랭킹 업데이트 및 전송 함수
async function updateAndSendRankings(io) {
  try {
    console.log('랭킹 업데이트 시작');
    const rankings = await User.getTopRankings();
    console.log('랭킹 데이터:', rankings.length);
    
    // 소켓 객체 검증
    if (!io || typeof io.emit !== 'function') {
      console.error('IO 객체가 유효하지 않습니다:', io);
      return;
    }
    
    io.emit('rankings_update', rankings);
    console.log('랭킹 업데이트 완료');
  } catch (error) {
    console.error('Rankings update error:', error);
  }
}

// 온라인 플레이어 업데이트 함수 (추가)
function updateOnlinePlayers(io) {
  // 소켓 객체 검증
  if (!io || typeof io.emit !== 'function') {
    console.error('IO 객체가 유효하지 않습니다:', io);
    return;
  }
  
  io.emit('online_players_update', Object.keys(onlinePlayers));
  console.log('온라인 플레이어 업데이트 완료:', Object.keys(onlinePlayers).length);
}

module.exports = { 
  setupGameSocket, 
  onlinePlayers, 
  games,
  updateAndSendRankings,
  updateOnlinePlayers
}; 