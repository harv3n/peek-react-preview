# Peek

Peek é uma extensão para Visual Studio Code que permite visualizar componentes React diretamente no editor, sem precisar iniciar a aplicação completa.

A ideia é oferecer uma experiência simples de preview para componentes `.tsx` e `.jsx`, semelhante ao conceito de Preview do SwiftUI.

## Como funciona

Dentro do arquivo do componente, crie um export chamado `Preview`:

```tsx
export function Button() {
  return (
    <button>
      Salvar
    </button>
  );
}

export const Preview = () => (
  <Button />
);
```

O Peek identifica automaticamente o `Preview` e adiciona um CodeLens acima dele.

Clique em **Peek: Open Preview** para abrir o componente em uma janela de preview dentro do VS Code.

Também é possível abrir o preview pela Command Palette:

```text
Peek: Open Preview
```

## Componentes com propriedades

O `Preview` é um componente React comum, então você pode fornecer as propriedades necessárias diretamente nele:

```tsx
export function Badge({
  label,
}: {
  label: string;
}) {
  return <span>{label}</span>;
}

export const Preview = () => (
  <Badge label="Active" />
);
```

## Componentes interativos

Hooks locais do React podem ser utilizados normalmente:

```tsx
import { useState } from "react";

export function Counter() {
  const [value, setValue] = useState(0);

  return (
    <button
      onClick={() => setValue(value + 1)}
    >
      Count: {value}
    </button>
  );
}

export const Preview = () => (
  <Counter />
);
```

## Objetivo

O Peek é focado principalmente em componentes React pequenos e reutilizáveis, como:

* Buttons
* Inputs
* Cards
* Badges
* Modals
* Tabs
* Tooltips
* Form controls
* Componentes de Design Systems

A proposta é permitir testar e desenvolver esses componentes isoladamente, sem precisar navegar pela aplicação ou manter um servidor de desenvolvimento aberto apenas para visualizá-los.

## Suporte inicial

Peek foi pensado para projetos React utilizando:

* JavaScript
* TypeScript
* JSX
* TSX
* CSS
* CSS Modules
* Tailwind CSS
* imports relativos
* dependências instaladas no projeto
* aliases definidos no TypeScript

Componentes fortemente dependentes do runtime completo da aplicação, como páginas, autenticação, routing, estado global ou APIs, podem exigir configuração adicional ou não funcionar no preview isolado.

## Roadmap

- [ ] manter um `esbuild.Context` por pré-visualização aberta
- [ ] invalidação com reconhecimento de dependências
- [ ] detecção automática da raiz do projeto para monorepos
- [ ] adaptador Tailwind v3/v4
- [ ] enriquecimento do seletor de preview (`PreviewDefault`, `PreviewDisabled`, ...)
- [ ] tamanho de viewport configurável
- [ ] diagnósticos de build clicáveis ​​que abrem a linha de código-fonte
- [ ] React Fast Refresh
- [ ] adaptador de compatibilidade com o Vite para projetos que dependem genuinamente de transformações do Vite.