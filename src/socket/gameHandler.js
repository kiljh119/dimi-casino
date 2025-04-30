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
      
      const { choice, amount, gameId } = betData;
      const username = socket.username;
      const userId = socket.userId;
      
      try {
        // 베팅 금액을 숫자로 변환 (문자열이 들어올 경우 대비)
        const betAmount = parseFloat(amount);
        
        if (isNaN(betAmount) || betAmount <= 0) {
          socket.emit('bet_response', { 
            success: false, 
            message: '유효하지 않은 베팅 금액입니다.' 
          });
          return;
        }
        
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
        if (betAmount > user.balance) {
          socket.emit('bet_response', { 
            success: false, 
            message: '베팅 금액이 보유 잔액보다 많습니다.' 
          });
          return;
        }
        
        // 게임 ID 생성 (클라이언트에서 전송한 ID 사용 또는 새로 생성)
        const gameIdentifier = gameId || `game_${username}_${Date.now()}`;
        
        console.log('게임 시작:', gameIdentifier, username, choice, betAmount);
        
        // 게임 정보 저장
        games[gameIdentifier] = {
          id: gameIdentifier,
          userId: userId,
          player: username,
          choice: choice,
          bet: betAmount,
          status: 'started',
          time: Date.now()
        };
        
        // 게임 시작 데이터 유효성 확인 (클라이언트로 보내기 전 검증)
        if (!gameIdentifier || !username || !choice || isNaN(betAmount) || betAmount <= 0) {
          console.error('유효하지 않은 게임 시작 데이터:', { gameIdentifier, username, choice, betAmount });
          socket.emit('bet_response', { 
            success: false, 
            message: '게임 데이터 오류' 
          });
          return;
        }
        
        // 모든 사용자에게 새 게임 알림
        io.emit('game_started', {
          gameId: gameIdentifier,
          player: username,
          choice,
          bet: betAmount.toFixed(2),
          time: Date.now() // 시간 정보 추가
        });
        
        // 결과 계산 (카드 애니메이션 완료 후에 결과 전송)
        // 각 카드당 1.5초 + 추가 시간 고려
        const animationTime = 1500 * 4 + 1000; // 최대 4장의 카드 + 1초 여유 (바카라는 최대 3~4장이 일반적)
        
        setTimeout(async () => {
          try {
            // 카드 생성 및 결과 계산
            const result = calculateGameResult(choice, betAmount);
            const { playerCards, bankerCards, playerScore, bankerScore, isWin, winAmount } = result;
            
            // 게임 결과 업데이트
            games[gameIdentifier] = {
              ...games[gameIdentifier],
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
                await User.updateBalance(userId, isWin ? winAmount : betAmount, isWin);
                
                // 게임 히스토리 저장
                await GameHistory.add(
                  userId, 
                  choice, 
                  isWin ? winAmount : betAmount, 
                  isWin ? 'win' : 'lose', 
                  playerScore, 
                  bankerScore
                );
                
                db.run('COMMIT');
                
                // 현재 잔액 조회
                const updatedUser = await User.findById(userId);
                const timeStr = new Date().toLocaleTimeString();
                // 히스토리 항목 생성 - 시간과 게임 결과 정보 포함
                const historyItem = `[${timeStr}] ${isWin ? '승리!' : '패배!'} ${isWin ? '+$'+winAmount.toFixed(2) : '-$'+betAmount.toFixed(2)} (P${playerScore}:B${bankerScore})`;
                
                // 결과 전송
                socket.emit('game_result', {
                  gameId: gameIdentifier,
                  playerCards,
                  bankerCards,
                  playerScore,
                  bankerScore,
                  isWin,
                  winAmount,
                  bet: betAmount,
                  newBalance: updatedUser ? updatedUser.balance : 0,
                  historyItem,
                  choice
                });
                
                // 모든 사용자에게 게임 결과 알림 - 필요한 모든 정보 포함
                const gameCompletedData = {
                  gameId: gameIdentifier,
                  player: username || '알 수 없음',
                  choice: choice || 'unknown',
                  bet: betAmount > 0 ? betAmount.toFixed(2) : '0.00',
                  isWin: !!isWin,
                  winAmount: isWin && winAmount > 0 ? winAmount.toFixed(2) : '0.00',
                  playerScore: playerScore >= 0 ? playerScore : 0,
                  bankerScore: bankerScore >= 0 ? bankerScore : 0,
                  playerCards: Array.isArray(playerCards) ? playerCards : [],
                  bankerCards: Array.isArray(bankerCards) ? bankerCards : [],
                  status: 'completed',
                  time: Date.now(),
                  winner: playerScore > bankerScore ? 'player' : 
                          bankerScore > playerScore ? 'banker' : 'tie',
                  historyItem
                };
                
                // 게임 완료 데이터 유효성 검사
                if (!gameCompletedData.gameId || !gameCompletedData.player || !gameCompletedData.choice) {
                  console.error('유효하지 않은 게임 완료 데이터:', gameCompletedData);
                  return;
                }
                
                // 중요 필드 데이터 형식 검증
                if (typeof gameCompletedData.player !== 'string' || 
                    !['player', 'banker', 'tie'].includes(gameCompletedData.choice) ||
                    !Array.isArray(gameCompletedData.playerCards) || 
                    !Array.isArray(gameCompletedData.bankerCards)) {
                  console.error('게임 완료 데이터 형식 오류:', gameCompletedData);
                  return;
                }
                
                // 점수 정보 검증
                if (typeof gameCompletedData.playerScore !== 'number' || 
                    typeof gameCompletedData.bankerScore !== 'number') {
                  console.error('게임 완료 점수 데이터 형식 오류:', gameCompletedData);
                  return;
                }
                
                // 승리자 정보 검증
                if (!['player', 'banker', 'tie'].includes(gameCompletedData.winner)) {
                  console.error('게임 완료 승리자 데이터 형식 오류:', gameCompletedData);
                  return;
                }
                
                io.emit('game_completed', gameCompletedData);
                
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
        }, animationTime); // 모든 카드 애니메이션이 완료될 시간 고려
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
    console.log('랭킹 업데이트 시작');
    const rankings = await User.getTopRankings(10); // 상위 10명으로 증가
    
    // 소켓 객체 검증
    if (!io || typeof io.emit !== 'function') {
      console.error('IO 객체가 유효하지 않습니다:', io);
      return;
    }
    
    if (!rankings || rankings.length === 0) {
      console.log('랭킹 데이터가 존재하지 않습니다.');
      return;
    }
    
    io.emit('rankings_update', rankings);
    console.log('랭킹 업데이트 완료: 사용자 수', rankings.length);
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