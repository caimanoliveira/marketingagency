import { Component, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="wrap">
          <h1>Algo deu errado.</h1>
          <p style={{ color: "#aaa" }}>
            {this.state.error?.message || "Erro desconhecido."}
          </p>
          <button className="btn-primary" onClick={this.reset}>Recarregar</button>
        </div>
      );
    }
    return this.props.children;
  }
}
