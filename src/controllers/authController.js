const User = require('../models/User');
const bcrypt = require('bcrypt');
const { generateToken } = require('../config/jwt');

// 회원가입 컨트롤러
exports.register = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  // admin 이름으로 가입 방지 (단순히 문자열 비교)
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ success: false, message: '이 사용자 이름은 사용할 수 없습니다.' });
  }

  try {
    // 사용자 이름 중복 확인
    const existingUser = await User.findByUsername(username);
    
    if (existingUser) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 사용자 이름입니다.' });
    }
    
    // 사용자 등록
    const userId = await User.create(username, password);
    
    // 새로 생성된 사용자 정보 조회
    const user = await User.findById(userId);
    
    // JWT 토큰 생성
    const token = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: false
    });
    
    res.status(201).json({
      success: true, 
      message: '회원가입이 완료되었습니다.',
      userId,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    // 구체적인 에러 메시지 처리
    if (error.message && error.message.includes('이미 사용 중인 사용자 이름입니다')) {
      return res.status(400).json({ success: false, message: '이미 사용 중인 사용자 이름입니다.' });
    }
    
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: '사용자 등록 중 충돌이 발생했습니다. 다시 시도해주세요.' });
    }
    
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 로그인 컨트롤러
exports.login = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  try {
    const user = await User.findByUsername(username);
    
    if (!user) {
      return res.status(400).json({ success: false, message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
    }
    
    // 비밀번호 확인
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: '사용자 이름 또는 비밀번호가 잘못되었습니다.' });
    }
    
    // admin 계정인 경우 항상 관리자 권한 부여
    const isAdminUser = user.username.toLowerCase() === 'admin';
    const isAdmin = isAdminUser || user.is_admin === 1;
    
    // 세션에 사용자 정보 저장 (세션 + JWT 하이브리드 방식)
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = isAdmin;
    
    // JWT 토큰 생성
    const token = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: isAdmin
    });
    
    res.status(200).json({ 
      success: true, 
      message: '로그인 성공',
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: isAdmin
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 로그아웃 컨트롤러
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: '로그아웃 중 오류가 발생했습니다.' });
    }
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true, message: '로그아웃 되었습니다.' });
  });
};

// 토큰 검증 컨트롤러 (자동 로그인용)
exports.verifyToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  let token = req.body.token;
  
  // Authorization 헤더가 있는 경우 그것을 사용
  if (authHeader && !token) {
    token = authHeader.split(' ')[1];
  }
  
  if (!token) {
    return res.status(400).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
  }
  
  try {
    console.log('토큰 검증 시도:', token.substring(0, 20) + '...');
    const { verifyToken, generateToken } = require('../config/jwt');
    const result = verifyToken(token);
    
    if (!result.valid) {
      console.error('토큰 검증 실패:', result.error);
      return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
    
    // 사용자 정보 조회
    const user = await User.findById(result.decoded.id);
    
    if (!user) {
      console.error('사용자를 찾을 수 없음:', result.decoded.id);
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // admin 계정인 경우 항상 관리자 권한 부여
    const isAdminUser = user.username.toLowerCase() === 'admin';
    const isAdmin = isAdminUser || user.is_admin === 1;
    
    // 새 토큰 생성
    const newToken = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: isAdmin
    });
    
    console.log('새 토큰 생성 완료:', newToken.substring(0, 20) + '...');
    
    return res.status(200).json({
      success: true,
      token: newToken,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: isAdmin
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 사용자 상세 정보 가져오기
exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        wins: user.wins || 0,
        losses: user.losses || 0,
        profit: user.profit || 0,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 비밀번호 변경
exports.changePassword = async (req, res) => {
  console.log('비밀번호 변경 API 호출됨', req.session);
  console.log('요청 바디:', req.body);
  
  const { currentPassword, newPassword, confirmPassword } = req.body;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: '모든 필드를 입력해주세요.' });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.' });
  }
  
  // 비밀번호 복잡성 검사
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' });
  }
  
  try {
    const userId = req.session.userId;
    console.log('사용자 ID:', userId);
    
    if (!userId) {
      return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    
    // 현재 비밀번호 확인
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
    }
    
    // 비밀번호 변경
    const result = await User.updatePassword(userId, newPassword);
    
    res.status(200).json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}; 