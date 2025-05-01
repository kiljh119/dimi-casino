const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 데이터베이스 경로 설정
const dbPath = path.join(__dirname, '../database.sqlite');

console.log('데이터베이스 경로:', dbPath);

// 데이터베이스 연결
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('데이터베이스에 연결되었습니다.');
  
  // admin 계정 정보 조회
  db.get("SELECT * FROM users WHERE username = 'admin'", [], (err, row) => {
    if (err) {
      console.error('조회 오류:', err.message);
      db.close();
      return;
    }
    
    if (row) {
      console.log('현재 admin 계정 상태:', row);
      
      // admin 계정의 is_admin 값을 1(true)로 설정
      db.run("UPDATE users SET is_admin = 1 WHERE username = 'admin'", [], function(err) {
        if (err) {
          console.error('업데이트 오류:', err.message);
        } else {
          console.log('admin 계정이 성공적으로 관리자 권한으로 업데이트되었습니다.', this.changes, '개 행이 수정됨');
          
          // 변경 후 정보 확인
          db.get("SELECT * FROM users WHERE username = 'admin'", [], (err, updatedRow) => {
            if (err) {
              console.error('조회 오류:', err.message);
            } else {
              console.log('업데이트 후 admin 계정 상태:', updatedRow);
            }
            
            // 데이터베이스 연결 종료
            db.close();
          });
        }
      });
    } else {
      console.log('admin 계정이 존재하지 않습니다.');
      db.close();
    }
  });
}); 