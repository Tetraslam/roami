'use client';

import * as React from 'react';
import { FirebaseError } from 'firebase/app';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class FirebaseErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Firebase Error:', error, errorInfo);
  }

  private getErrorMessage(error: Error): string {
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/invalid-login-credentials':
          return 'Invalid login credentials. Please try again.';
        case 'auth/popup-closed-by-user':
          return 'Sign in was cancelled. Please try again.';
        case 'auth/popup-blocked':
          return 'Sign in popup was blocked. Please allow popups and try again.';
        case 'auth/network-request-failed':
          return 'Network error. Please check your connection and try again.';
        case 'storage/unauthorized':
          return 'You do not have permission to perform this action.';
        case 'permission-denied':
          return 'You do not have permission to access this resource.';
        default:
          return `An error occurred: ${error.message}`;
      }
    }
    return 'An unexpected error occurred. Please try again.';
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-900">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-6 py-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-2">Oops! Something went wrong</h2>
              <p className="text-sm">{this.getErrorMessage(this.state.error)}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 