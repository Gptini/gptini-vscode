import * as vscode from "vscode";
import { ChatViewProvider } from "././chatViewProvider";

export function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("chat-view", provider),
    );
}

export function deactivate() {}
