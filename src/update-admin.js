const { supabase } = require('./config/database');

async function updateAdmin() {
  try {
    console.log('관리자 계정 업데이트 시작...');
    
    // 먼저 admin 계정이 있는지 확인
    const { data: adminUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('username', 'admin')
      .single();
    
    if (findError) {
      console.error('관리자 계정 찾기 오류:', findError.message);
      if (findError.code === 'PGRST116') {
        console.log('관리자 계정이 없습니다. 새로 생성합니다.');
        // 관리자 계정 생성 로직 추가 필요
      } else {
        throw findError;
      }
    } else {
      console.log('현재 관리자 계정 정보:', adminUser);
      
      // 관리자 권한 업데이트
      const { data, error } = await supabase
        .from('users')
        .update({ is_admin: true })
        .eq('username', 'admin')
        .select();
      
      if (error) {
        console.error('관리자 권한 업데이트 오류:', error.message);
        throw error;
      }
      
      console.log('관리자 권한 업데이트 성공:', data);
    }
    
    console.log('관리자 계정 업데이트 완료');
  } catch (err) {
    console.error('오류 발생:', err);
  }
}

// 함수 실행
updateAdmin().then(() => {
  console.log('스크립트 종료');
}); 