import * as path from "node:path";
import * as esbuild from "esbuild";
import * as vscode from "vscode";
import { DocumentOverlay } from "./DocumentOverlay";
import {
  PreviewAsset,
  PreviewBuildRequest,
  PreviewBuildResult,
  PreviewCompiler,
} from "./PreviewCompiler";
import { createVirtualEntry } from "./virtualEntry";

const SOURCE_FILTER = /\.(?:[cm]?[jt]sx?)$/i;
const CSS_FILTER = /\.css$/i;
const CSS_MODULE_FILTER = /\.module\.css$/i;
const VIRTUAL_ENTRY = "react-primitive-preview:entry";
const VIRTUAL_NAMESPACE = "react-primitive-preview";

function loaderForSource(filePath: string): esbuild.Loader {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts"))
    return "ts";
  if (lower.endsWith(".jsx")) return "jsx";
  return "js";
}

function formatBuildMessages(messages: esbuild.Message[]): string[] {
  return messages.map((message) => {
    if (!message.location) {
      return message.text;
    }

    const location = message.location;
    return `${location.file}:${location.line}:${location.column + 1} — ${message.text}`;
  });
}

function isBuildFailure(error: unknown): error is esbuild.BuildFailure {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Partial<esbuild.BuildFailure>;
  return Array.isArray(candidate.errors) && Array.isArray(candidate.warnings);
}

export class EsbuildPreviewCompiler implements PreviewCompiler {
  constructor(private readonly overlay: DocumentOverlay) {}

  async build(request: PreviewBuildRequest): Promise<PreviewBuildResult> {
    const componentPath = request.sourceUri.fsPath;
    const projectRoot =
      vscode.workspace.getWorkspaceFolder(request.sourceUri)?.uri.fsPath ??
      path.dirname(componentPath);

    const resolvedGlobalStyles = request.globalStyles.map((style) =>
      path.isAbsolute(style) ? style : path.join(projectRoot, style),
    );

    const virtualEntry = createVirtualEntry({
      componentPath,
      previewExport: request.previewExport,
      globalStyles: resolvedGlobalStyles,
    });

    const overlay = this.overlay;
    const virtualPlugin: esbuild.Plugin = {
      name: "react-primitive-preview-virtual-entry",
      setup(build) {
        build.onResolve({ filter: /^react-primitive-preview:entry$/ }, () => ({
          path: VIRTUAL_ENTRY,
          namespace: VIRTUAL_NAMESPACE,
        }));

        build.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, () => ({
          contents: virtualEntry,
          loader: "tsx",
          resolveDir: path.dirname(componentPath),
        }));
      },
    };

    const unsavedDocumentsPlugin: esbuild.Plugin = {
      name: "react-primitive-preview-unsaved-documents",
      setup(build) {
        build.onLoad(
          { filter: SOURCE_FILTER, namespace: "file" },
          async (args) => {
            const contents = overlay.get(args.path);
            if (contents === undefined) {
              return undefined;
            }

            return {
              contents,
              loader: loaderForSource(args.path),
              resolveDir: path.dirname(args.path),
            };
          },
        );
      },
    };

    const unsavedStylesPlugin: esbuild.Plugin = {
      name: "react-primitive-preview-unsaved-styles",
      setup(build) {
        build.onLoad(
          { filter: CSS_FILTER, namespace: "file" },
          async (args) => {
            const contents = overlay.get(args.path);
            if (contents === undefined) {
              return undefined;
            }

            return {
              contents,
              loader: CSS_MODULE_FILTER.test(args.path) ? "local-css" : "css",
              resolveDir: path.dirname(args.path),
            };
          },
        );
      },
    };

    try {
      const result = await esbuild.build({
        entryPoints: [VIRTUAL_ENTRY],
        bundle: true,
        write: false,
        outdir: request.outputDirectory.fsPath,
        entryNames: "preview",
        assetNames: "assets/[name]-[hash]",
        chunkNames: "chunks/[name]-[hash]",
        platform: "browser",
        format: "esm",
        target: ["es2022"],
        jsx: "automatic",
        sourcemap: "inline",
        logLevel: "silent",
        metafile: true,
        absWorkingDir: projectRoot,
        loader: {
          ".png": "dataurl",
          ".jpg": "dataurl",
          ".jpeg": "dataurl",
          ".gif": "dataurl",
          ".webp": "dataurl",
          ".svg": "dataurl",
          ".ico": "dataurl",
          ".woff": "dataurl",
          ".woff2": "dataurl",
          ".ttf": "dataurl",
        },
        plugins: [virtualPlugin, unsavedDocumentsPlugin, unsavedStylesPlugin],
      });

      const outputFiles = result.outputFiles ?? [];
      const jsFile = outputFiles.find((file) =>
        file.path.endsWith("preview.js"),
      );
      const cssFile = outputFiles.find((file) =>
        file.path.endsWith("preview.css"),
      );

      if (!jsFile) {
        return {
          ok: false,
          message: "esbuild completed without producing preview.js.",
          details: [],
        };
      }

      const assets: PreviewAsset[] = outputFiles
        .filter((file) => file !== jsFile && file !== cssFile)
        .map((file) => ({
          absolutePath: file.path,
          relativePath: path.relative(
            request.outputDirectory.fsPath,
            file.path,
          ),
          contents: file.contents,
        }));

      return {
        ok: true,
        entryJavaScript: jsFile.text,
        stylesheet: cssFile?.text,
        assets,
      };
    } catch (error) {
      if (isBuildFailure(error)) {
        return {
          ok: false,
          message: "Unable to build this React preview.",
          details: [
            ...formatBuildMessages(error.errors),
            ...formatBuildMessages(error.warnings),
          ],
        };
      }

      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        details: [],
      };
    }
  }

  dispose(): void {}
}
