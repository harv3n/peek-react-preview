import * as path from "node:path";
import * as vscode from "vscode";
import { PreviewBuildResult } from "../compiler/PreviewCompiler";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

export class PreviewPanel implements vscode.Disposable {
  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    readonly sourceUri: vscode.Uri,
    private readonly outputDirectory: vscode.Uri,
  ) {}

  static create(
    sourceUri: vscode.Uri,
    outputDirectory: vscode.Uri,
  ): PreviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "reactPrimitivePreview",
      `Preview: ${path.basename(sourceUri.fsPath)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [outputDirectory],
      },
    );

    return new PreviewPanel(panel, sourceUri, outputDirectory);
  }

  reveal(): void {
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  onDidDispose(listener: () => void): vscode.Disposable {
    return this.panel.onDidDispose(listener);
  }

  async render(result: PreviewBuildResult): Promise<void> {
    if (!result.ok) {
      this.panel.webview.html = this.errorHtml(result.message, result.details);
      return;
    }

    await vscode.workspace.fs.createDirectory(this.outputDirectory);

    const jsUri = vscode.Uri.joinPath(this.outputDirectory, "preview.js");
    await vscode.workspace.fs.writeFile(
      jsUri,
      new TextEncoder().encode(result.entryJavaScript),
    );

    let cssWebviewUri: vscode.Uri | undefined;
    if (result.stylesheet !== undefined) {
      const cssUri = vscode.Uri.joinPath(this.outputDirectory, "preview.css");
      await vscode.workspace.fs.writeFile(
        cssUri,
        new TextEncoder().encode(result.stylesheet),
      );
      cssWebviewUri = this.panel.webview.asWebviewUri(cssUri);
    }

    for (const asset of result.assets) {
      const assetUri = vscode.Uri.joinPath(
        this.outputDirectory,
        ...asset.relativePath.split(/[\\/]+/),
      );
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(assetUri.fsPath)),
      );
      await vscode.workspace.fs.writeFile(assetUri, asset.contents);
    }

    const jsWebviewUri = this.panel.webview.asWebviewUri(jsUri);
    const scriptNonce = nonce();

    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; font-src ${this.panel.webview.cspSource}; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${scriptNonce}';" />
  ${cssWebviewUri ? `<link rel="stylesheet" href="${cssWebviewUri}">` : ""}
  <style>
    :root { color-scheme: light dark; }
    html, body { min-height: 100%; }
    body {
      margin: 0;
      padding: 24px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
    #root { min-height: 120px; }
    .runtime-error {
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      background: var(--vscode-inputValidation-errorBackground);
      padding: 16px;
      border-radius: 6px;
    }
    .runtime-error h2 { margin-top: 0; font-size: 16px; }
    .runtime-error pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main id="root" aria-live="polite"></main>
  <script nonce="${scriptNonce}" type="module" src="${jsWebviewUri}"></script>
</body>
</html>`;
  }

  renderLoading(): void {
    this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { padding: 24px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
  </style>
</head>
<body>Building React preview…</body>
</html>`;
  }

  private errorHtml(message: string, details: string[]): string {
    const detailMarkup =
      details.length > 0
        ? `<pre>${escapeHtml(details.join("\n\n"))}</pre>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    section { border: 1px solid var(--vscode-inputValidation-errorBorder); background: var(--vscode-inputValidation-errorBackground); padding: 16px; border-radius: 6px; }
    h2 { margin-top: 0; font-size: 16px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <section>
    <h2>${escapeHtml(message)}</h2>
    ${detailMarkup}
  </section>
</body>
</html>`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.panel.dispose();
  }
}
