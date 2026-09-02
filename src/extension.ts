import * as vscode from "vscode";
import { DocumentOverlay } from "./compiler/DocumentOverlay";
import { EsbuildPreviewCompiler } from "./compiler/EsbuildPreviewCompiler";
import { PreviewManager } from "./preview/PreviewManager";
import { PreviewCodeLensProvider } from "./codelens/PreviewCodeLensProvider";

export function activate(context: vscode.ExtensionContext): void {
  const overlay = new DocumentOverlay();
  const compiler = new EsbuildPreviewCompiler(overlay);
  const manager = new PreviewManager(context, compiler);

  const previewCodeLensProvider = new PreviewCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        {
          language: "typescriptreact",
          scheme: "file",
        },
        {
          language: "javascriptreact",
          scheme: "file",
        },
      ],
      previewCodeLensProvider,
    ),
  );

  context.subscriptions.push(
    overlay,
    compiler,
    manager,
    vscode.commands.registerCommand("peek.open", async () => {
      await manager.openActiveEditor();
    }),
  );
}

export function deactivate(): void {}
