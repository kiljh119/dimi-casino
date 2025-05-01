// 관리자 페이지 JavaScript
// import { handleLogout, getToken, getUserInfo } from './modules/auth.js';

// 로컬 스토리지 키
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

// JWT 토큰 가져오기
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// JWT 토큰 삭제
function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY); // 사용자 정보도 함께 삭제
}

// 로그아웃 처리
function handleLogout() {
    console.log('로그아웃 시도');
    
    // 서버에 로그아웃 요청
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(() => {
        // 토큰 및 사용자 정보 삭제
        removeToken();
        console.log('로그아웃 완료, 로컬 스토리지 정보 삭제됨');
        
        // 로그인 페이지로 리디렉션
        window.location.href = 'login.html';
    })
    .catch(error => {
        console.error('로그아웃 오류:', error);
        // 오류가 발생해도 로컬 스토리지를 정리하고 로그인 페이지로 이동
        removeToken();
        window.location.href = 'login.html';
    });
}

// 소켓 연결
const socket = io();

// DOM 요소
const userSearch = document.getElementById('user-search');
const searchBtn = document.getElementById('search-btn');
const usersTableBody = document.getElementById('users-table-body');
const selectedUser = document.getElementById('selected-user');
const amountInput = document.getElementById('amount');
const addBalanceBtn = document.getElementById('add-balance');
const subtractBalanceBtn = document.getElementById('subtract-balance');
const deleteUserBtn = document.getElementById('delete-user'); // 계정 삭제 버튼
const balanceMessage = document.getElementById('balance-message');
const adminName = document.getElementById('admin-name');

// 전역 변수
let allUsers = []; // 모든 사용자 목록

// 사용자 목록 조회
function fetchUsers() {
    console.log('사용자 목록 조회 시도');
    
    // 로딩 표시
    usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">로딩 중...</td></tr>';
    
    // 토큰 가져오기
    const token = getToken();
    
    if (!token) {
        console.error('인증 토큰이 없습니다.');
        showMessage('인증 오류가 발생했습니다. 다시 로그인해주세요.', 'error');
        setTimeout(() => {
            handleLogout();
        }, 2000);
        return;
    }
    
    fetch('/api/admin/users', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('사용자 목록 로드 성공:', data.users.length, '명');
            allUsers = data.users;
            renderUsers(data.users);
            populateUserSelect(data.users);
        } else {
            console.error('사용자 목록 로드 오류:', data.message);
            showMessage(data.message || '사용자 목록을 불러오는데 실패했습니다.', 'error');
            usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">사용자 목록을 불러올 수 없습니다.</td></tr>';
        }
    })
    .catch(error => {
        console.error('Error fetching users:', error);
        showMessage('서버 오류가 발생했습니다.', 'error');
        usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">서버 오류가 발생했습니다.</td></tr>';
    });
}

