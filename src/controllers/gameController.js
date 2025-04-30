const GameHistory = require('../models/GameHistory');
const User = require('../models/User');

// 게임 히스토리 조회 컨트롤러
exports.getHistory = async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }

  try {
    const history = await GameHistory.getUserHistory(req.session.userId);
    res.status(200).json({ success: true, history });
  } catch (error) {
    console.error('History retrieval error:', error);
    res.status(500).json({ success: false, message: '히스토리 조회 중 오류가 발생했습니다.' });
  }
};

// 랭킹 조회 컨트롤러
exports.getRankings = async (req, res) => {
  try {
    const rankings = await User.getTopRankings();
    res.status(200).json({ success: true, rankings });
  } catch (error) {
    console.error('Rankings retrieval error:', error);
    res.status(500).json({ success: false, message: '랭킹 조회 중 오류가 발생했습니다.' });
  }
}; 