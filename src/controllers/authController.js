const User = require('../models/User');
const bcrypt = require('bcrypt');
const { generateToken } = require('../config/jwt');

// 회원가입 컨트롤러
exports.register = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  // admin 이름으로 가입 방지
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
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
};

// 로그인 컨트롤러
exports.login = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '사용자 이름과 비밀번호를 모두 입력해주세요.' });
  }

  // 관리자 로그인 처리
  if (username === 'admin') {
    if (password === 'thisisadmin') {
      // 관리자 세션 설정
      req.session.userId = 'admin';
      req.session.username = 'admin';
      req.session.isAdmin = true;
      
      // 관리자용 JWT 토큰 생성
      const token = generateToken({
        id: 'admin',
        username: 'admin',
        isAdmin: true
      });
      
      return res.status(200).json({ 
        success: true, 
        message: '관리자 로그인 성공',
        user: {
          id: 'admin',
          username: 'admin',
          isAdmin: true
        },
        token
      });
    } else {
      return res.status(400).json({ success: false, message: '관리자 비밀번호가 잘못되었습니다.' });
    }
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
    
    // 세션에 사용자 정보 저장 (세션 + JWT 하이브리드 방식)
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = false;
    
    // JWT 토큰 생성
    const token = generateToken({
      id: user.id,
      username: user.username,
      isAdmin: false
    });
    
    res.status(200).json({ 
      success: true, 
      message: '로그인 성공',
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance,
        isAdmin: false
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
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, message: '토큰이 제공되지 않았습니다.' });
  }
  
  try {
    const { verifyToken } = require('../config/jwt');
    const result = verifyToken(token);
    
    if (!result.valid) {
      return res.status(401).json({ success: false, message: '유효하지 않은 토큰입니다.' });
    }
    
    // 사용자 정보 조회 (admin 계정 제외)
    if (result.decoded.id !== 'admin') {
      const user = await User.findById(result.decoded.id);
      
      if (!user) {
        return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
      }
      
      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          balance: user.balance,
          isAdmin: false
        }
      });
    } else {
      // 관리자인 경우
      return res.status(200).json({
        success: true,
        user: {
          id: 'admin',
          username: 'admin',
          isAdmin: true
        }
      });
    }
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}; 