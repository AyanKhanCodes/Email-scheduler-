import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { X, Upload, Mail, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { Sender } from '../../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onScheduled }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [manualRecipients, setManualRecipients] = useState('');
  const [detectedRecipients, setDetectedRecipients] = useState<string[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [delayBetweenMs, setDelayBetweenMs] = useState<number>(2000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load senders
  useEffect(() => {
    if (isOpen) {
      api.getSenders()
        .then((res) => {
          if (res.success && res.senders.length > 0) {
            setSenders(res.senders);
            setSelectedSenderId(res.senders[0].id);
          }
        })
        .catch(console.error);

      // Default start time to now + 1 minute in local time
      const nextMin = new Date(Date.now() + 60000);
      const localIso = new Date(nextMin.getTime() - nextMin.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setStartTime(localIso);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // File Upload Parser using Papa Parse
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const foundEmails: string[] = [];

        results.data.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              const val = String(cell).trim();
              if (emailRegex.test(val)) {
                foundEmails.push(val);
              }
            });
          } else if (typeof row === 'object' && row !== null) {
            Object.values(row).forEach((val) => {
              const str = String(val).trim();
              if (emailRegex.test(str)) {
                foundEmails.push(str);
              }
            });
          }
        });

        const unique = Array.from(new Set(foundEmails));
        setDetectedRecipients(unique);
        if (unique.length === 0) {
          setError('No valid email addresses found in the uploaded file.');
        } else {
          setError(null);
        }
      },
      error: (err) => {
        setError(`Failed to parse CSV file: ${err.message}`);
      },
    });
  };

  // Combine manual recipients and file recipients
  const getAllRecipients = (): string[] => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const manual = manualRecipients
      .split(/[\n,;\s]+/)
      .map((e) => e.trim())
      .filter((e) => emailRegex.test(e));

    return Array.from(new Set([...detectedRecipients, ...manual]));
  };

  const recipients = getAllRecipients();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (recipients.length === 0) {
      setError('Please provide at least one valid recipient email address.');
      return;
    }

    if (!subject.trim()) {
      setError('Please provide an email subject.');
      return;
    }

    if (!body.trim()) {
      setError('Please provide an email body.');
      return;
    }

    setLoading(true);
    try {
      const scheduledIso = startTime ? new Date(startTime).toISOString() : new Date().toISOString();
      const res = await api.scheduleEmails({
        recipients,
        subject: subject.trim(),
        body: body.trim(),
        senderId: selectedSenderId || undefined,
        startTime: scheduledIso,
        delayBetweenEmailsMs: Number(delayBetweenMs),
      });

      if (res.success) {
        setSuccessMsg(`Successfully scheduled ${res.count} emails!`);
        setTimeout(() => {
          onScheduled();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to schedule emails.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121622] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold text-white">Compose & Schedule Campaign</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center space-x-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Sender Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              From (Sender Identity)
            </label>
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} &lt;{s.email}&gt; (Limit: {s.hourlyLimit}/hr, Min delay: {s.minimumDelay}ms)
                </option>
              ))}
            </select>
          </div>

          {/* Recipients Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Recipients
              </label>
              <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                {recipients.length} valid email{recipients.length === 1 ? '' : 's'} detected
              </span>
            </div>

            {/* CSV File Upload Dropzone */}
            <div className="relative border border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-indigo-500/50 hover:bg-[#181e2e]/50 transition cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="flex items-center justify-center space-x-2 text-sm text-slate-400">
                <Upload className="w-4 h-4 text-indigo-400" />
                <span>Upload recipient CSV / text file or drop here</span>
              </div>
            </div>

            {/* Manual input */}
            <textarea
              placeholder="Or enter recipient emails separated by comma or new line..."
              rows={2}
              value={manualRecipients}
              onChange={(e) => setManualRecipients(e.target.value)}
              className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Subject
            </label>
            <input
              type="text"
              placeholder="e.g. Scaling distributed queues with BullMQ"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
              Email Body
            </label>
            <textarea
              placeholder="Write your email content here..."
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Scheduling Timing Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1 flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                Start Time (Local)
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Delay Between Emails (ms)
              </label>
              <input
                type="number"
                min={2000}
                step={500}
                value={delayBetweenMs}
                onChange={(e) => setDelayBetweenMs(Number(e.target.value))}
                className="w-full bg-[#181e2e] border border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[11px] text-slate-500">System minimum floor: 2000ms</span>
            </div>
          </div>

          {/* Footer Action */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || recipients.length === 0}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>Schedule {recipients.length} Email{recipients.length === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
