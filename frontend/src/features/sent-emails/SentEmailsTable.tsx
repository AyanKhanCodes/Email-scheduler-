import React from 'react';
import { Email } from '../../types';
import { CheckCircle2, XCircle, Calendar } from 'lucide-react';

interface SentEmailsTableProps {
  emails: Email[];
  loading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
}

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({
  emails,
  loading,
  total,
  page,
  limit,
  onPageChange,
}) => {
  const totalPages = Math.ceil(total / limit) || 1;

  if (loading) {
    return (
      <div className="bg-[#121622] rounded-2xl border border-slate-800 p-8 text-center">
        <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm text-slate-400">Loading delivery history...</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="bg-[#121622] rounded-2xl border border-slate-800 p-12 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/50 text-slate-400 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h4 className="text-base font-semibold text-white">No sent emails yet</h4>
        <p className="mt-1 text-sm text-slate-400 max-w-sm mx-auto">
          As soon as your scheduled jobs reach execution time and are delivered through Ethereal SMTP, they will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#121622] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-[#181e2e] text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th scope="col" className="px-6 py-4">Recipient Email</th>
              <th scope="col" className="px-6 py-4">Subject</th>
              <th scope="col" className="px-6 py-4">Sender</th>
              <th scope="col" className="px-6 py-4">Sent Time</th>
              <th scope="col" className="px-6 py-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {emails.map((email) => {
              const isSent = email.status === 'sent';
              const sentDate = email.sentAt ? new Date(email.sentAt) : new Date(email.updatedAt);

              return (
                <tr key={email.id} className="hover:bg-[#161c2b] transition">
                  <td className="px-6 py-4 font-medium text-white flex items-center space-x-2">
                    <span className="truncate max-w-[200px]">{email.recipientEmail}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-200 line-clamp-1 max-w-[280px]">
                      {email.subject}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">
                    {email.sender?.email || 'Default Sender'}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{sentDate.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {isSent ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                        Sent
                      </span>
                    ) : (
                      <span
                        title={email.failureReason || 'Delivery failure'}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1 text-rose-400" />
                        Failed
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 text-xs text-slate-400 bg-[#141926]">
          <span>
            Showing page {page} of {totalPages} ({total} emails)
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#181e2e] text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-[#181e2e] text-slate-300 disabled:opacity-40 hover:bg-slate-700 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
