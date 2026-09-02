import * as vscode from "vscode";

export class PreviewCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    const text = document.getText();

    const previewRegex = /export\s+(?:const|function)\s+Preview\b/g;

    let match: RegExpExecArray | null;

    while ((match = previewRegex.exec(text))) {
      const position = document.positionAt(match.index);

      const range = new vscode.Range(position, position);

      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(preview)\u00a0\u00a0Peek: Open Preview",
          command: "peek.open",
          arguments: [document.uri],
        }),
      );
    }

    return lenses;
  }
}
