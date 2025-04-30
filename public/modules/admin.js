// 관리자 모듈

// DOM 요소
const adminScreen = document.getElementById('admin-screen');
const userSearch = document.getElementById('user-search');
const searchBtn = document.getElementById('search-btn');
const usersTableBody = document.getElementById('users-table-body');
const selectedUser = document.getElementById('selected-user');
const amountInput = document.getElementById('amount');
const addBalanceBtn = document.getElementById('add-balance');
const subtractBalanceBtn = document.getElementById('subtract-balance');
const deleteUserBtn = document.getElementById('delete-user'); // 계정 삭제 버튼
const balanceMessage = document.getElementById('balance-message');

// 전역 변수
let allUsers = []; // 모든 사용자 목록

// 사용자 목록 조회
function fetchUsers() {
    fetch('/api/admin/users')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                allUsers = data.users;
                renderUsers(data.users);
                populateUserSelect(data.users);
            }
        })
        .catch(error => {
            console.error('Error fetching users:', error);
        });
}

// 사용자 검색
function searchUsers() {
    const query = userSearch.value.trim();
    if (!query) {
        renderUsers(allUsers);
        return;
    }
    
    fetch(`/api/admin/users/search?query=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderUsers(data.users);
            }
        })
        .catch(error => {
            console.error('Error searching users:', error);
        });
}

// 사용자 목록 렌더링
function renderUsers(users) {
    usersTableBody.innerHTML = '';
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        
        const usernameCell = document.createElement('td');
        usernameCell.textContent = user.username;
        
        const balanceCell = document.createElement('td');
        balanceCell.textContent = `$${user.balance.toFixed(2)}`;
        
        const winsCell = document.createElement('td');
        winsCell.textContent = user.wins || 0;
        
        const lossesCell = document.createElement('td');
        lossesCell.textContent = user.losses || 0;
        
        const profitCell = document.createElement('td');
        profitCell.textContent = `$${user.profit.toFixed(2)}`;
        profitCell.className = user.profit >= 0 ? 'positive' : 'negative';
        
        const actionsCell = document.createElement('td');
        const actionDiv = document.createElement('div');
        actionDiv.className = 'user-actions';
        
        const viewButton = document.createElement('button');
        viewButton.className = 'view-btn';
        viewButton.textContent = '보기';
        viewButton.addEventListener('click', () => {
            selectedUser.value = user.id;
            amountInput.focus();
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-btn';
        deleteButton.textContent = '삭제';
        deleteButton.style.backgroundColor = '#f44336';
        deleteButton.style.color = 'white';
        deleteButton.style.marginLeft = '5px';
        
        // 관리자 계정은 삭제 버튼 비활성화
        if (user.username === 'admin') {
            deleteButton.disabled = true;
            deleteButton.style.backgroundColor = '#ccc';
            deleteButton.style.cursor = 'not-allowed';
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
    fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(`${username} 계정이 성공적으로 삭제되었습니다.`, 'success');
            fetchUsers(); // 사용자 목록 갱신
        } else {
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
    
    fetch('/api/admin/users/add-balance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, amount: parseFloat(amount) }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(data.message, 'success');
            amountInput.value = '';
            fetchUsers(); // 사용자 목록 갱신
        } else {
            showMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error adding balance:', error);
        showMessage('서버 오류가 발생했습니다.', 'error');
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
    
    fetch('/api/admin/users/subtract-balance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, amount: parseFloat(amount) }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage(data.message, 'success');
            amountInput.value = '';
            fetchUsers(); // 사용자 목록 갱신
        } else {
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
    balanceMessage.textContent = message;
    balanceMessage.className = `message ${type}`;
    
    // 3초 후 메시지 제거
    setTimeout(() => {
        balanceMessage.textContent = '';
        balanceMessage.className = 'message';
    }, 3000);
}

// 관리자 모듈 초기화
export function initAdmin(socket) {
    // 관리자 페이지 진입 시 사용자 목록 조회
    document.getElementById('go-to-admin').addEventListener('click', fetchUsers);
    
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
    
    // 메뉴로 돌아가기
    document.getElementById('admin-back-to-menu').addEventListener('click', () => {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));
        document.getElementById('main-menu-screen').classList.remove('hidden');
    });
    
    // 로그아웃
    document.getElementById('admin-logout-btn').addEventListener('click', () => {
        window.handleLogout(); // 전역으로 노출된 로그아웃 함수 사용
    });
} 