// 사용자 검색
function searchUsers() {
    const query = userSearch.value.trim();
    if (!query) {
        renderUsers(allUsers);
        return;
    }
    
    console.log('사용자 검색 시도:', query);
    
    // 토큰 가져오기
    const token = getToken();
    
    if (!token) {
        console.error('인증 토큰이 없습니다.');
        showMessage('인증 오류가 발생했습니다. 다시 로그인해주세요.', 'error');
        return;
    }
    
    fetch(`/api/admin/users/search?query=${encodeURIComponent(query)}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('사용자 검색 결과:', data.users.length, '명');
            renderUsers(data.users);
        } else {
            console.error('사용자 검색 오류:', data.message);
            showMessage(data.message || '사용자 검색에 실패했습니다.', 'error');
        }
    })
    .catch(error => {
        console.error('Error searching users:', error);
        showMessage('서버 오류가 발생했습니다.', 'error');
    });
}

// 사용자 목록 렌더링
function renderUsers(users) {
    usersTableBody.innerHTML = '';
    
    if (!users || users.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">표시할 사용자가 없습니다.</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        
        // 사용자명 셀 - 관리자는 특별 스타일링
        const usernameCell = document.createElement('td');
        
        if (user.username.toLowerCase() === 'admin' || user.is_admin === true || user.is_admin === 1) {
            usernameCell.innerHTML = `<span style="font-weight:bold; color:#007bff;"><i class="fas fa-crown"></i> ${user.username}</span>`;
        } else {
            usernameCell.textContent = user.username;
        }
        
        // 잔액 셀 - 금액 포맷팅
        const balanceCell = document.createElement('td');
        balanceCell.innerHTML = `<span style="font-weight:bold;">$${user.balance.toLocaleString()}</span>`;
        
        // 승리 수 셀
        const winsCell = document.createElement('td');
        winsCell.innerHTML = `<span style="color:#28a745;">${user.wins || 0}</span>`;
        
        // 패배 수 셀
        const lossesCell = document.createElement('td');
        lossesCell.innerHTML = `<span style="color:#dc3545;">${user.losses || 0}</span>`;
        
        // 수익 셀 - 양수/음수에 따른 스타일링
        const profitCell = document.createElement('td');
        profitCell.className = user.profit >= 0 ? 'positive' : 'negative';
        profitCell.innerHTML = `<span>$${user.profit.toLocaleString()}</span>`;
        
        // 관리 버튼 셀
        const actionsCell = document.createElement('td');
        const actionDiv = document.createElement('div');
        actionDiv.className = 'user-actions';
        
        const viewButton = document.createElement('button');
        viewButton.className = 'view-btn';
        viewButton.innerHTML = '<i class="fas fa-eye"></i> 선택';
        viewButton.addEventListener('click', () => {
            selectedUser.value = user.id;
            
            // 사용자 선택 시 자동으로 금액 입력칸에 포커스
            amountInput.focus();
            
            // 선택된 사용자 정보를 표시
            const balanceMessage = document.getElementById('balance-message');
            balanceMessage.textContent = `${user.username}님 선택됨 (현재 잔액: $${user.balance.toLocaleString()})`;
            balanceMessage.className = 'message info';
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteButton.title = '계정 삭제';
        
        // 관리자 계정은 삭제 버튼 비활성화
        if (user.username === 'admin' || user.is_admin === true || user.is_admin === 1) {
            deleteButton.disabled = true;
            deleteButton.style.backgroundColor = '#ccc';
            deleteButton.style.cursor = 'not-allowed';
            deleteButton.title = '관리자 계정은 삭제할 수 없습니다.';
        } else {
            deleteButton.addEventListener('click', () => {
                if (confirm(`정말로 "${user.username}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 게임 기록이 삭제됩니다.`)) {
                    handleDeleteUser(user.id, user.username);
                }
            });
        }
        
        actionDiv.appendChild(viewButton);
        actionDiv.appendChild(deleteButton);
        actionsCell.appendChild(actionDiv);
        
        tr.appendChild(usernameCell);
        tr.appendChild(balanceCell);
        tr.appendChild(winsCell);
        tr.appendChild(lossesCell);
        tr.appendChild(profitCell);
        tr.appendChild(actionsCell);
        
        usersTableBody.appendChild(tr);
    });
}

// 계정 삭제 처리
function handleDeleteUser(userId, username) {
    console.log('계정 삭제 시도:', userId, username);
    
    // 토큰 가져오기
    const token = getToken();
    
    if (!token) {
        console.error('인증 토큰이 없습니다.');
        showMessage('인증 오류가 발생했습니다. 다시 로그인해주세요.', 'error');
        return;
    }
    
    fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('계정 삭제 성공:', username);
            showMessage(`${username} 계정이 성공적으로 삭제되었습니다.`, 'success');
            fetchUsers(); // 사용자 목록 갱신
        } else {
            console.error('계정 삭제 오류:', data.message);
            showMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting user:', error);
        showMessage('서버 오류가 발생했습니다.', 'error');
    });
}

