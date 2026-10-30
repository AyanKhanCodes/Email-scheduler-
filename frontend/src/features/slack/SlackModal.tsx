import React, { useState } from 'react';
import { X, Slack, CheckCircle, AlertCircle, Unlink } from 'lucide-react';
import { api } from '../../services/api';
import { SlackConnection } from '../../types';

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: SlackConnection | null;
  onStatusChanged: () => void;
}

export const SlackModal: React.FC<SlackModalProps> = ({
  isOpen,
  onClose,
  connection,
  onStatusChanged,
}) => {
  const [slackUserId, setSlackUserId] = useState(connection?.slackUserId || 'U0123456789');
  const [teamName, setTeamName] = useState(connection?.teamName || 'Engineering Ops Workspace');
  const [botToken, setBotToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleOAuthConnect = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
    window.location.href = `${apiBase}/api/slack/connect`;
  };

  const handleDevConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.devConnectSlack({
        slackUserId: slackUserId.trim(),
        teamName: teamName.trim(),
        botToken: botToken.trim() || undefined,
      });
      onStatusChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect Slack');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Slack notifications?')) return;
    setLoading(true);
    try {
      await api.disconnectSlack();
      onStatusChanged();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-[#4A154B]/30 border border-[#E01E5A]/30">
              <Slack className="w-5 h-5 text-[#ECB22E]" />
            </div>
            <h3 className="text-lg font-bold text-white">Slack Notifications</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {connection ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-emerald-300">Slack Connected</p>
                  <p className="text-slate-300 mt-1">Workspace: <span className="font-medium text-white">{connection.teamName}</span></p>
                  <p className="text-slate-400 text-xs mt-0.5">User DM target: {connection.slackUserId}</p>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                When any email sender exceeds their configured hourly rate limit, an automated alert will be dispatched to your Slack DM with details on rescheduled jobs.
              </p>

              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-sm font-semibold transition"
              >
                <Unlink className="w-4 h-4" />
                <span>Disconnect Slack</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-300 leading-relaxed">
                Connect your Slack workspace to receive instant real-time alerts whenever sender hourly rate limits are reached.
              </p>

              {/* OAuth flow */}
              <button
                onClick={handleOAuthConnect}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl bg-[#4A154B] hover:bg-[#611f69] text-white text-sm font-bold shadow-md transition"
              >
                <Slack className="w-5 h-5" />
                <span>Connect with Slack OAuth</span>
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#121622] px-3 text-slate-500 font-medium">Or configure direct bot token / user ID</span>
                </div>
              </div>

              {/* Direct Dev Setup Form */}
              <form onSubmit={handleDevConnect} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Slack User ID (for DM alerts)
                  </label>
                  <input
                    type="text"
                    value={slackUserId}
                    onChange={(e) => setSlackUserId(e.target.value)}
                    placeholder="e.g. U0123456789"
                    required
                    className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Team / Workspace Name
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="ReachInbox Engineering"
                    required
                    className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Slack Bot Token (Optional, e.g. xoxb-...)
                  </label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="Leave blank for test mode"
                    className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg transition"
                >
                  {loading ? 'Saving...' : 'Save & Link Slack'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
