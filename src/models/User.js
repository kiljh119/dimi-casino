const { supabase } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  // 사용자 생성
  static async create(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Supabase에 사용자 삽입
        const { data, error } = await supabase
          .from('users')
          .insert([
            { username, password: hashedPassword }
          ])
          .select();
        
        if (error) throw error;
        
        resolve(data[0].id);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 로그인 처리
  static async login(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        // 사용자 검색
        const { data: users, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .limit(1);
        
        if (error) throw error;
        
        const user = users[0];
        
        if (!user) {
          return resolve(null);
        }
        
        // 비밀번호 검증
        const isValid = await bcrypt.compare(password, user.password);
        
        if (isValid) {
          resolve(user);
        } else {
          resolve(null);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  // 아이디로 찾기
  static async findById(id) {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', id)
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') { // Record Not Found 에러가 아닌 경우에만 예외 처리
          throw error;
        }
        
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 사용자 이름으로 찾기
  static async findByUsername(username) {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('username', username)
          .limit(1)
          .single();
        
        if (error && error.code !== 'PGRST116') { // Record Not Found 에러가 아닌 경우에만 예외 처리
          throw error;
        }
        
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 모든 사용자 가져오기
  static async findAll() {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 잔액 업데이트 및 승패 기록
  static async updateBalance(userId, amount, isWin, isTransaction = false) {
    return new Promise(async (resolve, reject) => {
      try {
        // 현재 사용자 데이터 가져오기
        const { data: user, error: selectError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (selectError) throw selectError;
        
        // 잔액 계산
        let newBalance = 0;
        let newWins = user.wins;
        let newLosses = user.losses;
        let newProfit = user.profit;
        
        if (isWin) {
          newBalance = user.balance + amount;
          newWins += 1;
          newProfit += amount;
        } else {
          newBalance = user.balance - amount;
          newLosses += 1;
          newProfit -= amount;
        }
        
        // 잔액 및 통계 업데이트
        const { data, error: updateError } = await supabase
          .from('users')
          .update({
            balance: newBalance,
            wins: newWins,
            losses: newLosses,
            profit: newProfit
          })
          .eq('id', userId)
          .select();
        
        if (updateError) throw updateError;
        
        resolve(data[0]);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 잔액 추가 (관리자용)
  static async addBalance(userId, amount) {
    return new Promise(async (resolve, reject) => {
      try {
        // 잔액 업데이트
        const { data, error } = await supabase
          .from('users')
          .update({ balance: supabase.raw(`balance + ${amount}`) })
          .eq('id', userId)
          .select();
        
        if (error) throw error;
        
        resolve({ changes: 1, newBalance: data[0].balance });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // 관리자용 - 잔액 감소
  static async subtractBalance(userId, amount) {
    return new Promise(async (resolve, reject) => {
      try {
        // 먼저 현재 잔액을 확인하여 마이너스가 되지 않도록 함
        const { data: user, error: selectError } = await supabase
          .from('users')
          .select('balance')
          .eq('id', userId)
          .single();
        
        if (selectError) throw selectError;
        if (!user) throw new Error('사용자를 찾을 수 없습니다.');
        
        // 차감할 금액이 현재 잔액보다 많으면 현재 잔액만큼만 차감
        const deductAmount = Math.min(amount, user.balance);
        
        // 잔액 업데이트
        const { data, error: updateError } = await supabase
          .from('users')
          .update({ balance: user.balance - deductAmount })
          .eq('id', userId)
          .select();
        
        if (updateError) throw updateError;
        
        resolve({
          changes: 1,
          deductedAmount: deductAmount,
          newBalance: data[0].balance
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // 관리자용 - 계정 삭제
  static async deleteUser(userId) {
    return new Promise(async (resolve, reject) => {
      try {
        // 관리자 계정은 삭제 불가
        const { data: user, error: selectError } = await supabase
          .from('users')
          .select('username')
          .eq('id', userId)
          .single();
        
        if (selectError) throw selectError;
        if (!user) throw new Error('사용자를 찾을 수 없습니다.');
        
        if (user.username === 'admin') {
          throw new Error('관리자 계정은 삭제할 수 없습니다.');
        }
        
        // 사용자의 게임 히스토리 삭제
        const { error: gameHistoryError } = await supabase
          .from('game_history')
          .delete()
          .eq('user_id', userId);
        
        if (gameHistoryError) throw gameHistoryError;
        
        // 사용자 계정 삭제
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', userId);
        
        if (deleteError) throw deleteError;
        
        resolve({
          success: true,
          message: '계정이 성공적으로 삭제되었습니다.',
          changes: 1
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 관리자 계정 확인 메서드 추가
  static isAdmin(userId) {
    return new Promise((resolve, reject) => {
      supabase
        .from('users')
        .select('is_admin')
        .eq('id', userId)
        .single()
        .then(data => {
          if (data.is_admin === 1) {
            resolve(true);
          } else {
            resolve(false);
          }
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  // 관리자 계정 수정 (비밀번호 변경)
  static updateAdminPassword(adminId, newPassword) {
    return new Promise(async (resolve, reject) => {
      try {
        // 관리자 확인
        const isAdmin = await this.isAdmin(adminId);
        if (!isAdmin) {
          return reject(new Error('관리자 계정이 아닙니다.'));
        }
        
        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        supabase
          .from('users')
          .update({ password: hashedPassword })
          .eq('id', adminId)
          .eq('is_admin', 1)
          .then(data => {
            resolve({
              success: true,
              message: '관리자 비밀번호가 변경되었습니다.',
              changes: data.length
            });
          })
          .catch(error => {
            reject(error);
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 일반 사용자 비밀번호 변경
  static updatePassword(userId, newPassword) {
    return new Promise(async (resolve, reject) => {
      try {
        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        supabase
          .from('users')
          .update({ password: hashedPassword })
          .eq('id', userId)
          .then(data => {
            resolve({
              success: true,
              message: '비밀번호가 변경되었습니다.',
              changes: data.length
            });
          })
          .catch(error => {
            reject(error);
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  // Top 랭킹 가져오기
  static async getTopRankings(limit = 10) {
    return new Promise(async (resolve, reject) => {
      try {
        // Supabase를 사용해서 랭킹 정보 가져오기
        const { data, error } = await supabase
          .from('users')
          .select('username, balance, wins, losses, profit')
          .order('profit', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        // 랭킹 정보 포맷팅
        const rankings = data.map((user, index) => ({
          rank: index + 1,
          username: user.username,
          balance: user.balance,
          wins: user.wins,
          losses: user.losses,
          profit: user.profit
        }));
        
        resolve(rankings);
      } catch (error) {
        console.error('랭킹 정보 조회 오류:', error);
        // 오류 발생 시 빈 배열 반환
        resolve([]);
      }
    });
  }
}

module.exports = User; 