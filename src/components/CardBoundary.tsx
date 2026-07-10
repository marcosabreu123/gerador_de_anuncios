"use client";

import { Component, type ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// Rede de segurança pros cards de perguntas agrupadas: se o componente
// principal (CardAgrupado, com dados dinâmicos vindos do modelo pro bloco
// de segmento) falhar ao renderizar por qualquer motivo, mostra um
// fallback simples em vez de travar o lojista numa tela quebrada.
export default class CardBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("[CardBoundary] card de perguntas falhou, usando fallback:", error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
