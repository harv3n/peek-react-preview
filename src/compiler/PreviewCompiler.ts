import * as vscode from "vscode";

export interface PreviewBuildRequest {
  sourceUri: vscode.Uri;
  outputDirectory: vscode.Uri;
  previewExport: string;
  globalStyles: string[];
}

export interface PreviewAsset {
  absolutePath: string;
  relativePath: string;
  contents: Uint8Array;
}

export interface PreviewBuildSuccess {
  ok: true;
  entryJavaScript: string;
  stylesheet?: string;
  assets: PreviewAsset[];
}

export interface PreviewBuildFailure {
  ok: false;
  message: string;
  details: string[];
}

export type PreviewBuildResult = PreviewBuildSuccess | PreviewBuildFailure;

export interface PreviewBuildSession extends vscode.Disposable {
  rebuild(): Promise<PreviewBuildResult>;
}

export interface PreviewCompiler extends vscode.Disposable {
  createSession(request: PreviewBuildRequest): Promise<PreviewBuildSession>;
}
