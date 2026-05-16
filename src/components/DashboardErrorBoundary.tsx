import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  // Resetting on this key boundary unmounts the error state when the user
  // selects a different repository.
  resetKey?: string;
}

interface State {
  error: Error | null;
}

// Single-responsibility: catch render-time errors inside the dashboard
// subtree and present a recoverable fallback instead of a blank window.
export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[DashboardErrorBoundary]", error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private handleReset = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertOctagon className="size-8 text-destructive" />
        <h2 className="text-base font-semibold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {this.state.error.message}
        </p>
        <Button size="sm" variant="outline" onClick={this.handleReset}>
          Try again
        </Button>
      </div>
    );
  }
}
