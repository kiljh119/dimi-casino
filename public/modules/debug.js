// 디버깅용 모듈 - 로컬 스토리지 사용자 정보 확인

// 로컬 스토리지에서 사용자 정보 확인
function checkLocalStorageUser() {
  try {
    // 사용자 정보 키
    const USER_KEY = 'user';
    
    // 로컬 스토리지에서 사용자 정보 가져오기
    const userString = localStorage.getItem(USER_KEY);
    
    if (!userString) {
      console.warn('로컬 스토리지에 사용자 정보가 없습니다.');
      return null;
    }
    
    // JSON 파싱
    const userData = JSON.parse(userString);
    
    // 사용자 정보 및 관리자 여부 출력
    console.log('로컬 스토리지 사용자 정보:', userData);
    console.log('사용자명:', userData.username);
    console.log('isAdmin 값:', userData.isAdmin);
    console.log('관리자 여부:', userData.isAdmin === true);
    
    return userData;
  } catch (error) {
    console.error('로컬 스토리지 확인 오류:', error);
    return null;
  }
}

// 전역 함수로 노출
window.checkLocalStorageUser = checkLocalStorageUser;

export { checkLocalStorageUser }; 