// 환경 변수 확인 스크립트
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 루트 디렉토리의 .env 파일 경로
const envPath = path.resolve(__dirname, '../../.env');
console.log('환경 변수 파일 경로:', envPath);

// .env 파일이 있는지 확인
if (fs.existsSync(envPath)) {
  console.log('.env 파일이 존재합니다.');
  
  // .env 파일 내용 읽기
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('.env 파일 내용:');
  console.log(envContent);
  
  // 환경 변수 로드
  dotenv.config({ path: envPath });
} else {
  console.log('.env 파일이 존재하지 않습니다.');
}

// Supabase 관련 환경 변수 확인
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', supabaseUrl ? '설정됨' : '설정되지 않음');
console.log('SUPABASE_ANON_KEY:', supabaseKey ? '설정됨' : '설정되지 않음');

// 설정된 모든 환경 변수 출력
console.log('\n모든 환경 변수:');
Object.keys(process.env).forEach(key => {
  if (key.includes('SUPABASE') || key.includes('JWT') || key.includes('SESSION')) {
    console.log(`${key}: ${process.env[key] ? '값이 설정됨' : '값이 설정되지 않음'}`);
  }
}); 