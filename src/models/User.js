const { supabase } = require('../config/database');
const bcrypt = require('bcrypt');

class User {
  // 사용자 생성
  static async create(username, password) {
    return new Promise(async (resolve, reject) => {
      try {
        // 먼저 사용자명 중복 확인
        const { data: existingUser, error: checkError } = await supabase
          .from('users')
          .select('id')
          .eq('username', username)
          .limit(1)
          .single();
        
        // PGRST116 (레코드 찾을 수 없음) 에러는 사용자가 없다는 의미로 정상입니다
        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }
        
        // 이미 사용자가 존재하면 에러 반환
        if (existingUser) {
          return reject(new Error('이미 사용 중인 사용자 이름입니다.'));
        }
        
        // 비밀번호 해싱
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Supabase에 사용자 삽입 - id 필드 직접 지정하지 않고 자동 생성되도록 함
        const { data, error } = await supabase
          .from('users')
          .insert([
            { 
              username, 
              password: hashedPassword,
              balance: 1000,
              wins: 0,
              losses: 0,
              profit: 0,
              is_admin: 0
            }
          ])
          .select();
        
        if (error) {
          // 기본 키 충돌 오류 확인
          if (error.code === '23505') {
            return reject(new Error('사용자 등록 중 충돌이 발생했습니다. 다시 시도해주세요.'));
          }
          throw error;
        }
        
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
        
        // is_admin 값 처리 - 결과가 있는 경우에만
        if (data) {
          // 항상 Boolean 타입으로 변환하여 일관성 유지
          data.is_admin = data.is_admin === true || data.is_admin === 1;
          console.log(`사용자 id=${id} 조회 결과: is_admin=${data.is_admin}, 타입=${typeof data.is_admin}`);
          
          // admin 사용자명은 항상 관리자 권한 부여
          if (data.username && data.username.toLowerCase() === 'admin') {
            data.is_admin = true;
            console.log(`admin 계정 보장: is_admin=${data.is_admin}`);
          }
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
        
        // is_admin 값 처리 - 결과가 있는 경우에만
        if (data) {
          // 항상 Boolean 타입으로 변환하여 일관성 유지
          data.is_admin = data.is_admin === true || data.is_admin === 1;
          console.log(`사용자 username=${username} 조회 결과: is_admin=${data.is_admin}, 타입=${typeof data.is_admin}`);
          
          // admin 사용자명은 항상 관리자 권한 부여
          if (data.username && data.username.toLowerCase() === 'admin') {
            data.is_admin = true;
            console.log(`admin 계정 보장: is_admin=${data.is_admin}`);
          }
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

  // getAllUsers - 관리자 대시보드용
  static async getAllUsers() {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('username', { ascending: true });
        
        if (error) throw error;
        
        // 모든 사용자의 is_admin 값 처리
        if (data && Array.isArray(data)) {
          data.forEach(user => {
            // 항상 Boolean 타입으로 변환하여 일관성 유지
            user.is_admin = user.is_admin === true || user.is_admin === 1;
            
            // admin 사용자명은 항상 관리자 권한 부여
            if (user.username && user.username.toLowerCase() === 'admin') {
              user.is_admin = true;
            }
            
            // isAdmin 속성도 추가하여 클라이언트 코드와 일관성 유지
            user.isAdmin = user.is_admin;
          });
          
          console.log(`관리자 대시보드용 ${data.length}명의 사용자 목록 조회 완료`);
        }
        
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  // searchUsers - 관리자 사용자 검색용
  static async searchUsers(query) {
    return new Promise(async (resolve, reject) => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .ilike('username', `%${query}%`)
          .order('username', { ascending: true });
        
        if (error) throw error;
        
        // 모든 사용자의 is_admin 값 처리
        if (data && Array.isArray(data)) {
          data.forEach(user => {
            // 항상 Boolean 타입으로 변환하여 일관성 유지
            user.is_admin = user.is_admin === true || user.is_admin === 1;
            
            // admin 사용자명은 항상 관리자 권한 부여
            if (user.username && user.username.toLowerCase() === 'admin') {
              user.is_admin = true;
            }
            
            // isAdmin 속성도 추가하여 클라이언트 코드와 일관성 유지
            user.isAdmin = user.is_admin;
          });
          
          console.log(`검색어 "${query}"로 ${data.length}명의 사용자 검색 완료`);
        }
        
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
        // 먼저 현재 사용자 정보 가져오기
        const { data: user, error: selectError } = await supabase
          .from('users')
          .select('balance, username')
          .eq('id', userId)
          .single();
        
        if (selectError) throw selectError;
        if (!user) throw new Error('사용자를 찾을 수 없습니다.');
        
        console.log(`사용자 ${user.username}의 현재 잔액: ${user.balance}, 추가할 금액: ${amount}`);
        
        // 새 잔액 계산
        const newBalance = user.balance + parseFloat(amount);
        
        // 잔액 업데이트
        const { data, error: updateError } = await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('id', userId)
          .select();
        
        if (updateError) throw updateError;
        
        console.log(`잔액 업데이트 완료: ${user.balance} -> ${newBalance}`);
        
        resolve({ 
          changes: 1, 
          newBalance: data[0].balance,
          username: user.username
        });
      } catch (error) {
        console.error('잔액 추가 오류:', error);
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
          // 데이터베이스에서 반환된 값이 boolean이나 숫자일 수 있으므로 두 경우 모두 처리
          if (data.is_admin === true || data.is_admin === 1) {
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