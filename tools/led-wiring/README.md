# LED 배선도면

직원 테스트 주소: https://solmelab.com/tools/led-wiring/

홈페이지 메뉴에는 링크를 추가하지 않는다. 검색 엔진에는 `noindex`를 지정하고
사이트맵에서 제외한다. 로그인 기능은 없으므로 주소를 아는 사람은 접속할 수 있다.

## 실행과 테스트

- Windows에서 `start.bat`을 실행한 뒤 http://localhost:8765/index.html 에 접속한다.
  Python이 필요하며, `file://`로 열면 픽셀 데이터를 읽을 수 없다.
- 이 폴더에서 `npm test`를 실행한다. PowerShell 실행 정책으로 막히면 `npm.cmd test`를 사용한다.
- Python과 `openpyxl`이 있으면 엑셀 출력 파일도 검증한다. 없으면 해당 검사만 건너뛴다.

## 집 컴퓨터에서 처음 이어서 작업하기

1. Git, VS Code, Node.js(LTS), Python을 설치한다. Python 설치 시 PATH 추가 옵션을 선택한다.
2. VS Code에서 `Ctrl + Shift + P`를 누르고 **Git: Clone / Git: 복제**를 선택한다.
3. 저장소 주소 `https://github.com/solml2192ma/sol-medialab-site.git`를 입력한다.
4. 저장할 폴더를 선택하고, 복제가 끝나면 저장소 폴더를 연다.
5. Codex를 열고 아래 문구로 작업을 시작한다.

```text
tools/led-wiring/README.md와 tools/led-wiring/AGENTS.md를 끝까지 읽고 이어서 작업해줘.
먼저 tools/led-wiring에서 npm test를 실행하고 결과를 알려줘.
확정 규칙과 UI 규칙을 지키고, start.bat으로 테스트 화면도 켜줘.
내가 배포하라고 하기 전에는 main에 push하지 마.
```

복제하면 코드와 이 안내 파일을 함께 받을 수 있다. 이 파일은 집에서 이어갈 작업 안내이며,
채팅 기록 자체를 Git으로 옮기는 기능은 아니다. 확정 규칙은 `AGENTS.md`를 기준으로 한다.

### 회사와 집 사이 작업 순서

- 작업 시작 전: **Pull**로 해당 브랜치의 최신 코드를 받는다.
- 작업 종료 시: 수정 사항을 테스트하고 **Commit → Push**한다.
- 다른 컴퓨터에서는 같은 브랜치로 전환한 뒤 **Pull**한다.
- `main`에 push하면 실제 홈페이지에 자동 배포된다. 배포 전 수정 사항을 주고받을 때는
  별도 작업 브랜치를 만들고 양쪽 컴퓨터에서 같은 브랜치를 사용한다.
- 로컬 수정이 남아 Pull이 막히면 먼저 변경 내용을 확인한다. 강제 덮어쓰기나 초기화를 하지 않는다.
- 도면의 입력값과 직접 그린 배선은 Git으로 동기화되지 않는다. 이어서 볼 도면은 전체 URL을 따로 보관한다.

2026-10-16 기준: 직원 테스트용 배포 완료, 테스트 67개 모두 통과.
홈페이지 메뉴 링크는 추가하지 않았고, 검색 제외 설정을 적용했다.

## 폴더 구조

- `index.html`, `style.css`: 입력 화면과 스타일
- `assets/`: 회사 로고
- `data/pixel.json`: 픽셀피치, 캐비닛 선택과 박스 수량
- `src/config.js`: 계산 규칙과 기본값
- `src/calc.js`, `src/layout.js`, `src/rowplan.js`, `src/cabinet.js`: 계산과 배치
- `src/render.js`, `src/report.js`: 도면과 자재표
- `src/ui.js`: 화면 조작과 URL/브라우저 저장
- `src/export.js`, `src/xlsx.js`: PNG, PDF/인쇄, 엑셀 내보내기
- `test/`: 계산과 내보내기 검증
- `AGENTS.md`: 확정 규칙과 작업 지침

## 배포

빌드나 npm 패키지 설치가 필요 없는 정적 웹 도구다. 이 저장소의 `main` 브랜치에
변경을 push하면 기존 GitHub Pages 배포를 통해 위 주소에 반영된다.
루트 `_config.yml`에서 테스트, 개발용 실행 파일과 문서를 배포에서 제외한다.
계산 규칙을 바꾸기 전에는 `AGENTS.md`를 확인하고, 계산 변경 시 테스트를 추가한다.

## 직원 피드백

문제를 재현할 수 있도록 도면의 전체 주소(URL), 화면 캡처, 기대한 결과와 실제 결과를 함께 받는다.
입력값과 배선은 브라우저와 URL에 저장되므로 도면 주소를 공유하면 같은 배치를 확인할 수 있다.
사용 중인 화면을 저장하려면 PNG/PDF/엑셀 내보내기를 이용한다.
