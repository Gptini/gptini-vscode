import * as vscode from "vscode";
import axios from "axios";

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 웹뷰에서 메시지 받기
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case "sendMessage":
                    await this.sendMessageToServer(data.message);
                    break;
                case "loadMessages":
                    await this.loadMessages();
                    break;
            }
        });
    }

    private async sendMessageToServer(message: string) {
        try {
            // TODO: 여기에 실제 Spring 서버 URL 입력
            const response = await axios.post(
                "http://localhost:8080/api/chat/send",
                {
                    message: message,
                    // 필요한 다른 필드들 추가
                },
            );

            // 메시지 전송 후 새로고침
            await this.loadMessages();
        } catch (error) {
            vscode.window.showErrorMessage("메시지 전송 실패");
        }
    }

    private async loadMessages() {
        try {
            // 임시 더미 데이터
            const dummyMessages = [
                {
                    username: "경민",
                    content: "안녕하세요! 테스트 메시지입니다.",
                    timestamp: new Date(Date.now() - 120000).toISOString(),
                },
                {
                    username: "채욘",
                    content: "네 잘 받았습니다~",
                    timestamp: new Date(Date.now() - 60000).toISOString(),
                },
                {
                    username: "경민",
                    content: "채팅 UI가 파일 탐색기처럼 잘 나오네요!",
                    timestamp: new Date().toISOString(),
                },
            ];

            this._view?.webview.postMessage({
                type: "updateMessages",
                messages: dummyMessages,
            });

            // TODO: 나중에 실제 서버 연결할 때 아래 주석 해제
            // const response = await axios.get('http://localhost:8080/api/chat/messages');
            // this._view?.webview.postMessage({
            //     type: 'updateMessages',
            //     messages: response.data
            // });
        } catch (error) {
            console.error("메시지 로드 실패:", error);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://microsoft.github.io/vscode-codicons/dist/codicon.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* 파일 탐색기 스타일 헤더 */
        #explorer-header {
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-sideBarTitle-foreground);
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-sideBar-border);
            letter-spacing: 0.5px;
        }

        /* 메시지 영역 */
        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 0;
        }

        #messages::-webkit-scrollbar {
            width: 10px;
        }

        #messages::-webkit-scrollbar-track {
            background: var(--vscode-sideBar-background);
        }

        #messages::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
        }

        #messages::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        /* 사용자 폴더 */
        .user-folder {
            margin: 0;
        }

        .folder-header {
            display: flex;
            align-items: center;
            padding: 0 8px;
            height: 22px;
            cursor: pointer;
            user-select: none;
        }

        .folder-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .folder-chevron {
            margin-right: 2px;
            color: var(--vscode-icon-foreground);
            font-size: 16px;
            transition: transform 0.1s;
        }

        .folder-chevron.expanded {
            transform: rotate(90deg);
        }

        .folder-icon {
            margin-right: 4px;
            color: var(--vscode-icon-foreground);
            font-size: 16px;
        }

        .folder-name {
            font-size: 13px;
            color: var(--vscode-sideBar-foreground);
            flex: 1;
        }

        /* 메시지 파일들 */
        .folder-contents {
            display: none;
        }

        .folder-contents.expanded {
            display: block;
        }

        .message-file {
            margin: 0;
        }

        .file-header {
            display: flex;
            align-items: center;
            padding: 0 8px 0 20px;
            height: 22px;
            cursor: pointer;
            user-select: none;
        }

        .file-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .file-chevron {
            margin-right: 2px;
            color: var(--vscode-icon-foreground);
            font-size: 16px;
            transition: transform 0.1s;
        }

        .file-chevron.expanded {
            transform: rotate(90deg);
        }

        .file-icon {
            margin-right: 4px;
            color: var(--vscode-icon-foreground);
            font-size: 16px;
        }

        .file-name {
            font-size: 13px;
            color: var(--vscode-sideBar-foreground);
            flex: 1;
        }

        .file-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
        }

        /* 메시지 내용 */
        .file-content {
            display: none;
            padding: 0 8px 0 40px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 22px;
            white-space: pre-wrap;
            word-break: break-word;
        }

        .file-content.expanded {
            display: block;
        }

        /* 입력 영역 */
        #input-area {
            border-top: 1px solid var(--vscode-sideBar-border);
            padding: 6px;
            background-color: var(--vscode-sideBar-background);
        }

        .input-wrapper {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 3px 6px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }

        .input-wrapper:focus-within {
            border-color: var(--vscode-focusBorder);
        }

        .input-icon {
            color: var(--vscode-icon-foreground);
            font-size: 16px;
            opacity: 0.7;
        }

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

        #message-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        #send-btn {
            background: transparent;
            color: var(--vscode-icon-foreground);
            border: none;
            cursor: pointer;
            font-size: 16px;
            padding: 2px;
            display: flex;
            align-items: center;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        #send-btn:hover {
            opacity: 1;
        }

        #send-btn:active {
            opacity: 0.5;
        }
    </style>
