# GPTini VSCode Extension 설치 가이드

VSCode 마켓플레이스를 통하지 않고 `.vsix` 파일로 직접 설치하는 방법입니다.

---

## 사전 준비

- [Node.js](https://nodejs.org) 18 이상
- [VS Code](https://code.visualstudio.com) 1.75 이상
- Git

---

## 1단계 — 레포 클론 및 의존성 설치

```bash
git clone https://github.com/Gptini/gptini-vscode.git
cd gptini-vscode
npm install
```

---

## 2단계 — .vsix 파일 빌드

### vsce 설치 (처음 한 번만)

```bash
npm install -g @vscode/vsce
```

### 패키징

```bash
vsce package
```

실행 후 프로젝트 루트에 `gptini-0.0.1.vsix` 파일이 생성됩니다.

---

## 3단계 — VSCode에 설치

### 방법 A — 명령어 (추천)

```bash
code --install-extension gptini-0.0.1.vsix
```

### 방법 B — VSCode UI

1. VSCode 좌측 Extensions 탭 클릭 (`Ctrl+Shift+X`)
2. 우측 상단 `···` 메뉴 클릭
3. **Install from VSIX...** 선택
4. `gptini-0.0.1.vsix` 파일 선택

---

## 4단계 — 확인

설치 후 VSCode를 재시작하면 좌측 액티비티 바에 **말풍선 아이콘(Chat)** 이 추가됩니다.
클릭하면 사이드바에 GPTini 채팅 패널이 열립니다.

---

## 업데이트 방법

새 버전이 배포되면 `.vsix` 파일을 다시 받아서 동일하게 설치하면 기존 버전을 덮어씁니다.

```bash
git pull
vsce package
code --install-extension gptini-0.0.1.vsix
```

---

## 제거 방법

```bash
code --uninstall-extension gptini.gptini
```

또는 Extensions 탭에서 **GPTini** 검색 후 **Uninstall** 클릭.
