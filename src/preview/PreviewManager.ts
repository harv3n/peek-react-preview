import { createHash } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import { PreviewCompiler } from "../compiler/PreviewCompiler";
import { Debouncer } from "../utils/debounce";
import { PreviewPanel } from "./PreviewPanel";

const SUPPORTED_LANGUAGE_IDS = new Set(["typescriptreact", "javascriptreact"]);
const SUPPORTED_EXTENSIONS = new Set([".tsx", ".jsx"]);

interface OpenPreview {
  panel: PreviewPanel;
  debouncer: Debouncer;
  building: boolean;
  rebuildRequested: boolean;
}

export class PreviewManager implements vscode.Disposable {
  private readonly previews = new Map<string, OpenPreview>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly compiler: PreviewCompiler,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const config = this.configuration();
        if (!config.get<boolean>("autoRefresh", true)) {
          return;
        }
        for (const preview of this.previews.values()) {
          preview.debouncer.schedule(
            config.get<number>("debounceMs", 150),
            () => {
              void this.rebuild(preview);
            },
          );
        }
      }),
    );
  }

  async openActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(
        "Open a .tsx or .jsx component first.",
      );
      return;
    }

    const document = editor.document;
    const extension = path.extname(document.uri.fsPath).toLowerCase();
    if (
      document.uri.scheme !== "file" ||
      (!SUPPORTED_LANGUAGE_IDS.has(document.languageId) &&
        !SUPPORTED_EXTENSIONS.has(extension))
    ) {
      void vscode.window.showWarningMessage(
        "React Primitive Preview currently supports .tsx and .jsx files.",
      );
      return;
    }

    const key = document.uri.toString();
    const existing = this.previews.get(key);
    if (existing) {
      existing.panel.reveal();
      await this.rebuild(existing);
      return;
    }

    const outputDirectory = vscode.Uri.joinPath(
      this.extensionContext.globalStorageUri,
      "previews",
      createHash("sha1").update(key).digest("hex").slice(0, 16),
    );

    const panel = PreviewPanel.create(document.uri, outputDirectory);
    const preview: OpenPreview = {
      panel,
      debouncer: new Debouncer(),
      building: false,
      rebuildRequested: false,
    };

    this.previews.set(key, preview);
    panel.onDidDispose(() => {
      preview.debouncer.dispose();
      this.previews.delete(key);
    });

    panel.renderLoading();
    await this.rebuild(preview);
  }

  private async rebuild(preview: OpenPreview): Promise<void> {
    if (preview.building) {
      preview.rebuildRequested = true;
      return;
    }

    preview.building = true;

    try {
      const config = this.configuration();
      const outputDirectory = vscode.Uri.joinPath(
        this.extensionContext.globalStorageUri,
        "previews",
        createHash("sha1")
          .update(preview.panel.sourceUri.toString())
          .digest("hex")
          .slice(0, 16),
      );

      const result = await this.compiler.build({
        sourceUri: preview.panel.sourceUri,
        outputDirectory,
        previewExport: config.get<string>("previewExport", "Preview"),
        globalStyles: config.get<string[]>("globalStyles", []),
      });

      await preview.panel.render(result);
    } finally {
      preview.building = false;
      if (preview.rebuildRequested) {
        preview.rebuildRequested = false;
        void this.rebuild(preview);
      }
    }
  }

  private configuration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("reactPrimitivePreview");
  }

  dispose(): void {
    for (const preview of this.previews.values()) {
      preview.debouncer.dispose();
      preview.panel.dispose();
    }
    this.previews.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