</head>
<body>
    <div id="explorer-header">GPTini</div>
    <div id="messages"></div>
    <div id="input-area">
        <div class="input-wrapper">
            <span class="input-icon codicon codicon-edit"></span>
            <textarea id="message-input" rows="1" placeholder="새 메시지 작성..."></textarea>
            <button id="send-btn" class="codicon codicon-send"></button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendBtn = document.getElementById('send-btn');

        // 상태 저장 (어떤 폴더/파일이 펼쳐져 있는지)
        let expandedFolders = new Set();
        let expandedFiles = new Set();

        // 페이지 로드 시 메시지 불러오기
        vscode.postMessage({ type: 'loadMessages' });

        // 메시지 전송
        function sendMessage() {
            const message = messageInput.value.trim();
            if (message) {
                vscode.postMessage({
                    type: 'sendMessage',
                    message: message
                });
                messageInput.value = '';
                messageInput.style.height = 'auto';
            }
        }

        sendBtn.addEventListener('click', sendMessage);

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // 자동 높이 조절
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
        });

        // Extension에서 메시지 받기
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateMessages':
                    displayMessages(message.messages);
                    break;
            }
        });

        function displayMessages(messages) {
            messagesDiv.innerHTML = '';
            
            // 각 메시지를 개별 폴더로 표시 (시간순)
            messages.forEach((msg, index) => {
                const username = msg.username || 'Unknown';
                const userFolder = document.createElement('div');
                userFolder.className = 'user-folder';
                
                const folderId = 'folder-' + index;
                const isExpanded = expandedFolders.has(folderId);
                
                // 폴더 헤더
                const folderHeader = document.createElement('div');
                folderHeader.className = 'folder-header';
                
                const time = msg.timestamp ? formatTime(msg.timestamp) : '';
                
                folderHeader.innerHTML = \`
                    <span class="folder-chevron codicon codicon-chevron-right \${isExpanded ? 'expanded' : ''}"></span>
                    <span class="folder-icon codicon codicon-folder\${isExpanded ? '-opened' : ''}"></span>
                    <span class="folder-name">\${escapeHtml(username)}</span>
                    <span class="file-time">\${time}</span>
                \`;
                
                // 폴더 클릭 이벤트
                folderHeader.addEventListener('click', () => {
                    toggleFolder(folderId, userFolder);
                });
                
                userFolder.appendChild(folderHeader);

                // 폴더 내용 (메시지 파일)
                const folderContents = document.createElement('div');
                folderContents.className = \`folder-contents \${isExpanded ? 'expanded' : ''}\`;

                const messageFile = document.createElement('div');
                messageFile.className = 'message-file';
                
                const extension = getFileExtension(username);
                const fileId = 'file-' + index;
                const isFileExpanded = expandedFiles.has(fileId);
                const content = msg.content || msg.message || '';
                
                // 파일 헤더
                const fileHeader = document.createElement('div');
                fileHeader.className = 'file-header';
                fileHeader.innerHTML = \`
                    <span class="file-chevron codicon codicon-chevron-right \${isFileExpanded ? 'expanded' : ''}"></span>
                    <span class="file-icon codicon codicon-\${getFileIcon(extension)}"></span>
                    <span class="file-name">message.\${extension}</span>
                \`;
                
                // 파일 클릭 이벤트
                fileHeader.addEventListener('click', () => {
                    toggleFile(fileId, messageFile);
                });
                
                messageFile.appendChild(fileHeader);

                // 파일 내용
                const fileContent = document.createElement('div');
                fileContent.className = \`file-content \${isFileExpanded ? 'expanded' : ''}\`;
                fileContent.textContent = content;
                
                messageFile.appendChild(fileContent);
                folderContents.appendChild(messageFile);
                userFolder.appendChild(folderContents);
                messagesDiv.appendChild(userFolder);
            });
            
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function toggleFolder(folderId, folderElement) {
            const chevron = folderElement.querySelector('.folder-chevron');
            const folderIcon = folderElement.querySelector('.folder-icon');
            const contents = folderElement.querySelector('.folder-contents');
            
            if (expandedFolders.has(folderId)) {
                expandedFolders.delete(folderId);
                chevron.classList.remove('expanded');
                folderIcon.classList.remove('codicon-folder-opened');
                folderIcon.classList.add('codicon-folder');
                contents.classList.remove('expanded');
            } else {
                expandedFolders.add(folderId);
                chevron.classList.add('expanded');
                folderIcon.classList.remove('codicon-folder');
                folderIcon.classList.add('codicon-folder-opened');
                contents.classList.add('expanded');
            }
        }

        function toggleFile(fileId, fileElement) {
            const chevron = fileElement.querySelector('.file-chevron');
            const content = fileElement.querySelector('.file-content');
            
            if (expandedFiles.has(fileId)) {
                expandedFiles.delete(fileId);
                chevron.classList.remove('expanded');
                content.classList.remove('expanded');
            } else {
                expandedFiles.add(fileId);
                chevron.classList.add('expanded');
                content.classList.add('expanded');
            }
        }

        function getFileExtension(username) {
            const extensions = ['tsx', 'ts', 'java', 'jsx', 'py', 'js', 'go', 'rs'];
            const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return extensions[hash % extensions.length];
        }

        function getFileIcon(extension) {
            const icons = {
                'tsx': 'symbol-class',
                'ts': 'symbol-method',
                'java': 'symbol-class',
                'jsx': 'symbol-class',
                'py': 'symbol-namespace',
                'js': 'symbol-method',
                'go': 'symbol-interface',
                'rs': 'symbol-variable'
            };
            return icons[extension] || 'file';
        }

        function formatTime(timestamp) {
            const date = new Date(timestamp);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return \`\${hours}:\${minutes}\`;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}
