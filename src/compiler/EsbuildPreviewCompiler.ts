import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as fg from "fast-glob";
import * as path from "node:path";

import * as esbuild from "esbuild";
import postcssLoadConfig from "postcss-load-config";
import * as vscode from "vscode";

import { DocumentOverlay } from "../vscode/DocumentOverlay";
import logger from "../utils/logger";

import {
  PreviewAsset,
  PreviewBuildRequest,
  PreviewBuildResult,
  PreviewBuildSession,
  PreviewCompiler,
} from "./PreviewCompiler";

import { createVirtualEntry } from "./virtualEntry";

const SOURCE_FILTER = /\.(?:[cm]?[jt]sx?)$/i;
const CSS_FILTER = /\.css$/i;
const CSS_MODULE_FILTER = /\.module\.css$/i;

const VIRTUAL_ENTRY = "peek:entry";
const VIRTUAL_NAMESPACE = "peek";

interface PostCssResult {
  css: string;
}

interface PostCssProcessor {
  process(
    css: string,
    options: Record<string, unknown>,
  ): Promise<PostCssResult>;
}

type PostCssFactory = (plugins?: unknown[]) => PostCssProcessor;

type StyleProcessor = (contents: string, filePath: string) => Promise<string>;

function loaderForSource(filePath: string): esbuild.Loader {
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".tsx")) return "tsx";

  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".mts") ||
    lower.endsWith(".cts")
  ) {
    return "ts";
  }

  if (lower.endsWith(".jsx")) return "jsx";

  return "js";
}

function formatBuildMessages(messages: esbuild.Message[]): string[] {
  return messages.map((message) => {
    if (!message.location) {
      return message.text;
    }

    const location = message.location;

    return (
      `${location.file}:` +
      `${location.line}:` +
      `${location.column + 1} — ` +
      message.text
    );
  });
}

function isBuildFailure(error: unknown): error is esbuild.BuildFailure {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Partial<esbuild.BuildFailure>;

  return Array.isArray(candidate.errors) && Array.isArray(candidate.warnings);
}

