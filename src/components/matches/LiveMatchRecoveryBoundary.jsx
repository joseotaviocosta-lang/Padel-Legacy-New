import React from 'react';

// Mantém o TournamentModal montado quando um checkpoint legado passa pela
// hidratação mas ainda provoca uma exceção de render/runtime no LiveMatch.
// O fallback visual é controlado pelo modal; este boundary só impede que o
// erro derrube a rota inteira e devolva o jogador silenciosamente à Home.
export default class LiveMatchRecoveryBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    this.props.onRecoveryError?.(error, info);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
