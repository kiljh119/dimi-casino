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
        
        actionDiv.appendChild(viewButton);
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
    
    // 잔액 관리 버튼 이벤트
    addBalanceBtn.addEventListener('click', handleAddBalance);
    subtractBalanceBtn.addEventListener('click', handleSubtractBalance);
} 