function failureResult(error: unknown): PreviewBuildResult {
  if (isBuildFailure(error)) {
    return {
      ok: false,
      message: "Não foi possível construir a pré-visualização React.",
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

function mapBuildResult(
  result: esbuild.BuildResult,
  request: PreviewBuildRequest,
): PreviewBuildResult {
  const outputFiles = result.outputFiles ?? [];

  const jsFile = outputFiles.find((file) => file.path.endsWith("preview.js"));

  const cssFile = outputFiles.find((file) => file.path.endsWith("preview.css"));

  if (!jsFile) {
    return {
      ok: false,
      message: "esbuild completou sem produzir um arquivo preview.js",
      details: [],
    };
  }

  const assets: PreviewAsset[] = outputFiles
    .filter((file) => file !== jsFile && file !== cssFile)
    .map((file) => ({
      absolutePath: file.path,
      relativePath: path.relative(request.outputDirectory.fsPath, file.path),
      contents: file.contents,
    }));

  return {
    ok: true,
    entryJavaScript: jsFile.text,
    stylesheet: cssFile?.text,
    assets,
  };
}

function findProjectRoot(componentPath: string): string {
  let current = path.dirname(componentPath);

  while (true) {
    const packageJson = path.join(current, "package.json");

    if (fs.existsSync(packageJson)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  const workspace = vscode.workspace.getWorkspaceFolder(
    vscode.Uri.file(componentPath),
  );

  return workspace?.uri.fsPath ?? path.dirname(componentPath);
}

function isProjectSource(filePath: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }

  const segments = relative.split(path.sep);

  return !segments.includes("node_modules");
}

function findFilesByRegex(dir: string, regexPattern: RegExp) {
  return fg.sync(regexPattern.source, {
    cwd: dir,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
}

async function readMatchedFile(pattern: string): Promise<string | undefined> {
  const files = await fg.async(pattern, { ignore: ["**/node_modules/**"] });

  if (files.length === 0) {
    return undefined;
  }

  const content = await fs.promises.readFile(files[0], "utf-8");
  return content;
}

function findTailwindConfig(projectRoot: string): string | undefined {
  const candidates = [
    "tailwind.config.js",
    "tailwind.config.cjs",
    "tailwind.config.mjs",
    "tailwind.config.ts",
  ];

  return candidates
    .map((file) => path.join(projectRoot, file))
    .find((file) => fs.existsSync(file));
}

function unwrapDefault<T>(module: unknown): T {
  if (typeof module === "object" && module !== null && "default" in module) {
    return (
      module as {
        default: T;
      }
    ).default;
  }

  return module as T;
}

function tryResolve(
  projectRequire: NodeJS.Require,
  packageName: string,
): boolean {
  try {
    projectRequire.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

async function createStyleProcessor(
  projectRoot: string,
): Promise<StyleProcessor | undefined> {
  const packageJsonPath = path.join(projectRoot, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  const projectRequire = createRequire(packageJsonPath);

  if (!tryResolve(projectRequire, "postcss")) {
    return undefined;
  }

  const postcss = unwrapDefault<PostCssFactory>(projectRequire("postcss"));

  try {
    const config = await postcssLoadConfig(
      {
        cwd: projectRoot,
        env: "development",
      },
      projectRoot,
    );

    logger.print(`[Peek] PostCSS config: ${config.file}`);

    const processor = postcss(config.plugins);

    return async (contents: string, filePath: string): Promise<string> => {
      const result = await processor.process(contents, {
        ...config.options,
        from: filePath,
        to: filePath,
        map: false,
      });

      return result.css;
    };
  } catch (error) {
    logger.print(
      `[Peek] No usable PostCSS config found: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!tryResolve(projectRequire, "tailwindcss/package.json")) {
    return undefined;
  }

  const tailwindPackage = projectRequire("tailwindcss/package.json") as {
    version: string;
  };

  const major = Number(tailwindPackage.version.split(".")[0]);

  logger.print(`[Peek] Tailwind ${tailwindPackage.version}`);

  if (major === 2 || major === 3) {
    const tailwindFactory = unwrapDefault<(config?: string) => unknown>(
      projectRequire("tailwindcss"),
    );

    const configPath = findTailwindConfig(projectRoot);

    const plugins: unknown[] = [tailwindFactory(configPath)];

    if (tryResolve(projectRequire, "autoprefixer")) {
      const autoprefixer = unwrapDefault<() => unknown>(
        projectRequire("autoprefixer"),
      );

      plugins.push(autoprefixer());
    }

    const processor = postcss(plugins);

    return async (contents: string, filePath: string): Promise<string> => {
      const result = await processor.process(contents, {
        from: filePath,
        to: filePath,
        map: false,
      });

      return result.css;
    };
  }

  if (major >= 4) {
    if (!tryResolve(projectRequire, "@tailwindcss/postcss")) {
      throw new Error(
        `Tailwind ${tailwindPackage.version} ` +
          "foi detectado, mas " +
          "@tailwindcss/postcss não está instalado " +
          "neste projeto.",
      );
    }

    const tailwindPostCss = unwrapDefault<
      (options?: { base?: string; optimize?: boolean }) => unknown
    >(projectRequire("@tailwindcss/postcss"));

    const processor = postcss([
      tailwindPostCss({
        base: projectRoot,
      }),
    ]);

    return async (contents: string, filePath: string): Promise<string> => {
      const result = await processor.process(contents, {
        from: filePath,
        to: filePath,
        map: false,
      });

      return result.css;
    };
  }

  return undefined;
}

class EsbuildPreviewBuildSession implements PreviewBuildSession {
  private disposed = false;

  constructor(
    private readonly context: esbuild.BuildContext,
    private readonly request: PreviewBuildRequest,
    private readonly onDispose: () => void,
  ) {}

  async rebuild(): Promise<PreviewBuildResult> {
    if (this.disposed) {
      return {
        ok: false,
        message: "Essa sessão de pré-visualização não existe mais.",
        details: [],
      };
    }

    try {
      const result = await this.context.rebuild();

      return mapBuildResult(result, this.request);
    } catch (error) {
      return failureResult(error);
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    this.onDispose();

    void this.context.dispose();
  }
}

export class EsbuildPreviewCompiler implements PreviewCompiler {
  private readonly sessions = new Set<EsbuildPreviewBuildSession>();

  private disposed = false;

  constructor(private readonly overlay: DocumentOverlay) {}

  async createSession(
    request: PreviewBuildRequest,
  ): Promise<PreviewBuildSession> {
    if (this.disposed) {
      throw new Error("EsbuildPreviewCompiler não existe mais.");
    }

    const componentPath = request.sourceUri.fsPath;

    const projectRoot = findProjectRoot(componentPath);

    logger.print(`[Peek] Project root: ${projectRoot}`);

    const styleProcessor = await createStyleProcessor(projectRoot);

    const resolvedGlobalStyles = request.globalStyles.map((style) =>
      path.isAbsolute(style) ? style : path.join(projectRoot, style),
    );

    const discoveredStyles = findFilesByRegex(projectRoot, CSS_FILTER);

    const virtualEntry = createVirtualEntry({
      componentPath,
      previewExport: request.previewExport,
      globalStyles: [
        ...new Set([...resolvedGlobalStyles, ...discoveredStyles]),
      ],
    });

    const overlay = this.overlay;

    const virtualPlugin: esbuild.Plugin = {
      name: "peek-virtual-entry",

      setup(build) {
        build.onResolve(
          {
            filter: /^peek:entry$/,
          },
          () => ({
            path: VIRTUAL_ENTRY,
            namespace: VIRTUAL_NAMESPACE,
          }),
        );

        build.onLoad(
          {
            filter: /.*/,
            namespace: VIRTUAL_NAMESPACE,
          },
          () => ({
            contents: virtualEntry,
            loader: "tsx",
            resolveDir: path.dirname(componentPath),
          }),
        );
      },
    };

    const unsavedDocumentsPlugin: esbuild.Plugin = {
      name: "peek-unsaved-documents",

      setup(build) {
        build.onLoad(
          {
            filter: SOURCE_FILTER,
            namespace: "file",
          },
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

    const stylePlugin: esbuild.Plugin = {
      name: "peek-styles",

      setup(build) {
        build.onLoad(
          {
            filter: CSS_FILTER,
            namespace: "file",
          },
          async (args) => {
            let contents = await overlay.captureAndGet(args.path);

            if (contents === undefined) {
              try {
                contents = await readMatchedFile(args.path);
              } catch {}
              if (contents === undefined) return undefined;
            }

            if (styleProcessor && isProjectSource(args.path, projectRoot)) {
              contents = await styleProcessor(contents, args.path);
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

    const context = await esbuild.context({
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

      plugins: [virtualPlugin, unsavedDocumentsPlugin, stylePlugin],
    });

    let session: EsbuildPreviewBuildSession;

    session = new EsbuildPreviewBuildSession(context, request, () => {
      this.sessions.delete(session);
    });

    this.sessions.add(session);

    return session;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const session of [...this.sessions]) {
      session.dispose();
    }

    this.sessions.clear();
  }
}
