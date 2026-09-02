export interface VirtualEntryOptions {
  componentPath: string;
  previewExport: string;
  globalStyles: string[];
}

export function createVirtualEntry(options: VirtualEntryOptions): string {
  const styleImports = options.globalStyles
    .map((stylePath) => `import ${JSON.stringify(stylePath)};`)
    .join("\n");

  return `
import * as React from "react";
import { createRoot } from "react-dom/client";
import * as PreviewModule from ${JSON.stringify(options.componentPath)};
${styleImports}

const PREVIEW_EXPORT = ${JSON.stringify(options.previewExport)};
const vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function showFatal(error) {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = "";
  const container = document.createElement("section");
  container.className = "runtime-error";

  const title = document.createElement("h2");
  title.textContent = "Preview crashed";

  const pre = document.createElement("pre");
  pre.textContent = formatError(error);

  container.append(title, pre);
  root.append(container);
  vscodeApi?.postMessage({ type: "runtime-error", message: formatError(error) });
}

class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    vscodeApi?.postMessage({ type: "runtime-error", message: formatError(error) });
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        "section",
        { className: "runtime-error" },
        React.createElement("h2", null, "Preview crashed"),
        React.createElement("pre", null, formatError(this.state.error))
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  if (event.error) showFatal(event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  showFatal(event.reason);
});

const Candidate = PreviewModule[PREVIEW_EXPORT] ?? PreviewModule.default;

if (!Candidate) {
  showFatal(new Error(
    'No renderable export found. Export "' + PREVIEW_EXPORT + '" or provide a default component export.'
  ));
} else {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error('Preview host is missing #root.');
  }

  const root = createRoot(rootElement);
  root.render(
    React.createElement(
      PreviewErrorBoundary,
      null,
      React.createElement(Candidate)
    )
  );
}
`;
}
