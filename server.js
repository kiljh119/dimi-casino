// .env 파일을 로드하여 환경 변수 설정
require('dotenv').config();

// 모듈화된 애플리케이션으로 리디렉션
require('./src/app');

// 서버 포트 설정 (환경 변수 또는 기본값 3000)
const PORT = process.env.PORT || 3000;