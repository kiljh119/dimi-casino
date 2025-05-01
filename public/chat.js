// 전역 변수 선언
const socket = socketInitFn();
const currentUser = window.currentUser || { username: 'Guest' };

// DOM 요소
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const backToMenuBtn = document.getElementById('back-to-menu');
const logoutBtn = document.getElementById('logout-btn');
const userNameDisplay = document.getElementById('user-name');
const userBalanceDisplay = document.getElementById('user-balance');
const onlinePlayersList = document.getElementById('online-players-list');

// 전역 변수 - 공통 채팅 시스템
let chatSystem = null;

// 소켓 리스너 설정
function setupSocketListeners() {
    // 소켓 연결 완료 시
    socket.on('connect', () => {
        console.log('소켓 연결 완료');
        
        // 로그인 정보 전송
        if (currentUser && currentUser.username) {
            socket.emit('login', { 
                username: currentUser.username,
                token: localStorage.getItem('auth_token')
            });
            
            // 게임 데이터 요청
            setTimeout(() => {
                socket.emit('request_game_data');
            }, 500);
        }
    });
    
    // 로그인 응답 처리
    socket.on('login_response', (response) => {
        console.log('로그인 응답:', response);
        
        if (response.success) {
            // 로그인 성공 시 사용자 정보 업데이트
            if (userNameDisplay && userBalanceDisplay) {
                userNameDisplay.textContent = response.user.username;
                userBalanceDisplay.textContent = `$${response.user.balance.toFixed(2)}`;
            }
        } else {
            // 로그인 실패 처리
            console.error('로그인 실패:', response.message);
            // 메인 페이지로 이동
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        }
    });
    
    // 서버로부터 사용자 정보 업데이트
    socket.on('user_update', (user) => {
        if (userNameDisplay && userBalanceDisplay) {
            userNameDisplay.textContent = user.username;
            userBalanceDisplay.textContent = `$${user.balance.toFixed(2)}`;
            
            // 로컬 스토리지에 저장
            const storedUser = JSON.parse(localStorage.getItem('user')) || {};
            const updatedUser = { ...storedUser, ...user };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        }
    });
    
    // 강제 로그아웃 이벤트 처리
    socket.on('forced_logout', (data) => {
        console.log('강제 로그아웃:', data.message);
        
        // 알림 표시
        alert(data.message);
        
        // 로그아웃 처리
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        
        // 로그인 페이지로 리디렉션
        window.location.href = '/';
    });
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 메뉴로 돌아가기 버튼
    if (backToMenuBtn) {
        backToMenuBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    
    // 로그아웃 버튼
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // 로컬 스토리지에서 사용자 정보 제거
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
            
            // 소켓에 로그아웃 이벤트 전송
            socket.emit('logout');
            
            // 로그인 페이지로 리디렉션
            window.location.href = '/';
        });
    }
}

// 초기화 함수
function init() {
    console.log('채팅 페이지 초기화');
    
    // 사용자 정보 표시
    if (currentUser && userNameDisplay) {
        userNameDisplay.textContent = currentUser.username;
    }
    
    if (currentUser && userBalanceDisplay && currentUser.balance !== undefined) {
        userBalanceDisplay.textContent = `$${currentUser.balance.toFixed(2)}`;
    }
    
    // 공통 채팅 시스템 초기화
    if (window.ChatSystem) {
        chatSystem = new ChatSystem({
            socket: socket,
            chatMessages: chatMessages,
            chatInput: chatInput,
            sendChatBtn: sendChatBtn,
            username: currentUser.username,
            isAdmin: currentUser.isAdmin,
            onlinePlayersList: onlinePlayersList
        });
        
        chatSystem.init();
        console.log("공통 채팅 시스템 초기화 완료");
    } else {
        console.error("ChatSystem 클래스를 찾을 수 없습니다. 공통 채팅 모듈이 로드되었는지 확인하세요.");
    }
    
    setupSocketListeners();
    setupEventListeners();
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init); 