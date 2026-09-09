import * as vscode from "vscode";

const logChannel: vscode.OutputChannel =
  vscode.window.createOutputChannel("Peek");

const logger: { print: (message: string) => void } = {
  print: (message: string) => logChannel.appendLine(message),
};

export default logger;