// 드롭다운에 사용자 목록 채우기
function populateUserSelect(users) {
    selectedUser.innerHTML = '<option value="">사용자 선택</option>';
    
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.username} (잔액: $${user.balance.toFixed(2)})`;
        selectedUser.appendChild(option);
    });
}

// 잔액 추가
function handleAddBalance() {
    const userId = selectedUser.value;
    const amount = amountInput.value.trim();
    
    if (!userId || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        showMessage('사용자와 유효한 금액을 선택해주세요.', 'error');
        return;
    }
    
    console.log('잔액 추가 시도:', userId, amount);
    
    // 토큰 가져오기
    const token = getToken();
    
    if (!token) {
        console.error('인증 토큰이 없습니다.');
        showMessage('인증 오류가 발생했습니다. 다시 로그인해주세요.', 'error');
        return;
    }
    
    // 로딩 메시지 표시
    showMessage('처리 중...', 'info');
    
    // 숫자 변환 확인
    const numericAmount = parseFloat(amount);
    console.log('변환된 금액:', numericAmount, typeof numericAmount);
    
    fetch('/api/admin/users/add-balance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
            userId: userId, 
            amount: numericAmount 
        }),
    })
    .then(response => {
        console.log('응답 상태:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('잔액 추가 응답:', data);
        if (data.success) {
            console.log('잔액 추가 성공:', data.message);
            showMessage(data.message, 'success');
            amountInput.value = '';
            fetchUsers(); // 사용자 목록 갱신
        } else {
            console.error('잔액 추가 오류:', data.message);
            showMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error adding balance:', error);
        showMessage('서버 오류가 발생했습니다: ' + error.message, 'error');
    });
}

// 잔액 감소
function handleSubtractBalance() {
    const userId = selectedUser.value;
    const amount = amountInput.value.trim();
    
    if (!userId || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        showMessage('사용자와 유효한 금액을 선택해주세요.', 'error');
        return;
    }
    
    console.log('잔액 감소 시도:', userId, amount);
    
    // 토큰 가져오기
    const token = getToken();
    
    if (!token) {
        console.error('인증 토큰이 없습니다.');
        showMessage('인증 오류가 발생했습니다. 다시 로그인해주세요.', 'error');
        return;
    }
    
    fetch('/api/admin/users/subtract-balance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, amount: parseFloat(amount) }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP 오류 ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('잔액 감소 성공:', data.message);
            showMessage(data.message, 'success');
            amountInput.value = '';
            fetchUsers(); // 사용자 목록 갱신
        } else {
            console.error('잔액 감소 오류:', data.message);
            showMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error subtracting balance:', error);
        showMessage('서버 오류가 발생했습니다.', 'error');
    });
}

// 메시지 표시
function showMessage(message, type) {
    // 메시지가 이미 있다면 제거
    if (balanceMessage.classList.contains('fade-out')) {
        balanceMessage.classList.remove('fade-out');
    }
    
    // 메시지 내용과 스타일 설정
    balanceMessage.textContent = message;
    balanceMessage.className = `message ${type}`;
    
    // 애니메이션 효과 추가
    balanceMessage.style.opacity = '0';
    balanceMessage.style.display = 'block';
    
    // 페이드 인 효과
    setTimeout(() => {
        balanceMessage.style.transition = 'opacity 0.3s ease-in-out';
        balanceMessage.style.opacity = '1';
    }, 10);
    
    // 일정 시간 후 메시지 제거 (성공/오류 메시지만)
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            // 페이드 아웃 효과
            balanceMessage.style.opacity = '0';
            balanceMessage.classList.add('fade-out');
            
            // 완전히 사라진 후 클래스 초기화
            setTimeout(() => {
                balanceMessage.className = 'message';
                balanceMessage.textContent = '';
            }, 300);
        }, 4000);
    }
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
    // 강제 로그아웃 이벤트 처리
    socket.on('forced_logout', (data) => {
        console.log('강제 로그아웃:', data.message);
        
        // 알림 표시
        alert(data.message);
        
        // 로그아웃 처리
        window.handleLogout();
    });
    
    // 잔액 업데이트 이벤트 처리
    socket.on('balance_update', (data) => {
        // 사용자 목록 갱신
        fetchUsers();
    });
}

// 로그인 상태 및 권한 확인을 위한 사용자 정보 가져오기
function getUserInfo() {
    try {
        // 먼저 USER_KEY로 시도
        const USER_KEY = 'user';
        let userJson = localStorage.getItem(USER_KEY);
        
        // USER_KEY로 찾지 못했다면 'auth_user' 키로 시도
        if (!userJson) {
            userJson = localStorage.getItem('auth_user');
        }
        
        if (!userJson) {
            console.error('로컬 스토리지에 사용자 정보가 없음');
            return null;
        }
        
        // JSON 파싱 및 반환
        const userData = JSON.parse(userJson);
        
        // isAdmin 값이 없고 is_admin이 있다면 변환
        if (userData && userData.isAdmin === undefined && userData.is_admin !== undefined) {
            userData.isAdmin = userData.is_admin === 1 || userData.is_admin === true;
            console.log('사용자 정보 조회 - is_admin을 isAdmin으로 변환:', userData.isAdmin);
        }
        
        // admin 계정은 항상 관리자 권한 부여
        if (userData && userData.username && userData.username.toLowerCase() === 'admin') {
            userData.isAdmin = true;
            userData.is_admin = true;
            console.log('admin 계정 확인 - 관리자 권한 설정됨');
        }
        
        return userData;
    } catch (e) {
        console.error('사용자 정보 가져오기 오류:', e);
        return null;
    }
}

// 권한 확인 및 초기화
document.addEventListener('DOMContentLoaded', () => {
    // 로그인 상태 확인
    const token = getToken();
    const user = getUserInfo();
    
    if (!token || !user) {
        // 로그인되어 있지 않으면 로그인 페이지로 리디렉션
        console.error('로그인이 필요합니다: 토큰 또는 사용자 정보 없음');
        window.location.href = 'login.html';
        return;
    }
    
    // 디버깅: 로그인 사용자 정보 출력
    console.log('로그인 사용자 정보:', user);
    
    // 관리자 권한 확인 (다음 중 하나라도 해당되면 관리자로 간주)
    const isAdminUsername = user.username && user.username.toLowerCase() === 'admin';
    const hasAdminFlag = user.isAdmin === true;
    const hasIsAdminFlag = user.is_admin === true || user.is_admin === 1;
    
    const isAdminUser = isAdminUsername || hasAdminFlag || hasIsAdminFlag;
    
    console.log('관리자 권한 확인 결과:', {
        '사용자명': user.username,
        'admin 사용자명 여부': isAdminUsername,
        'isAdmin 속성': hasAdminFlag,
        'is_admin 속성': hasIsAdminFlag,
        '최종 관리자 여부': isAdminUser
    });
    
    if (!isAdminUser) {
        // 관리자가 아니면 메인 페이지로 리디렉션
        console.error('관리자 권한이 없습니다.');
        alert('관리자 권한이 필요합니다.');
        window.location.href = 'index.html';
        return;
    }
    
    // 관리자 이름 표시
    if (adminName) {
        adminName.textContent = user.username || '관리자';
    }
    
    // 전역 객체 설정
    window.app = {
        socket,
        currentUser: user,
        handleLogout
    };
    
    // 이벤트 리스너 설정
    setupEventListeners();
    
    // 소켓 이벤트 리스너 설정
    setupSocketListeners();
    
    // 사용자 목록 초기 로드
    fetchUsers();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 검색 버튼 이벤트
    searchBtn.addEventListener('click', searchUsers);
    userSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchUsers();
    });
    
    // 잔액 추가/감소 버튼 이벤트
    addBalanceBtn.addEventListener('click', handleAddBalance);
    subtractBalanceBtn.addEventListener('click', handleSubtractBalance);
    
    // 계정 삭제 버튼 이벤트
    deleteUserBtn.addEventListener('click', () => {
        const userId = selectedUser.value;
        const selectedOption = selectedUser.options[selectedUser.selectedIndex];
        
        if (!userId) {
            showMessage('사용자를 선택해주세요.', 'error');
            return;
        }
        
        // 사용자 이름 추출 (괄호 이전 텍스트)
        const username = selectedOption.textContent.split(' (')[0];
        
        // 관리자 계정 삭제 방지
        if (username === 'admin') {
            showMessage('관리자 계정은 삭제할 수 없습니다.', 'error');
            return;
        }
        
        // 삭제 확인
        if (confirm(`정말로 "${username}" 계정을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 게임 기록이 삭제됩니다.`)) {
            handleDeleteUser(userId, username);
        }
    });
    
    // 로그아웃
    document.getElementById('admin-logout-btn').addEventListener('click', handleLogout);
}

// 전역으로 노출
window.handleLogout = handleLogout; 