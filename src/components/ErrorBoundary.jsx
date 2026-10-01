import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Maestro crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-fallback panel">
          <h2>Something went wrong</h2>
          <p>The app ran into an unexpected error. Reload the page to pick up where you left off — your game is saved.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
