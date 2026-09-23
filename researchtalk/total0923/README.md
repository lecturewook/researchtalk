# researchtalk 앱 코드

처음 설치하는 순서는 압축 루트의 `시작안내.md`를 따릅니다. 기본 배포 대상은 이 `app` 폴더입니다.

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면·디자인·동작 코드를 합친 실제 실행 파일 |
| `source/index.template.html` | 수정용 한국어 화면 구조 |
| `styles.css` | 모바일 화면, 달력, 말풍선, 입력창 디자인 |
| `app.js` | 화면 전환·입력·달력·대화·초대 화면 |
| `storage.js` | **로그인·저장·불러오기·초대 참여·실시간 연결·localStorage 전체** |
| `dates.js` | 기기의 현지 날짜·요일·달력 계산 |
| `config.js` | Supabase 공개 주소·공개 키, AI 사용 여부 |
| `summary.js` | 선택 기능인 하루 AI 요약 요청 |
| `vendor/` | 앱에 포함한 Supabase 자바스크립트 도구와 라이선스 |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA 설치 정보, 오프라인 화면, 아이콘 |
| `build.mjs` | 수정용 파일을 단일 실행 파일로 묶는 도구 |
| `vercel.json` | Vercel 정적 배포 설정 |

저장 구조를 바꿀 때는 `storage.js`를 수정합니다. 서버 DB의 권한과 저장 처리는 `supabase/01-researchtalk.sql`에 있습니다. Supabase Auth·DB·Realtime을 쓰며 별도의 앱 서버를 운영할 필요는 없습니다.

원본 파일 수정 후 Node.js가 설치된 컴퓨터에서 이 폴더를 열고 실행합니다. 받은 파일은 이미 빌드했습니다.

```sh
npm run build
```

이 빌드는 패키지 설치 없이 실행합니다. 다시 배포할 때는 `sw.js`의 `researchtalk-shell-v2`를 `researchtalk-shell-v3`처럼 올립니다. 새 버전 파일이 준비된 후 앱 창을 모두 닫았다 다시 엽니다.

컴퓨터에서 수정 화면을 바로 보려면 Node.js 22.12 이상에서 다음 명령을 사용합니다.

```sh
npm install
npm run dev
```

터미널에 나오는 localhost 주소를 브라우저로 엽니다. 원본 파일을 바꾸면 화면에 반영됩니다. 이 개발 도구는 배포 앱의 서버가 아닙니다.

사귄 날짜와 기념일 기능은 없습니다. 앱·아이콘 이름은 `researchtalk`입니다. 코드에 실제 비밀번호, Supabase 비밀 키 또는 AI 키를 넣지 않습니다.
