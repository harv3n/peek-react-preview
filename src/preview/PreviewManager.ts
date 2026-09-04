import { createHash } from "node:crypto";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  PreviewBuildSession,
  PreviewCompiler,
} from "../compiler/PreviewCompiler";
import { Debouncer } from "../utils/debounce";
import { PreviewPanel } from "./PreviewPanel";

const SUPPORTED_LANGUAGE_IDS = new Set(["typescriptreact", "javascriptreact"]);
const SUPPORTED_EXTENSIONS = new Set([".tsx", ".jsx"]);

interface OpenPreview {
  panel: PreviewPanel;
  buildSession: PreviewBuildSession;
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
        "Abra um arquivo .tsx ou .jsx primeiro.",
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
        "Peek atualmente suporta apenas arquivos .tsx e .jsx.",
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

    const config = this.configuration();
    const buildSession = await this.compiler.createSession({
      sourceUri: document.uri,
      outputDirectory,
      previewExport: config.get<string>("previewExport", "Preview"),
      globalStyles: config.get<string[]>("globalStyles", []),
    });

    const panel = PreviewPanel.create(document.uri, outputDirectory);
    const preview: OpenPreview = {
      panel,
      buildSession,
      debouncer: new Debouncer(),
      building: false,
      rebuildRequested: false,
    };

    this.previews.set(key, preview);
    panel.onDidDispose(() => {
      preview.debouncer.dispose();
      preview.buildSession.dispose();
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
      const result = await preview.buildSession.rebuild();
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
    return vscode.workspace.getConfiguration("peek");
  }

  dispose(): void {
    for (const preview of this.previews.values()) {
      preview.debouncer.dispose();
      preview.buildSession.dispose();
      preview.panel.dispose();
    }
    this.previews.clear();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
