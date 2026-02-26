require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL;

// REST API 프록시 (/api/v1/**)
app.use('/api/v1', createProxyMiddleware({
  target: TARGET_URL,
  changeOrigin: true,
}));

// WebSocket 프록시 (/ws/**)
app.use('/ws', createProxyMiddleware({
  target: TARGET_URL,
  changeOrigin: true,
  ws: true,
}));

app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT} -> ${TARGET_URL}`);
});
