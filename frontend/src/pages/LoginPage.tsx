import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { Mail, Zap, Shield, Sparkles, Clock } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { user, loading, loginWithGoogle, loginWithDev } = useAuth();
  const [demoLoading, setDemoLoading] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0e14]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleDemoSignIn = async () => {
    setDemoLoading(true);
    try {
      await loginWithDev('demo.engineer@reachinbox.ai', 'ReachInbox Demo Engineer');
    } catch (err: any) {
      alert(`Login error: ${err.message}`);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/20 mb-4">
          <Mail className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          ReachInbox
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Full-Stack Asynchronous Email Job Scheduler & Concurrency Engine
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#121622] py-8 px-6 shadow-2xl rounded-2xl border border-slate-800 sm:px-10">
          <div className="space-y-4">
            {/* Google OAuth Button */}
            <button
              onClick={loginWithGoogle}
              className="w-full flex items-center justify-center px-4 py-3 border border-slate-700 rounded-xl shadow-sm bg-[#181e2e] text-sm font-semibold text-white hover:bg-[#1f273b] transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign in with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#121622] px-3 text-slate-500 font-medium">Or one-click evaluation</span>
              </div>
            </div>

            {/* Dev Demo Login Button */}
            <button
              onClick={handleDemoSignIn}
              disabled={demoLoading}
              className="w-full flex items-center justify-center px-4 py-3 rounded-xl shadow-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white hover:from-indigo-500 hover:to-violet-500 transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {demoLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Instant Demo Sign In
                </>
              )}
            </button>
          </div>

          {/* Architecture badges */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>BullMQ Delayed Jobs</span>
            </div>
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Redis Atomic Limiter</span>
            </div>
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Distributed Spacing</span>
            </div>
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-sky-400" />
              <span>Ethereal SMTP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
