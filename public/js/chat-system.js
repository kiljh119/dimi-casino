// 공통 채팅 시스템 모듈
console.log('공통 채팅 시스템 모듈 로드됨');

// 채팅 시스템 클래스 정의
class ChatSystem {
  constructor(options) {
    this.socket = options.socket;
    this.chatMessages = options.chatMessages;
    this.chatInput = options.chatInput;
    this.sendChatBtn = options.sendChatBtn;
    this.username = options.username;
    this.isAdmin = options.isAdmin || false;
    this.onNewMessage = options.onNewMessage || null;
    this.onlinePlayersList = options.onlinePlayersList || null;

    // 채팅 리스너 등록
    this.setupChatListeners();
  }

  // 채팅 리스너 등록
  setupChatListeners() {
    console.log('채팅 리스너 등록 중...');
    
    // 채팅 메시지 수신
    this.socket.on('chat_message', (message) => {
      this.addChatMessage(message);
      
      // 콜백 실행 (필요한 경우)
      if (this.onNewMessage) {
        this.onNewMessage(message);
      }
    });
    
    // 시스템 메시지 수신
    this.socket.on('system_message', (message) => {
      this.addSystemMessage(message);
    });
    
    // 채팅 기록 수신
    this.socket.on('chat_history', (messages) => {
      console.log('채팅 기록 수신됨:', messages.length, '개의 메시지');
      
      // 기존 채팅 비우기
      this.chatMessages.innerHTML = '';
      
      // 메시지 추가
      messages.forEach(msg => {
        this.addChatMessage(msg, false);
      });
      
      // 채팅창 스크롤 맨 아래로
      this.scrollToBottom();
    });
    
    // 온라인 플레이어 목록 업데이트
    this.socket.on('online_players_update', (playerData) => {
      if (this.onlinePlayersList) {
        this.updateOnlinePlayers(playerData);
      }
    });
    
    // 채팅창 지우기 명령
    this.socket.on('clear_chat', () => {
      this.chatMessages.innerHTML = '';
      this.addSystemMessage('채팅 기록이 관리자에 의해 삭제되었습니다.');
    });
  }

  // 채팅 전송
  sendChatMessage() {
    const messageText = this.chatInput.value.trim();
    
    if (!messageText) return;
    
    const message = {
      sender: this.username,
      message: messageText,
      time: Date.now()
    };
    
    this.socket.emit('chat_message', message);
    this.chatInput.value = '';
  }

  // 채팅 메시지 추가
  addChatMessage(message, shouldScroll = true) {
    console.log('채팅 메시지 표시:', message);
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    // 메시지 형식 처리 - 다양한 형태의 메시지 객체 지원
    let username = '';
    let text = '';
    let time = '';
    
    if (typeof message === 'object') {
      // 다양한 필드 이름 처리
      username = message.sender || message.username || message.user || '알 수 없음';
      text = message.message || message.text || message.content || '';
      time = message.time ? new Date(message.time).toLocaleTimeString() : new Date().toLocaleTimeString();
      
      // 메시지 객체 자체가 출력된 경우 처리
      if (text === '[object Object]') {
        text = JSON.stringify(message.data || message.payload || {});
        // JSON 형식이 너무 길면 간략화
        if (text.length > 100) {
          text = text.substring(0, 100) + '...';
        }
      }
    } else if (typeof message === 'string') {
      // 문자열 메시지
      text = message;
      username = this.username;
      time = new Date().toLocaleTimeString();
    } else {
      // 기타 예상치 못한 형식
      text = '지원되지 않는 메시지 형식';
      username = '시스템';
      time = new Date().toLocaleTimeString();
    }
    
    // XSS 방지를 위한 안전한 텍스트 처리
    const safeUsername = this.escapeHtml(username);
    const safeText = this.escapeHtml(text);
    
    // 본인 메시지 구분
    if (username === this.username) {
      messageElement.classList.add('my-message');
    }
    
    // 관리자 메시지 구분
    if (message.isAdmin) {
      messageElement.classList.add('admin-message');
      messageElement.innerHTML = `
        <div class="message-info">
            <span class="admin-badge">관리자</span>
            <span class="message-sender">${safeUsername}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${safeText}</div>
      `;
    } else {
      messageElement.innerHTML = `
        <div class="message-info">
            <span class="message-sender">${safeUsername}</span>
            <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${safeText}</div>
      `;
    }
    
    this.chatMessages.appendChild(messageElement);
    
    if (shouldScroll) {
      this.scrollToBottom();
    }
  }

  // HTML 특수 문자 이스케이프 함수
  escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/`/g, '&#96;');
  }

  // 시스템 메시지 표시
  addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message system-message';
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    // 시스템 메시지도 안전하게 처리
    const safeText = this.escapeHtml(text);
    
    messageElement.innerHTML = `
      <div class="message-info">
          <span class="message-sender">시스템</span>
          <span class="message-time">${timeString}</span>
      </div>
      <div class="message-text">${safeText}</div>
    `;
    
    this.chatMessages.appendChild(messageElement);
    this.scrollToBottom();
  }

  // 채팅창 스크롤을 맨 아래로
  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  // 온라인 플레이어 목록 업데이트
  updateOnlinePlayers(players) {
    if (!this.onlinePlayersList) return;
    
    this.onlinePlayersList.innerHTML = '';
    
    players.forEach(player => {
      const li = document.createElement('li');
      li.className = 'online-player';
      
      // 현재 사용자 강조 표시
      if (player === this.username) {
        li.classList.add('current-user');
      }
      
      // 관리자 표시
      if (player === this.username && this.isAdmin) {
        li.innerHTML = `<i class="fas fa-shield-alt"></i> ${player} <span class="admin-tag">관리자</span>`;
        li.classList.add('admin-player');
      } else {
        // 온라인 표시기와 함께 유저명 출력
        const onlineIndicator = document.createElement('span');
        onlineIndicator.className = 'online-indicator';
        
        li.appendChild(onlineIndicator);
        li.appendChild(document.createTextNode(player));
      }
      
      this.onlinePlayersList.appendChild(li);
    });
  }

  // 채팅 기록 요청
  requestChatHistory() {
    console.log('채팅 기록 요청 중...');
    this.socket.emit('request_chat_messages');
  }

  // 전체 기능 초기화
  init() {
    // 버튼 클릭 및 엔터 키 이벤트 등록
    this.sendChatBtn.addEventListener('click', () => this.sendChatMessage());
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });
    
    // 서버에 채팅 기록 요청
    this.requestChatHistory();
  }
}

// 모듈 내보내기
window.ChatSystem = ChatSystem; 