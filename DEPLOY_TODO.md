# 백엔드 배포 TODO

## GitHub Secrets 설정

GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret 이름 | 값 | 설명 |
|---|---|---|
| `EC2_HOST` | EC2 Elastic IP | EC2 접속용 호스트 |
| `EC2_SSH_KEY` | pem 파일 내용 전체 | SSH 접속용 private key |
| `DB_URL` | RDS 접속 URL | DB 연결 문자열 |
| `DB_USERNAME` | `gptini_admin` | DB 사용자명 |
| `DB_PASSWORD` | terraform.tfvars 값 | DB 비밀번호 |
| `JWT_SECRET` | `openssl rand -base64 32` 결과 | JWT 서명용 시크릿 |

---

## 체크리스트

### 1. GitHub Secrets 설정
- [ ] `EC2_HOST` 추가
- [ ] `EC2_SSH_KEY` 추가 (pem 파일 전체 복사)
- [ ] `DB_URL` 추가
- [ ] `DB_USERNAME` 추가
- [ ] `DB_PASSWORD` 추가
- [ ] `JWT_SECRET` 추가

### 2. 백엔드 환경변수 설정
- [ ] `application-prod.yml` 생성 (환경변수 참조하도록)
- [ ] S3 버킷 이름 환경변수로 분리

### 3. EC2 초기 설정
- [ ] Docker 설치 확인 (`docker --version`)
- [ ] Docker 서비스 시작 (`sudo systemctl start docker`)
- [ ] ec2-user를 docker 그룹에 추가 (`sudo usermod -aG docker ec2-user`)

### 4. DNS 설정 (호스팅케이알)
- [ ] `api` → `3.37.92.94` (A 레코드)
- [ ] `www` → `dc8adsogldz1a.cloudfront.net` (CNAME)
- [ ] `@` (루트) → CloudFront (CNAME, 지원되면)

### 5. 첫 배포 테스트
- [ ] `main` 브랜치에 push
- [ ] GitHub Actions 실행 확인
- [ ] EC2에서 컨테이너 실행 확인 (`docker ps`)
- [ ] API 헬스체크 (`curl http://3.37.92.94:8080/actuator/health`)

### 6. SSL 설정 (EC2 Nginx)
- [ ] Nginx 설치
- [ ] certbot으로 SSL 인증서 발급
- [ ] `api.gptini.org` → `localhost:8080` 리버스 프록시 설정

### 7. 프록시 서버 설정 (공유오피스 도메인 차단 우회)

> **구조**: 브라우저 → Render 프록시 (`*.onrender.com`) → Spring (`api.gptini.org`)

- [ ] Render.com에서 `gptini-proxy` 서비스 생성 (레포 연결, `render.yaml` 자동 인식)
- [ ] Render 대시보드 → Environment에서 `TARGET_URL` 설정
  - SSL 설정 전: `http://3.37.92.94:8080`
  - SSL 설정 후: `https://api.gptini.org`
- [ ] Spring CORS 설정에 Render 프록시 도메인 추가 (`https://gptini-proxy.onrender.com`)
- [ ] 백엔드 레포에서 WebSocket 엔드포인트 경로 확인 → `WS_PATH` 환경변수 수정
- [ ] 백엔드 레포에서 REST API 경로 확인 → `API_PATH` 환경변수 수정
- [ ] VS Code 설정 (`gptini.proxyUrl`)을 Render 배포 URL로 변경
- [ ] React 프론트의 API baseURL을 Render 프록시 URL로 변경

---

## 파일 구조

```
backend/
├── Dockerfile                          # ✅ 생성됨
├── .github/
│   └── workflows/
│       ├── ci.yml                      # ✅ PR 빌드/테스트
│       └── deploy.yml                  # ✅ main 배포
└── src/main/resources/
    ├── application.yml                 # 기본 설정
    └── application-prod.yml            # 🔲 prod 환경 설정 (생성 필요)
```

---

## 명령어 참고

JWT Secret 생성
```bash
openssl rand -base64 32
```

EC2 접속
```bash
ssh -i ~/path/to/gptini-keypair.pem ec2-user@ec2-공개-아이피
```

EC2에서 Docker 로그 확인
```bash
docker logs -f gptini-backend
```

EC2에서 컨테이너 재시작
```bash
docker restart gptini-backend
```
