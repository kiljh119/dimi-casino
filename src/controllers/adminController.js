const User = require('../models/User');

// 관리자 권한 확인 미들웨어
const isAdmin = (req, res, next) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
};

// 모든 사용자 조회
exports.getAllUsers = [isAdmin, async (req, res) => {
  try {
    const users = await User.getAllUsers();
    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: '사용자 목록 조회 중 오류가 발생했습니다.' });
  }
}];

// 사용자 검색
exports.searchUsers = [isAdmin, async (req, res) => {
  const { query } = req.query;
  
  if (!query) {
    return res.status(400).json({ success: false, message: '검색어를 입력해주세요.' });
  }
  
  try {
    const users = await User.searchUsers(query);
    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: '사용자 검색 중 오류가 발생했습니다.' });
  }
}];

// 잔액 추가
exports.addBalance = [isAdmin, async (req, res) => {
  const { userId, amount } = req.body;
  
  if (!userId || !amount) {
    return res.status(400).json({ success: false, message: '사용자 ID와 금액을 모두 입력해주세요.' });
  }
  
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: '유효한 금액을 입력해주세요.' });
  }
  
  try {
    await User.addBalance(userId, parseFloat(amount));
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: `${user.username}님의 잔액이 ${amount}만큼 증가되었습니다.`,
      newBalance: user.balance
    });
  } catch (error) {
    console.error('Add balance error:', error);
    res.status(500).json({ success: false, message: '잔액 추가 중 오류가 발생했습니다.' });
  }
}];

// 잔액 감소
exports.subtractBalance = [isAdmin, async (req, res) => {
  const { userId, amount } = req.body;
  
  if (!userId || !amount) {
    return res.status(400).json({ success: false, message: '사용자 ID와 금액을 모두 입력해주세요.' });
  }
  
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: '유효한 금액을 입력해주세요.' });
  }
  
  try {
    const result = await User.subtractBalance(userId, parseFloat(amount));
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 실제로 차감된 금액이 요청된 금액보다 적을 경우
    if (result.deductedAmount < amount) {
      res.status(200).json({ 
        success: true, 
        message: `${user.username}님의 잔액이 ${result.deductedAmount}만큼 감소되었습니다. (잔액 부족으로 일부만 차감)`,
        newBalance: user.balance
      });
    } else {
      res.status(200).json({ 
        success: true, 
        message: `${user.username}님의 잔액이 ${amount}만큼 감소되었습니다.`,
        newBalance: user.balance
      });
    }
  } catch (error) {
    console.error('Subtract balance error:', error);
    res.status(500).json({ success: false, message: '잔액 감소 중 오류가 발생했습니다.' });
  }
}];

// 계정 삭제
exports.deleteUser = [isAdmin, async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ success: false, message: '사용자 ID를 입력해주세요.' });
  }
  
  try {
    // 삭제 전 사용자 정보 조회 (나중에 응답에 사용)
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    const username = user.username;
    
    // 계정 삭제 진행
    const result = await User.deleteUser(userId);
    
    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: `${username} 계정이 성공적으로 삭제되었습니다.`,
        deletedUsername: username
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: '계정 삭제에 실패했습니다.'
      });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: `계정 삭제 중 오류가 발생했습니다: ${error.message}`
    });
  }
}]; 