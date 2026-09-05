import * as path from "node:path";
import * as vscode from "vscode";

function normalize(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export class DocumentOverlay implements vscode.Disposable {
  private readonly documents = new Map<string, string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    for (const document of vscode.workspace.textDocuments) {
      this.capture(document);
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.capture(document),
      ),
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.capture(event.document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.uri.scheme === "file") {
          this.documents.delete(normalize(document.uri.fsPath));
        }
      }),
    );
  }

  get(filePath: string): string | undefined {
    return this.documents.get(normalize(filePath));
  }

  has(filePath: string): boolean {
    return this.documents.has(normalize(filePath));
  }

  private capture(document: vscode.TextDocument): void {
    if (document.uri.scheme !== "file") {
      return;
    }

    this.documents.set(normalize(document.uri.fsPath), document.getText());
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.documents.clear();
  }
}
