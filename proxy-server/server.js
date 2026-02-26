const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL;

if (!TARGET_URL) {
    console.error('[GPTini Proxy] 오류: TARGET_URL 환경변수가 설정되지 않았습니다.');
    console.error('예시: TARGET_URL=http://your-spring-server.com:8080');
    process.exit(1);
}

const API_PATH = process.env.API_PATH || '/api';
const WS_PATH = process.env.WS_PATH || '/ws';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

// CORS 설정
const corsOptions = {
    origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(cors(corsOptions));

// 헬스 체크 (Render/Railway가 서비스 상태 확인에 사용)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        target: TARGET_URL,
        apiPath: API_PATH,
        wsPath: WS_PATH,
    });
});

// HTTP API 프록시
const apiProxy = createProxyMiddleware({
    target: TARGET_URL,
    changeOrigin: true,
    on: {
        error: (err, req, res) => {
            console.error('[GPTini Proxy] API 에러:', err.message);
            if (!res.headersSent) {
                res.status(502).json({ error: '백엔드 서버 연결 실패', detail: err.message });
            }
        },
        proxyReq: (proxyReq, req) => {
            console.log(`[GPTini Proxy] ${req.method} ${req.path} → ${TARGET_URL}${req.path}`);
        },
    },
});

// WebSocket 프록시 (Spring의 STOMP/SockJS 지원)
const wsTargetUrl = TARGET_URL.replace(/^http/, 'ws');
const wsProxy = createProxyMiddleware({
    target: wsTargetUrl,
    changeOrigin: true,
    ws: true,
    on: {
        error: (err, req, socket) => {
            console.error('[GPTini Proxy] WebSocket 에러:', err.message);
            socket.destroy();
        },
        open: (proxySocket) => {
            console.log('[GPTini Proxy] WebSocket 연결 수립');
        },
    },
});

app.use(API_PATH, apiProxy);
app.use(WS_PATH, wsProxy);

const server = app.listen(PORT, () => {
    console.log(`[GPTini Proxy] 서버 실행 중 - 포트: ${PORT}`);
    console.log(`[GPTini Proxy] 타겟 서버: ${TARGET_URL}`);
    console.log(`[GPTini Proxy] API 경로: ${API_PATH} → ${TARGET_URL}${API_PATH}`);
    console.log(`[GPTini Proxy] WebSocket 경로: ${WS_PATH} → ${wsTargetUrl}${WS_PATH}`);
});

// WebSocket upgrade 이벤트 처리 (HTTP → WS 업그레이드)
server.on('upgrade', wsProxy.upgrade);

// 예기치 않은 종료 처리
process.on('uncaughtException', (err) => {
    console.error('[GPTini Proxy] 예기치 않은 오류:', err);
});
