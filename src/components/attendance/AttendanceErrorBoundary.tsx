import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Keeps a render error in an attendance screen from blanking the whole CRM.
 * Without it, one unexpected value from the server (a missing field, a new shape) unmounts the entire React tree.
 * The rest of the app keeps working and the user gets a plain message and a way to retry.
 */
interface Props {
  children: ReactNode;
  /** Shown in the message, for example "Deductions". */
  label: string;
}

interface State {
  failed: boolean;
}

export default class AttendanceErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log the failure for developers. It never includes tokens or customer data, only the error and component stack.
    console.error(`[${this.props.label}] screen failed to render:`, error.message, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold">{this.props.label} could not be shown.</p>
        <p className="mt-1">Something unexpected came back from the server. The rest of the CRM is not affected.</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: false })}
          className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Try again
        </button>
      </div>
    );
  }
}
