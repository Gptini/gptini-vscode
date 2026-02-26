import * as vscode from "vscode";
import axios from "axios";

const DEFAULT_API_URL = "https://api.gptini.org";
const DEFAULT_WS_URL  = "https://gpt-ini.onrender.com";

function getNonce() {
    let text = "";
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri,
                vscode.Uri.joinPath(this._extensionUri, "node_modules"),
            ],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "ready":
                    await this._handleReady();
                    break;
                case "login":
                    await this._handleLogin(data.email, data.password);
                    break;
                case "loadRooms":
                    await this._handleLoadRooms();
                    break;
                case "enterRoom":
                    await this._handleEnterRoom(data.roomId, data.roomName);
                    break;
                case "logout":
                    await this._handleLogout();
                    break;
            }
        });
    }

    private _getApiUrl(): string {
        return (
            vscode.workspace
                .getConfiguration("gptini")
                .get<string>("serverUrl") || DEFAULT_API_URL
        );
    }

    private _getWsUrl(): string {
        return (
            vscode.workspace
                .getConfiguration("gptini")
                .get<string>("wsUrl") || DEFAULT_WS_URL
        ) + "/ws";
    }

    private async _handleReady() {
        const token = await this._context.secrets.get("gptini.accessToken");
        if (token) {
            await this._handleLoadRooms();
        } else {
            this._view?.webview.postMessage({ type: "showLogin" });
        }
    }

    private async _handleLogin(email: string, password: string) {
        try {
            const apiUrl = this._getApiUrl();
            console.log(`[GPTini] 로그인 시도: ${apiUrl}/api/v1/auth/login`);
            const { data: authData } = await axios.post(
                `${apiUrl}/api/v1/auth/login`,
                { email, password },
            );
            console.log("[GPTini] 로그인 응답:", JSON.stringify(authData));
            console.log("[GPTini] 유저 정보 조회 중...");
            const { data: userData } = await axios.get(
                `${apiUrl}/api/v1/users/me`,
                {
                    headers: {
                        Authorization: `Bearer ${authData.accessToken}`,
                    },
                },
            );

            await this._context.secrets.store(
                "gptini.accessToken",
                authData.accessToken,
            );
            await this._context.secrets.store(
                "gptini.refreshToken",
                authData.refreshToken,
            );
            await this._context.globalState.update(
                "gptini.userId",
                userData.id,
            );
            await this._context.globalState.update(
                "gptini.nickname",
                userData.nickname,
            );

            await this._handleLoadRooms();
        } catch (error: any) {
            const status = error?.response?.status;
            const url = error?.config?.url || `${this._getApiUrl()}/api/v1/auth/login`;
            const serverMsg = error?.response?.data?.message;
            console.error("[GPTini] 로그인 실패:", { status, url, data: error?.response?.data, message: error?.message });

            let msg: string;
            if (!error?.response) {
                msg = `서버에 연결할 수 없습니다.\n시도한 URL: ${url}`;
            } else if (status === 401) {
                msg = "이메일 또는 비밀번호가 올바르지 않습니다.";
            } else if (status === 404) {
                msg = `API 경로를 찾을 수 없습니다. (404)\nURL: ${url}`;
            } else {
                msg = serverMsg || `로그인 실패 (HTTP ${status})\nURL: ${url}`;
            }

            this._view?.webview.postMessage({ type: "loginError", message: msg });
        }
    }

    private async _handleLoadRooms() {
        try {
            const token = await this._context.secrets.get("gptini.accessToken");
            const apiUrl = this._getApiUrl();
            const { data: rooms } = await axios.get(
                `${apiUrl}/api/v1/chat/rooms`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const userId = this._context.globalState.get<number>("gptini.userId");
            const nickname =
                this._context.globalState.get<string>("gptini.nickname");

            this._view?.webview.postMessage({
                type: "showRooms",
                rooms,
                userId,
                nickname,
                accessToken: token,
                wsUrl: this._getWsUrl(),
            });
        } catch {
            this._view?.webview.postMessage({ type: "showLogin" });
        }
    }

    private async _handleEnterRoom(roomId: number, roomName: string) {
        try {
            const token = await this._context.secrets.get("gptini.accessToken");
            const userId = this._context.globalState.get<number>("gptini.userId");
            const apiUrl = this._getApiUrl();
            const { data: messages } = await axios.get(
                `${apiUrl}/api/v1/chat/rooms/${roomId}/messages`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            this._view?.webview.postMessage({
                type: "showChat",
                roomId,
                roomName,
                messages,
                userId,
            });
        } catch {
            vscode.window.showErrorMessage("메시지를 불러올 수 없습니다.");
        }
    }

    private async _handleLogout() {
        await this._context.secrets.delete("gptini.accessToken");
        await this._context.secrets.delete("gptini.refreshToken");
        await this._context.globalState.update("gptini.userId", undefined);
        await this._context.globalState.update("gptini.nickname", undefined);
        this._view?.webview.postMessage({ type: "showLogin" });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const stompUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "node_modules",
                "@stomp",
                "stompjs",
                "bundles",
                "stomp.umd.min.js",
            ),
        );
        const sockjsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._extensionUri,
                "node_modules",
                "sockjs-client",
                "dist",
                "sockjs.min.js",
            ),
        );

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src *; img-src ${webview.cspSource} https:;">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .screen { display: flex; flex-direction: column; height: 100vh; }
        .hidden { display: none !important; }

        /* ── Header ── */
        .explorer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-sideBarTitle-foreground);
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-sideBar-border, #333);
            letter-spacing: 0.5px;
            flex-shrink: 0;
            user-select: none;
        }

        .header-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--vscode-icon-foreground);
            font-size: 15px;
            padding: 1px 4px;
            opacity: 0.7;
            line-height: 1;
        }
        .header-btn:hover { opacity: 1; }

        /* ── Login Screen ── */
        .login-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 16px 12px;
        }

        .login-input {
            width: 100%;
            padding: 5px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 2px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            outline: none;
        }
        .login-input:focus { border-color: var(--vscode-focusBorder); }
        .login-input::placeholder { color: var(--vscode-input-placeholderForeground); }

        .login-btn {
            padding: 5px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        .login-btn:hover { background: var(--vscode-button-hoverBackground); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .error-msg {
            font-size: 12px;
            color: var(--vscode-errorForeground, #f48771);
            display: none;
            white-space: pre-line;
        }
        .error-msg.visible { display: block; }

        /* ── Rooms Screen ── */
        #rooms-list { flex: 1; overflow-y: auto; }

        .room-item {
            display: flex;
            align-items: center;
            padding: 3px 8px;
            min-height: 22px;
            cursor: pointer;
            user-select: none;
            gap: 6px;
        }
        .room-item:hover { background: var(--vscode-list-hoverBackground); }

        .room-icon { font-size: 13px; flex-shrink: 0; }

        .room-info { flex: 1; overflow: hidden; min-width: 0; }
        .room-name {
            font-size: 13px;
            color: var(--vscode-sideBar-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .room-last-msg {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .room-badge {
            font-size: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            padding: 1px 5px;
            min-width: 16px;
            text-align: center;
            flex-shrink: 0;
        }

        /* ── Chat Screen ── */
        #messages { flex: 1; overflow-y: auto; }

        #messages::-webkit-scrollbar { width: 8px; }
        #messages::-webkit-scrollbar-track { background: var(--vscode-sideBar-background); }
        #messages::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
        #messages::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }

        .user-folder { margin: 0; }

        .folder-header {
            display: flex;
            align-items: center;
            padding: 0 8px;
            height: 22px;
            cursor: pointer;
            user-select: none;
        }
        .folder-header:hover { background: var(--vscode-list-hoverBackground); }

        .folder-chevron {
            margin-right: 2px;
            font-size: 13px;
            color: var(--vscode-icon-foreground);
            transition: transform 0.1s;
            flex-shrink: 0;
            display: inline-block;
        }
        .folder-chevron.expanded { transform: rotate(90deg); }

        .folder-icon { margin-right: 4px; font-size: 13px; flex-shrink: 0; }
        .folder-name { font-size: 13px; color: var(--vscode-sideBar-foreground); flex: 1; }
        .folder-name.me { color: var(--vscode-terminal-ansiGreen, #4caf50); }

        .msg-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
            flex-shrink: 0;
        }

        .folder-contents { display: none; }
        .folder-contents.expanded { display: block; }

        .file-header {
            display: flex;
            align-items: center;
            padding: 0 8px 0 22px;
            height: 22px;
            cursor: pointer;
            user-select: none;
        }
        .file-header:hover { background: var(--vscode-list-hoverBackground); }

        .file-chevron {
            margin-right: 2px;
            font-size: 13px;
            color: var(--vscode-icon-foreground);
            transition: transform 0.1s;
            flex-shrink: 0;
            display: inline-block;
        }
        .file-chevron.expanded { transform: rotate(90deg); }

        .file-icon { margin-right: 4px; font-size: 13px; flex-shrink: 0; }
        .file-name { font-size: 13px; color: var(--vscode-sideBar-foreground); flex: 1; }

        .file-content {
            display: none;
            padding: 2px 8px 4px 40px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .file-content.expanded { display: block; }

        /* ── Input Area ── */
        #input-area {
            border-top: 1px solid var(--vscode-sideBar-border, #333);
            padding: 6px;
            background: var(--vscode-sideBar-background);
            flex-shrink: 0;
        }

        .input-wrapper {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 6px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 2px;
        }
        .input-wrapper:focus-within { border-color: var(--vscode-focusBorder); }

        #message-input {
            flex: 1;
            background: transparent;
            color: var(--vscode-input-foreground);
            border: none;
            outline: none;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            resize: none;
            padding: 0;
            max-height: 100px;
        }
        #message-input::placeholder { color: var(--vscode-input-placeholderForeground); }

        #send-btn {
            background: transparent;
            color: var(--vscode-icon-foreground);
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 2px;
            opacity: 0.7;
            line-height: 1;
        }
        #send-btn:hover { opacity: 1; }

        .ws-dot { font-size: 10px; }
        .ws-dot.on  { color: var(--vscode-terminal-ansiGreen, #4caf50); }
        .ws-dot.off { color: var(--vscode-terminal-ansiYellow, #ffcc00); }

        .empty-hint {
            padding: 12px 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>

    <!-- ═══════════ LOGIN ═══════════ -->
    <div id="login-screen" class="screen">
        <div class="explorer-header">GPTini</div>
        <div class="login-content">
            <input type="email" id="email-input" class="login-input" placeholder="이메일" />
            <input type="password" id="password-input" class="login-input" placeholder="비밀번호" />
            <button id="login-btn" class="login-btn">로그인</button>
            <div id="login-error" class="error-msg"></div>
        </div>
    </div>

    <!-- ═══════════ ROOMS ═══════════ -->
    <div id="rooms-screen" class="screen hidden">
        <div class="explorer-header">
            <span>GPTini</span>
            <button id="logout-btn" class="header-btn" title="로그아웃">⏏</button>
        </div>
        <div id="rooms-list"></div>
    </div>

    <!-- ═══════════ CHAT ═══════════ -->
    <div id="chat-screen" class="screen hidden">
        <div class="explorer-header">
            <button id="back-btn" class="header-btn" title="뒤로가기">‹</button>
            <span id="room-title" style="flex:1; margin:0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">채팅</span>
            <span id="ws-dot" class="ws-dot off">●</span>
        </div>
        <div id="messages"></div>
        <div id="input-area">
            <div class="input-wrapper">
                <textarea id="message-input" rows="1" placeholder="메시지 작성..."></textarea>
                <button id="send-btn">↑</button>
            </div>
        </div>
    </div>

    <script src="${sockjsUri}"></script>
    <script src="${stompUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // ── State ──
        let currentUserId  = null;
        let currentRoomId  = null;
        let expandedFolders = new Set();
        let expandedFiles   = new Set();
        let stompClient     = null;
        let roomSub         = null;

        // ── Screen switching ──
        const allScreens = {
            login: document.getElementById('login-screen'),
            rooms: document.getElementById('rooms-screen'),
            chat:  document.getElementById('chat-screen'),
        };
        function showScreen(name) {
            Object.entries(allScreens).forEach(([k, el]) => {
                el.classList.toggle('hidden', k !== name);
            });
        }

        // ── Messages from extension host ──
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'showLogin':
                    disconnectWs();
                    loginBtn.disabled = false;
                    loginBtn.textContent = '로그인';
                    showScreen('login');
                    break;

                case 'showRooms':
                    currentUserId = msg.userId;
                    renderRooms(msg.rooms);
                    showScreen('rooms');
                    connectWs(msg.accessToken, msg.wsUrl, msg.userId);
                    break;

                case 'showChat':
                    currentRoomId = msg.roomId;
                    document.getElementById('room-title').textContent = msg.roomName;
                    expandedFolders.clear();
                    expandedFiles.clear();
                    renderMessages(msg.messages, msg.userId);
                    showScreen('chat');
                    subscribeRoom(msg.roomId);
                    break;

                case 'loginError':
                    showLoginError(msg.message);
                    loginBtn.disabled = false;
                    loginBtn.textContent = '로그인';
                    break;
            }
        });

        // ── Login ──
        const loginBtn      = document.getElementById('login-btn');
        const emailInput    = document.getElementById('email-input');
        const passwordInput = document.getElementById('password-input');
        const loginErrorDiv = document.getElementById('login-error');

        function showLoginError(msg) {
            loginErrorDiv.textContent = msg;
            loginErrorDiv.classList.add('visible');
        }

        loginBtn.addEventListener('click', () => {
            const email    = emailInput.value.trim();
            const password = passwordInput.value;
            if (!email || !password) { showLoginError('이메일과 비밀번호를 입력하세요.'); return; }
            loginErrorDiv.classList.remove('visible');
            loginBtn.disabled = true;
            loginBtn.textContent = '로그인 중...';
            vscode.postMessage({ type: 'login', email, password });
        });
        passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

        // ── Logout ──
        document.getElementById('logout-btn').addEventListener('click', () => {
            vscode.postMessage({ type: 'logout' });
        });

        // ── Back to rooms ──
        document.getElementById('back-btn').addEventListener('click', () => {
            if (roomSub) { roomSub.unsubscribe(); roomSub = null; }
            currentRoomId = null;
            vscode.postMessage({ type: 'loadRooms' });
        });

        // ── Rooms list ──
        function renderRooms(rooms) {
            const list = document.getElementById('rooms-list');
            list.innerHTML = '';
            if (!rooms || rooms.length === 0) {
                list.innerHTML = '<div class="empty-hint">참여 중인 채팅방이 없습니다.</div>';
                return;
            }
            rooms.forEach(room => {
                const roomId   = room.roomId ?? room.id;
                const roomName = room.roomName ?? room.name ?? '이름 없는 방';
                const unread   = room.unreadCount || 0;

                const item = document.createElement('div');
                item.className = 'room-item';
                item.dataset.roomId = roomId;
                item.innerHTML =
                    \`<span class="room-icon">💬</span>
                    <div class="room-info">
                        <div class="room-name">\${esc(roomName)}</div>
                        \${room.lastMessage ? \`<div class="room-last-msg">\${esc(room.lastMessage)}</div>\` : ''}
                    </div>
                    \${unread > 0 ? \`<span class="room-badge">\${unread}</span>\` : ''}\`;

                item.addEventListener('click', () => {
                    vscode.postMessage({ type: 'enterRoom', roomId, roomName });
                });
                list.appendChild(item);
            });
        }

        // ── WebSocket (STOMP over SockJS) ──
        function connectWs(token, wsUrl, userId) {
            if (stompClient?.active) return;

            stompClient = new StompJs.Client({
                webSocketFactory: () => new SockJS(wsUrl),
                connectHeaders: { Authorization: \`Bearer \${token}\` },
                reconnectDelay: 5000,
                onConnect: () => {
                    updateWsDot(true);
                    // 방 목록 실시간 업데이트 구독
                    stompClient.subscribe(\`/sub/users/\${userId}/rooms\`, (frame) => {
                        try {
                            const update = JSON.parse(frame.body);
                            applyRoomUpdate(update);
                        } catch {}
                    });
                    // 채팅 화면이 열려 있으면 재구독
                    if (currentRoomId !== null) subscribeRoom(currentRoomId);
                },
                onDisconnect: () => updateWsDot(false),
                onStompError:    () => {},
                onWebSocketError: () => {},
            });
            stompClient.activate();
        }

        function disconnectWs() {
            if (roomSub) { roomSub.unsubscribe(); roomSub = null; }
            if (stompClient?.active) { stompClient.deactivate(); stompClient = null; }
            updateWsDot(false);
        }

        function subscribeRoom(roomId) {
            if (!stompClient?.connected) return;
            if (roomSub) { roomSub.unsubscribe(); roomSub = null; }
            roomSub = stompClient.subscribe(\`/sub/chat/rooms/\${roomId}\`, (frame) => {
                try {
                    const msg = JSON.parse(frame.body);
                    appendMessage(msg, currentUserId);
                    scrollBottom();
                } catch {}
            });
        }

        function updateWsDot(on) {
            const el = document.getElementById('ws-dot');
            if (el) { el.className = \`ws-dot \${on ? 'on' : 'off'}\`; }
        }

        function applyRoomUpdate(update) {
            const item = document.querySelector(\`[data-room-id="\${update.roomId}"]\`);
            if (!item) return;
            const lastMsgEl = item.querySelector('.room-last-msg');
            if (lastMsgEl) {
                lastMsgEl.textContent = update.lastMessage || '';
            } else if (update.lastMessage) {
                const info = item.querySelector('.room-info');
                if (info) {
                    const d = document.createElement('div');
                    d.className = 'room-last-msg';
                    d.textContent = update.lastMessage;
                    info.appendChild(d);
                }
            }
            const badge = item.querySelector('.room-badge');
            if (update.unreadCount > 0) {
                if (badge) { badge.textContent = update.unreadCount; }
                else {
                    const b = document.createElement('span');
                    b.className = 'room-badge';
                    b.textContent = update.unreadCount;
                    item.appendChild(b);
                }
            } else if (badge) {
                badge.remove();
            }
        }

        // ── Messages ──
        function renderMessages(messages, userId) {
            document.getElementById('messages').innerHTML = '';
            (messages || []).forEach(msg => appendMessage(msg, userId));
            scrollBottom();
        }

        function appendMessage(msg, userId) {
            const container = document.getElementById('messages');
            const idx    = container.children.length;
            const isMe   = msg.senderId === userId;
            const folderId = \`f-\${msg.messageId ?? idx}\`;
            const fileId   = \`file-\${msg.messageId ?? idx}\`;
            const ext      = fileExt(msg.senderNickname || '');
            const time     = fmtTime(msg.createdAt);

            const folderEl = document.createElement('div');
            folderEl.className = 'user-folder';

            // folder header
            const fh = document.createElement('div');
            fh.className = 'folder-header';
            fh.innerHTML =
                \`<span class="folder-chevron">›</span>
                <span class="folder-icon">\${isMe ? '📂' : '📁'}</span>
                <span class="folder-name\${isMe ? ' me' : ''}">\${esc(msg.senderNickname || 'Unknown')}</span>
                <span class="msg-time">\${time}</span>\`;
            fh.addEventListener('click', () => toggleFolder(folderId, folderEl));
            folderEl.appendChild(fh);

            // folder contents
            const contents = document.createElement('div');
            contents.className = 'folder-contents';

            const fileEl = document.createElement('div');
            const fileHeader = document.createElement('div');
            fileHeader.className = 'file-header';
            fileHeader.innerHTML =
                \`<span class="file-chevron">›</span>
                <span class="file-icon">📄</span>
                <span class="file-name">message.\${ext}</span>\`;
            fileHeader.addEventListener('click', () => toggleFile(fileId, fileEl));
            fileEl.appendChild(fileHeader);

            const fileCont = document.createElement('div');
            fileCont.className = 'file-content';
            fileCont.textContent = msg.content || '';
            fileEl.appendChild(fileCont);

            contents.appendChild(fileEl);
            folderEl.appendChild(contents);
            container.appendChild(folderEl);
        }

        function scrollBottom() {
            const el = document.getElementById('messages');
            if (el) el.scrollTop = el.scrollHeight;
        }

        // ── Send message ──
        const msgInput = document.getElementById('message-input');
        const sendBtn  = document.getElementById('send-btn');

        function sendMessage() {
            const content = msgInput.value.trim();
            if (!content || !stompClient?.connected || currentRoomId === null) return;
            stompClient.publish({
                destination: \`/pub/chat/rooms/\${currentRoomId}\`,
                body: JSON.stringify({ type: 'TEXT', content }),
            });
            msgInput.value = '';
            msgInput.style.height = 'auto';
        }
        sendBtn.addEventListener('click', sendMessage);
        msgInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        msgInput.addEventListener('input', () => {
            msgInput.style.height = 'auto';
            msgInput.style.height = Math.min(msgInput.scrollHeight, 100) + 'px';
        });

        // ── Toggle helpers ──
        function toggleFolder(id, el) {
            const ch = el.querySelector('.folder-chevron');
            const ct = el.querySelector('.folder-contents');
            const on = expandedFolders.has(id);
            if (on) { expandedFolders.delete(id); ch.classList.remove('expanded'); ct.classList.remove('expanded'); }
            else    { expandedFolders.add(id);    ch.classList.add('expanded');    ct.classList.add('expanded');    }
        }
        function toggleFile(id, el) {
            const ch = el.querySelector('.file-chevron');
            const ct = el.querySelector('.file-content');
            const on = expandedFiles.has(id);
            if (on) { expandedFiles.delete(id); ch.classList.remove('expanded'); ct.classList.remove('expanded'); }
            else    { expandedFiles.add(id);    ch.classList.add('expanded');    ct.classList.add('expanded');    }
        }

        // ── Utils ──
        function fileExt(nickname) {
            const exts = ['tsx','ts','java','jsx','py','js','go','rs'];
            const hash = [...nickname].reduce((a, c) => a + c.charCodeAt(0), 0);
            return exts[hash % exts.length];
        }
        function fmtTime(dateStr) {
            if (!dateStr) return '';
            return new Date(dateStr).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
        }
        function esc(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }

        // ── Init ──
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
