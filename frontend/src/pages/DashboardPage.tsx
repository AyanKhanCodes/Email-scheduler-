import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { api } from '../services/api';
import { Email, SlackConnection } from '../types';
import { ScheduledEmailsTable } from '../features/scheduled-emails/ScheduledEmailsTable';
import { SentEmailsTable } from '../features/sent-emails/SentEmailsTable';
import { ComposeModal } from '../features/compose/ComposeModal';
import { SlackModal } from '../features/slack/SlackModal';
import {
  Mail,
  Send,
  Clock,
  Plus,
  Search,
  Slack,
  LogOut,
  Layers,
  RefreshCw,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [scheduledLoading, setScheduledLoading] = useState(true);

  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPage, setSentPage] = useState(1);
  const [sentLoading, setSentLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Email[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);
  const [slackConnection, setSlackConnection] = useState<SlackConnection | null>(null);

  // Fetch Scheduled Emails
  const loadScheduled = useCallback(async (page = 1) => {
    try {
      const res = await api.getScheduled(page, 20);
      setScheduledEmails(res.data);
      setScheduledTotal(res.total);
      setScheduledPage(res.page);
    } catch (err) {
      console.error('Failed to load scheduled emails:', err);
    } finally {
      setScheduledLoading(false);
    }
  }, []);

  // Fetch Sent Emails
  const loadSent = useCallback(async (page = 1) => {
    try {
      const res = await api.getSent(page, 20);
      setSentEmails(res.data);
      setSentTotal(res.total);
      setSentPage(res.page);
    } catch (err) {
      console.error('Failed to load sent emails:', err);
    } finally {
      setSentLoading(false);
    }
  }, []);

  // Fetch Slack status
  const loadSlackStatus = useCallback(async () => {
    try {
      const res = await api.getSlackStatus();
      setSlackConnection(res.connection);
    } catch (err) {
      console.error('Failed to load Slack status:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadScheduled(1);
    loadSent(1);
    loadSlackStatus();
  }, [loadScheduled, loadSent, loadSlackStatus]);

  // Periodic Polling (every 10 seconds) for real-time visibility
  useEffect(() => {
    const timer = setInterval(() => {
      if (!searchQuery.trim()) {
        loadScheduled(scheduledPage);
        loadSent(sentPage);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [scheduledPage, sentPage, searchQuery, loadScheduled, loadSent]);

  // Handle Search via Elasticsearch API
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await api.search(searchQuery.trim(), 1, 50);
      setSearchResults(res.data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const queueUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/admin/queues`;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-[#121622] border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Product Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-md shadow-indigo-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold text-white tracking-tight">ReachInbox</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Scheduler
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* BullMQ Dashboard External Link */}
            <a
              href={queueUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-[#181e2e] text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition"
              title="Open Live BullMQ Queue Dashboard"
            >
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Bull Board</span>
            </a>

            {/* Slack Connection Pill */}
            <button
              onClick={() => setIsSlackOpen(true)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                slackConnection
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-[#181e2e] text-slate-300 border-slate-700 hover:text-white'
              }`}
            >
              <Slack className="w-4 h-4 text-[#ECB22E]" />
              <span className="hidden md:inline">
                {slackConnection ? `Slack: ${slackConnection.teamName}` : 'Connect Slack'}
              </span>
              <span className="md:hidden">{slackConnection ? 'Connected' : 'Slack'}</span>
            </button>

            {/* User Profile */}
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border border-slate-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                  {user?.name?.[0] || 'U'}
                </div>
              )}
              <span className="hidden lg:inline text-xs font-medium text-slate-200">
                {user?.name}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Logout"
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Action Bar: Search & Compose */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Elasticsearch Search Form */}
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search recipient, subject, status via Elasticsearch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#121622] border border-slate-800 rounded-xl pl-10 pr-20 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
            >
              {searchLoading ? '...' : 'Go'}
            </button>
          </form>

          {/* Right Action: Compose Button */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                loadScheduled(scheduledPage);
                loadSent(sentPage);
              }}
              title="Refresh"
              className="p-2.5 rounded-xl bg-[#121622] border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsComposeOpen(true)}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Compose New Email</span>
            </button>
          </div>
        </div>

        {/* Search Results View if Active */}
        {searchResults !== null ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">
                Elasticsearch Results for &quot;{searchQuery}&quot; ({searchResults.length} matches)
              </h3>
              <button
                onClick={clearSearch}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Back to all emails
              </button>
            </div>
            <SentEmailsTable
              emails={searchResults}
              loading={searchLoading}
              total={searchResults.length}
              page={1}
              limit={50}
              onPageChange={() => {}}
            />
          </div>
        ) : (
          /* Normal Tabbed View */
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex space-x-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'scheduled'
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121622]'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Scheduled Emails</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300">
                  {scheduledTotal}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('sent')}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeTab === 'sent'
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121622]'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>Sent Emails</span>
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300">
                  {sentTotal}
                </span>
              </button>
            </div>

            {/* Tab Panels */}
            {activeTab === 'scheduled' ? (
              <ScheduledEmailsTable
                emails={scheduledEmails}
                loading={scheduledLoading}
                total={scheduledTotal}
                page={scheduledPage}
                limit={20}
                onPageChange={(p) => loadScheduled(p)}
              />
            ) : (
              <SentEmailsTable
                emails={sentEmails}
                loading={sentLoading}
                total={sentTotal}
                page={sentPage}
                limit={20}
                onPageChange={(p) => loadSent(p)}
              />
            )}
          </div>
        )}
      </main>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onScheduled={() => {
          loadScheduled(1);
          loadSent(1);
        }}
      />

      {/* Slack Connection Modal */}
      <SlackModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
        connection={slackConnection}
        onStatusChanged={loadSlackStatus}
      />
    </div>
  );
};
