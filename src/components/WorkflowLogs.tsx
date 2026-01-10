import { useState, useEffect } from 'react';
import {
  Loader2,
  Mail,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

interface WorkflowLog {
  _id: string;
  logId: string;
  workflowId: string;
  workflowName?: string;
  triggerAction: 'no-show' | 'complete' | 'cancel' | 're-schedule';
  bookingId: string;
  clientEmail: string;
  clientName?: string;
  clientPhone?: string;
  step: {
    channel: 'email' | 'whatsapp';
    daysAfter: number;
    templateId: string;
    templateName?: string;
    order: number;
  };
  status: 'scheduled' | 'executed' | 'failed';
  scheduledFor: string;
  executedAt?: string;
  error?: string;
  errorDetails?: any;
  responseData?: any;
  createdAt: string;
}

type LogStatus = 'scheduled' | 'executed' | 'all';

export default function WorkflowLogs() {
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LogStatus>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    scheduled: 0,
    executed: 0,
    failed: 0,
  });

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page, activeTab]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const status = activeTab === 'all' ? undefined : activeTab;
      const response = await fetch(
        `${API_BASE_URL}/api/workflow-logs?page=${page}&limit=20${status ? `&status=${status}` : ''}`
      );
      const data = await response.json();
      
      if (data.success) {
        setLogs(data.data || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error fetching workflow logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workflow-logs/stats`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching workflow log stats:', error);
    }
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'no-show': 'No Show',
      'complete': 'Complete',
      'cancel': 'Cancel',
      're-schedule': 'Re-schedule',
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      'no-show': 'bg-rose-100 text-rose-700',
      'complete': 'bg-green-100 text-green-700',
      'cancel': 'bg-red-100 text-red-700',
      're-schedule': 'bg-amber-100 text-amber-700',
    };
    return colors[action] || 'bg-slate-100 text-slate-700';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">
            <Clock size={12} />
            Scheduled
          </span>
        );
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
            <CheckCircle2 size={12} />
            Executed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700">
            <XCircle size={12} />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="text-orange-500" size={32} />
            <h1 className="text-3xl font-bold text-slate-900">Workflow Logs</h1>
          </div>
          <p className="text-slate-600">
            Monitor workflow executions, scheduled tasks, and execution results
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Logs</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <FileText className="text-slate-400" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">{stats.scheduled}</p>
              </div>
              <Clock className="text-blue-400" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Executed</p>
                <p className="text-2xl font-bold text-green-600">{stats.executed}</p>
              </div>
              <CheckCircle2 className="text-green-400" size={24} />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
              <XCircle className="text-red-400" size={24} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="border-b border-slate-200">
            <div className="flex items-center gap-1 px-4">
              <button
                onClick={() => {
                  setActiveTab('all');
                  setPage(1);
                }}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'all'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                All Logs ({total})
              </button>
              <button
                onClick={() => {
                  setActiveTab('scheduled');
                  setPage(1);
                }}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'scheduled'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Scheduled ({stats.scheduled})
              </button>
              <button
                onClick={() => {
                  setActiveTab('executed');
                  setPage(1);
                }}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                  activeTab === 'executed'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Completed ({stats.executed})
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="animate-spin mx-auto text-orange-500" size={32} />
                <p className="text-slate-600 mt-2">Loading logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto text-slate-400 mb-3" size={48} />
                <p className="text-slate-600">No logs found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Action</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Client</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Channel</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Template</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Scheduled For</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Executed At</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Workflow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {logs.map((log) => (
                        <tr key={log.logId} className="hover:bg-slate-50 transition">
                          <td className="py-4 px-4">
                            {getStatusBadge(log.status)}
                          </td>
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${getActionColor(
                                log.triggerAction
                              )}`}
                            >
                              {getActionLabel(log.triggerAction)}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {log.clientName || 'Unknown'}
                              </p>
                              <p className="text-xs text-slate-500">{log.clientEmail}</p>
                              {log.clientPhone && (
                                <p className="text-xs text-slate-500">{log.clientPhone}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              {log.step.channel === 'email' ? (
                                <>
                                  <Mail size={16} className="text-blue-500" />
                                  <span className="text-sm text-slate-700">Email</span>
                                </>
                              ) : (
                                <>
                                  <MessageCircle size={16} className="text-green-500" />
                                  <span className="text-sm text-slate-700">WhatsApp</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <p className="text-sm text-slate-900 font-mono">
                                {log.step.templateId}
                              </p>
                              {log.step.daysAfter > 0 && (
                                <p className="text-xs text-slate-500">
                                  After {log.step.daysAfter} day{log.step.daysAfter !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-1 text-sm text-slate-700">
                              <Calendar size={14} />
                              {format(new Date(log.scheduledFor), 'MMM d, yyyy • h:mm a')}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            {log.executedAt ? (
                              <div className="flex items-center gap-1 text-sm text-slate-700">
                                <CheckCircle2 size={14} className="text-green-500" />
                                {format(new Date(log.executedAt), 'MMM d, yyyy • h:mm a')}
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <div>
                              <p className="text-sm text-slate-900">
                                {log.workflowName || 'Unnamed Workflow'}
                              </p>
                              <p className="text-xs text-slate-500 font-mono">
                                {log.workflowId.slice(0, 8)}...
                              </p>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Error Details */}
                {logs.some((log) => log.error) && (
                  <div className="mt-4 space-y-2">
                    {logs
                      .filter((log) => log.error)
                      .map((log) => (
                        <div
                          key={log.logId}
                          className="p-3 bg-red-50 border border-red-200 rounded-lg"
                        >
                          <div className="flex items-start gap-2">
                            <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-red-900">
                                {log.clientEmail} - {log.step.channel}
                              </p>
                              <p className="text-xs text-red-700 mt-1">{log.error}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
                    <div className="text-sm text-slate-600">
                      Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, total)} of {total} logs
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={16} className="inline" />
                        Previous
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (page <= 3) {
                            pageNum = i + 1;
                          } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = page - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setPage(pageNum)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                                page === pageNum
                                  ? 'bg-orange-500 text-white'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight size={16} className="inline" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              fetchLogs();
              fetchStats();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-sm font-semibold"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}

