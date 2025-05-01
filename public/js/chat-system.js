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
    let messageText = this.chatInput.value.trim();
    
    if (!messageText) return;
    
    // XSS 공격 패턴 검사
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // <script> 태그
      /<img[^>]+\bonerror\b[^>]*>/gi, // onerror 속성을 가진 이미지 태그
      /<iframe[^>]*>/gi, // iframe 태그
      /<a[^>]*\bhref\s*=\s*["']?(javascript:|data:)[^>]*>/gi, // 자바스크립트 프로토콜이나 데이터 URI를 사용하는 링크
      /on\w+\s*=\s*["']?[^"'>]*["']?/gi, // 모든 on* 이벤트 핸들러 (onclick, onload 등)
    ];
    
    // XSS 패턴이 발견되면 알림 표시 및 메시지 필터링
    const hasXssPattern = xssPatterns.some(pattern => pattern.test(messageText));
    
    if (hasXssPattern) {
      console.warn('잠재적인 XSS 공격 시도가 감지되었습니다.');
      this.addSystemMessage('보안상의 이유로 특정 HTML 태그와 스크립트는 사용할 수 없습니다.');
      
      // 악성 코드 필터링 (모든 HTML 태그와 이벤트 핸들러 제거)
      messageText = this.escapeHtml(messageText);
    }
    
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
    
    // 메시지 정보 컨테이너 생성
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // 관리자 메시지 구분
    if (message.isAdmin) {
      messageElement.classList.add('admin-message');
      
      const adminBadge = document.createElement('span');
      adminBadge.className = 'admin-badge';
      adminBadge.textContent = '관리자';
      messageInfo.appendChild(adminBadge);
    }
    
    // 발신자 이름 추가
    const senderElement = document.createElement('span');
    senderElement.className = 'message-sender';
    senderElement.textContent = safeUsername;
    messageInfo.appendChild(senderElement);
    
    // 메시지 시간 추가
    const timeElement = document.createElement('span');
    timeElement.className = 'message-time';
    timeElement.textContent = time;
    messageInfo.appendChild(timeElement);
    
    // 메시지 텍스트 컨테이너 생성
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = safeText; // textContent는 자동으로 HTML을 이스케이프함
    
    // 모든 요소 추가
    messageElement.appendChild(messageInfo);
    messageElement.appendChild(messageText);
    
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
    
    // DOMPurify를 사용하여 안전하게 정화 (외부 주입 공격 방지)
    if (window.DOMPurify) {
      return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    }
    
    // DOMPurify가 로드되지 않은 경우 대체 메서드
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 시스템 메시지 표시
  addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message system-message';
    
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const timeString = `${hours}:${minutes}`;
    
    // 메시지 정보 컨테이너 생성
    const messageInfo = document.createElement('div');
    messageInfo.className = 'message-info';
    
    // 발신자(시스템) 추가
    const senderElement = document.createElement('span');
    senderElement.className = 'message-sender';
    senderElement.textContent = '시스템';
    messageInfo.appendChild(senderElement);
    
    // 메시지 시간 추가
    const timeElement = document.createElement('span');
    timeElement.className = 'message-time';
    timeElement.textContent = timeString;
    messageInfo.appendChild(timeElement);
    
    // 메시지 텍스트 컨테이너 생성
    const messageText = document.createElement('div');
    messageText.className = 'message-text';
    messageText.textContent = text; // textContent는 자동으로 HTML을 이스케이프함
    
    // 모든 요소 추가
    messageElement.appendChild(messageInfo);
    messageElement.appendChild(messageText);
    
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
      // XSS 방지를 위해 플레이어 이름 이스케이프
      const safePlayerName = this.escapeHtml(player);
      
      const li = document.createElement('li');
      li.className = 'online-player';
      
      // 현재 사용자 강조 표시
      if (player === this.username) {
        li.classList.add('current-user');
      }
      
      // 관리자 표시
      if (player === this.username && this.isAdmin) {
        // 아이콘 생성
        const icon = document.createElement('i');
        icon.className = 'fas fa-shield-alt';
        li.appendChild(icon);
        
        // 공백 추가
        li.appendChild(document.createTextNode(' '));
        
        // 사용자 이름 추가
        li.appendChild(document.createTextNode(safePlayerName));
        
        // 공백 추가
        li.appendChild(document.createTextNode(' '));
        
        // 관리자 태그 추가
        const adminTag = document.createElement('span');
        adminTag.className = 'admin-tag';
        adminTag.textContent = '관리자';
        li.appendChild(adminTag);
        
        li.classList.add('admin-player');
      } else {
        // 온라인 표시기 생성
        const onlineIndicator = document.createElement('span');
        onlineIndicator.className = 'online-indicator';
        li.appendChild(onlineIndicator);
        
        // 사용자 이름 추가
        li.appendChild(document.createTextNode(safePlayerName));
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