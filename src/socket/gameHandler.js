const User = require('../models/User');
const GameHistory = require('../models/GameHistory');
const ChatMessage = require('../models/ChatMessage');
const PublicGameHistory = require('../models/PublicGameHistory');
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
    
    // 사용자 정보 요청 처리
    socket.on('request_user_info', async (data) => {
      console.log('사용자 정보 요청:', data);
      
      if (!data || !data.username) {
        console.error('잘못된 요청 형식:', data);
        return;
      }
      
      try {
        // 데이터베이스에서 최신 사용자 정보 조회
        const user = await User.findByUsername(data.username);
        
        if (!user) {
          console.error('요청한 사용자를 찾을 수 없습니다:', data.username);
          return;
        }
        
        // 사용자 정보 전송
        socket.emit('user_info_update', {
          username: user.username,
          balance: user.balance,
          wins: user.wins,
          losses: user.losses
        });
        
        console.log('사용자 정보 전송 완료:', user.username);
      } catch (error) {
        console.error('사용자 정보 요청 처리 오류:', error);
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
            
            try {
              // 사용자 잔액 및 통계 업데이트
              await User.updateBalance(userId, isWin ? winAmount : amount, isWin);
              
              // 개인 게임 히스토리 저장
              await GameHistory.add(
                userId, 
                choice, 
                isWin ? winAmount : amount, 
                isWin ? 'win' : 'lose', 
                playerScore, 
                bankerScore
              );
              
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
              
              // 다른 플레이어에게는 진행 중인 게임 알림만 전송 (최종 결과는 game_completed에서 전송)
              io.emit('other_player_result', {
                username,
                choice,
                betAmount: amount,
                isWin,
                winAmount: isWin ? winAmount : 0,
                playerScore,
                bankerScore,
                playerCards,
                bankerCards,
                time: Date.now(),
                gameId // 게임 ID 추가
              });
              
              // 게임 완료 및 랭킹 업데이트는 베팅 후 정확히 10초 후에 처리
              setTimeout(async () => {
                try {
                  // 게임이 완료되면 공개 게임 히스토리에 추가
                  await PublicGameHistory.add(
                    userId,
                    username,
                    choice,
                    amount,
                    isWin ? 'win' : 'lose',
                    winAmount,
                    playerScore,
                    bankerScore,
                    playerCards,
                    bankerCards
                  );
                  
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
                  
                  console.log('10초 후 게임 결과 및 랭킹 업데이트 완료:', gameId);
                } catch (error) {
                  console.error('게임 완료 처리 중 오류:', error);
                }
              }, 10000); // 베팅 확정 후 정확히 10초 후
            } catch (error) {
              console.error('Game result error:', error);
              socket.emit('error', { message: '게임 결과 처리 중 오류가 발생했습니다.' });
            }
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
    socket.on('chat_message', async (message) => {
      console.log('채팅 메시지 수신:', message);
      
      if (!socket.username) {
        console.log('로그인하지 않은 사용자의 메시지 무시');
        socket.emit('error_message', '메시지를 보내려면 로그인이 필요합니다.');
        return;
      }
      
      // 메시지 길이 제한 (너무 긴 메시지 거부)
      const MAX_MESSAGE_LENGTH = 500;
      
      let formattedMessage;
      
      if (typeof message === 'string') {
        // 메시지 길이 검사
        if (message.length > MAX_MESSAGE_LENGTH) {
          message = message.substring(0, MAX_MESSAGE_LENGTH) + '...';
          socket.emit('system_message', `메시지가 너무 깁니다. ${MAX_MESSAGE_LENGTH}자로 제한되었습니다.`);
        }
        
        formattedMessage = {
          sender: socket.username,
          message: message,
          time: Date.now()
        };
      } else if (typeof message === 'object') {
        // 객체가 null이 아닌지 확인
        if (!message) {
          console.log('유효하지 않은 메시지 객체: null');
          return;
        }
        
        // 메시지 길이 검사
        let messageText = message.message || message.text || '';
        if (messageText.length > MAX_MESSAGE_LENGTH) {
          messageText = messageText.substring(0, MAX_MESSAGE_LENGTH) + '...';
          socket.emit('system_message', `메시지가 너무 깁니다. ${MAX_MESSAGE_LENGTH}자로 제한되었습니다.`);
        }
        
        formattedMessage = {
          sender: socket.username, // 항상 소켓의 username을 사용 (보안)
          message: messageText,
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
              // 데이터베이스 채팅 기록도 삭제
              try {
                await ChatMessage.deleteAll();
                console.log('관리자에 의해 채팅 기록이 삭제됨');
              } catch (err) {
                console.error('채팅 기록 삭제 중 오류:', err);
              }
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
        console.log('유효하지 않은 메시지 형식:', typeof message);
        return; // 유효하지 않은 메시지 형식
      }
      
      // 관리자 여부 확인
      const isAdmin = onlinePlayers[socket.username] && onlinePlayers[socket.username].isAdmin;
      if (isAdmin) {
        formattedMessage.isAdmin = true;
      }
      
      console.log('채팅 메시지 전송:', formattedMessage);
      
      // XSS 패턴 검사 및 필터링
      if (typeof formattedMessage.message === 'string' && formattedMessage.message.length > 0) {
        // 금지어 및 XSS 필터링
        formattedMessage.message = filterMessage(formattedMessage.message);
        
        // 데이터베이스에 메시지 저장
        try {
          await ChatMessage.save(
            socket.userId, 
            formattedMessage.sender, 
            formattedMessage.message, 
            formattedMessage.isAdmin || false
          );
          console.log('채팅 메시지 저장됨:', formattedMessage.sender);
        } catch (err) {
          console.error('채팅 메시지 저장 중 오류:', err);
        }
        
        // 모든 사용자에게 메시지 전달
        io.emit('chat_message', formattedMessage);
      } else {
        console.log('빈 메시지 무시');
      }
    });
    
    // 금지어 필터링 함수
    function filterMessage(message) {
      if (typeof message !== 'string') {
        return '';
      }

      // XSS 공격 패턴 검사
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // <script> 태그
        /<img[^>]+\bonerror\b[^>]*>/gi, // onerror 속성을 가진 이미지 태그
        /<iframe[^>]*>/gi, // iframe 태그
        /<a[^>]*\bhref\s*=\s*["']?(javascript:|data:)[^>]*>/gi, // 자바스크립트 프로토콜이나 데이터 URI를 사용하는 링크
        /on\w+\s*=\s*["']?[^"'>]*["']?/gi, // 모든 on* 이벤트 핸들러 (onclick, onload 등)
      ];
      
      // XSS 패턴이 발견되면 로그 기록
      const hasXssPattern = xssPatterns.some(pattern => pattern.test(message));
      
      if (hasXssPattern) {
        console.warn('잠재적인 XSS 공격 시도가 감지되었습니다:', message);
      }
      
      // 금지어 목록 (필요에 따라 확장 가능)
      const badWords = ['욕설', '비속어', '심한말'];
      
      // XSS 공격 방지를 위한 HTML 이스케이프 처리
      let filteredMessage = escapeHtml(message);
      
      // 금지어 필터링
      badWords.forEach(word => {
        // 금지어를 *로 대체
        const regex = new RegExp(word, 'gi');
        filteredMessage = filteredMessage.replace(regex, '*'.repeat(word.length));
      });
      
      return filteredMessage;
    }
    
    // HTML 특수 문자 이스케이프 함수
    function escapeHtml(text) {
      if (typeof text !== 'string') {
        return '';
      }
      
      // 추가적인 방어 레이어: 모든 HTML 태그 치환
      const sanitizedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#96;')
        .replace(/(javascript\s*:)/gi, 'blocked:') // 자바스크립트 프로토콜 차단
        .replace(/(data\s*:)/gi, 'blocked:'); // 데이터 URI 차단
      
      return sanitizedText;
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
        
        // 최근 채팅 메시지 가져오기
        const chatMessages = await ChatMessage.getRecent(50);
        console.log('채팅 메시지 가져옴:', chatMessages.length);
        
        // 온라인 플레이어 목록
        const onlinePlayersList = Object.keys(onlinePlayers);
        
        // 데이터 전송
        console.log(`${socket.username}에게 게임 데이터 전송: 랭킹=${rankings.length}, 히스토리=${history.length}, 채팅=${chatMessages.length}`);
        socket.emit('game_data', {
          rankings,
          history,
          onlinePlayers: onlinePlayersList,
          chatMessages
        });
      } catch (error) {
        console.error('게임 데이터 요청 처리 중 오류:', error);
        socket.emit('error_message', '데이터를 불러오는 중 오류가 발생했습니다.');
      }
    });
    
    // 채팅 메시지 요청 (새로운 이벤트)
    socket.on('request_chat_messages', async () => {
      try {
        console.log('채팅 메시지 요청됨 - 사용자:', socket.username);
        const chatMessages = await ChatMessage.getRecent(50);
        console.log('채팅 메시지 로드 성공:', chatMessages.length, '개 메시지 검색됨');
        
        // 메시지 형식 정상화
        const formattedMessages = chatMessages.map(msg => {
          // 디버깅을 위한 원본 메시지 출력
          console.log('메시지 형식:', msg);
          
          return {
            sender: msg.sender || msg.username || '알 수 없음',
            message: msg.message || msg.text || '',
            time: msg.time || new Date(msg.createdAt || Date.now()).getTime(),
            isAdmin: msg.isAdmin || false
          };
        });
        
        // 특정 사용자에게만 전송
        socket.emit('chat_history', formattedMessages);
        console.log('채팅 메시지 전송 완료:', formattedMessages.length);
      } catch (error) {
        console.error('채팅 메시지 요청 처리 중 오류:', error);
        socket.emit('error_message', '채팅 메시지를 불러오는 중 오류가 발생했습니다.');
      }
    });
    
    // 다른 사용자들의 최근 게임 기록 요청 처리
    socket.on('request_other_players_history', async () => {
      try {
        // 최근 공개 게임 기록 불러오기
        const recentHistory = await PublicGameHistory.getRecent(20);
        
        // 요청한 클라이언트에게만 결과 전송
        socket.emit('other_players_history', recentHistory);
        console.log('다른 사용자들의 게임 기록 전송 완료:', recentHistory.length);
      } catch (error) {
        console.error('게임 기록 요청 처리 중 오류:', error);
        socket.emit('error_message', '게임 기록을 불러오는 중 오류가 발생했습니다.');
      }
    });
    
    // 특정 게임 상세 기록 요청 처리
    socket.on('request_game_details', async (gameId) => {
      try {
        // 게임 기록 ID로 상세 정보 조회
        const gameDetails = await PublicGameHistory.getById(gameId);
        
        if (gameDetails) {
          socket.emit('game_details', gameDetails);
          console.log('게임 상세 정보 전송 완료:', gameId);
        } else {
          socket.emit('error_message', '해당 게임 기록을 찾을 수 없습니다.');
        }
      } catch (error) {
        console.error('게임 상세 정보 요청 처리 중 오류:', error);
        socket.emit('error_message', '게임 상세 정보를 불러오는 중 오류가 발생했습니다.');
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