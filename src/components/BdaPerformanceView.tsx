import { useState, useEffect, useMemo } from 'react';
import { Loader2, Users, CheckCircle2, Calendar, DollarSign, Filter, X, Mail, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { usePlanConfig, type PlanName } from '../context/PlanConfigContext';
import { format, parseISO } from 'date-fns';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
type BookingStatus = 'paid' | 'scheduled' | 'completed';

interface Lead {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  scheduledEventStartTime?: string;
  bookingStatus: BookingStatus;
  paymentPlan?: {
    name: PlanName;
    price: number;
    currency?: string;
    displayPrice?: string;
  };
  meetingNotes?: string;
  anythingToKnow?: string;
  claimedBy?: {
    email: string;
    name: string;
    claimedAt: string;
  };
}

interface PerformanceData {
  overview: {
    totalClaimed: number;
    paid: number;
    scheduled: number;
    completed: number;
    totalRevenue: number;
  };
  statusBreakdown: {
    paid: number;
    scheduled: number;
    completed: number;
  };
  planBreakdown: Array<{
    _id: PlanName;
    count: number;
    revenue: number;
  }>;
  monthlyTrend: Array<{
    _id: {
      year: number;
      month: number;
    };
    count: number;
    revenue: number;
  }>;
  leads: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

function BdaPerformanceContent() {
  const { user, token } = useCrmAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceData | null>(null);
  
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<PlanName | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { planOptions, incentiveConfig } = usePlanConfig();

  useEffect(() => {
    fetchPerformance();
  }, [fromDate, toDate, statusFilter, planFilter, currentPage]);

  const fetchPerformance = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
      });

      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('plan', planFilter);

      const response = await fetch(`${API_BASE_URL}/api/bda/performance?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch performance data');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setStatusFilter('all');
    setPlanFilter('all');
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = parseISO(dateString);
      return format(date, 'MMM d, yyyy • h:mm a');
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const hasActiveFilters = fromDate || toDate || statusFilter !== 'all' || planFilter !== 'all';

  const getIncentiveForLead = (lead: Lead) => {
    const plan = lead.paymentPlan;
    if (!plan || !plan.name || lead.bookingStatus !== 'paid') return 0;
    const amountPaid = plan.price ?? 0;
    if (amountPaid <= 0) return 0;
    const config = incentiveConfig[plan.name];
    if (!config) return 0;
    const basePrice = config.basePriceUsd > 0 ? config.basePriceUsd : 1;
    const paymentRatio = Math.min(1, amountPaid / basePrice);
    return config.incentivePerLeadInr * paymentRatio;
  };

  const totalCommission = useMemo(() => {
    if (!data) return 0;
    return data.leads
      .filter((l) => l.bookingStatus === 'paid')
      .reduce((sum, l) => sum + getIncentiveForLead(l), 0);
  }, [data, incentiveConfig]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-1">BDA PERFORMANCE</p>
          <h2 className="text-2xl font-bold text-slate-900">Performance Analysis</h2>
          <p className="text-slate-600 mt-1">{user?.name} ({user?.email})</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition ${
              showFilters || hasActiveFilters
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Filter size={16} />
            Filters
            {hasActiveFilters && (
              <span className="bg-white text-orange-500 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {[fromDate, toDate, statusFilter !== 'all', planFilter !== 'all'].filter(Boolean).length}
              </span>
            )}
          </button>
          {/* {data.leads.length > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition"
            >
              <Download size={16} />
              Export CSV
            </button>
          )} */}
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Advanced Filters</h3>
            <button
              onClick={handleResetFilters}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Reset All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as BookingStatus | 'all');
                  setCurrentPage(1);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Plan</label>
              <select
                value={planFilter}
                onChange={(e) => {
                  setPlanFilter(e.target.value as PlanName | 'all');
                  setCurrentPage(1);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">All Plans</option>
                {planOptions.map((p) => (
                  <option key={p.key} value={p.key}>{p.label} ({p.displayPrice})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.totalClaimed}</div>
          <div className="text-sm text-slate-600">Total Claimed</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <CheckCircle2 className="text-emerald-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.paid}</div>
          <div className="text-sm text-slate-600">Paid Leads</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Calendar className="text-blue-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.scheduled}</div>
          <div className="text-sm text-slate-600">Scheduled</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <DollarSign className="text-emerald-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-emerald-600 mb-1">${data.overview.totalRevenue.toLocaleString()}</div>
          <div className="text-sm text-slate-600">Total Revenue</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-50 p-3 rounded-lg">
              <DollarSign className="text-emerald-700" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-emerald-700 mb-1">₹{totalCommission.toFixed(0)}</div>
          <div className="text-sm text-slate-600">Total Incentives (paid leads)</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Status Breakdown</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Paid</span>
              <span className="text-lg font-bold text-emerald-600">{data.statusBreakdown.paid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Scheduled</span>
              <span className="text-lg font-bold text-blue-600">{data.statusBreakdown.scheduled}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Completed</span>
              <span className="text-lg font-bold text-green-600">{data.statusBreakdown.completed}</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Plan Breakdown</h3>
          {data.planBreakdown.length === 0 ? (
            <div className="text-center py-4 text-slate-500">No plan data available</div>
          ) : (
            <div className="space-y-3">
              {data.planBreakdown.map((plan) => (
                <div key={plan._id} className="flex items-center justify-between">
                  <span className="text-slate-700">{plan._id}</span>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-900">{plan.count} leads</div>
                    <div className="text-sm text-emerald-600">${plan.revenue.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Leads ({data.pagination.total})</h3>
        </div>
        {data.leads.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No leads found with current filters
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Client</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Plan</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Claimed</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Meeting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((lead) => (
                    <tr
                      key={lead.bookingId}
                      onClick={() => setSelectedLead(lead)}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{lead.clientName || 'N/A'}</div>
                        <div className="text-xs text-slate-500">{lead.bookingId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-700">{lead.clientEmail || 'N/A'}</div>
                        {lead.clientPhone && (
                          <div className="text-xs text-slate-500">{lead.clientPhone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.bookingStatus)}`}>
                          {lead.bookingStatus.toUpperCase()}
                        </span>
                      </td>
                    <td className="px-4 py-3 text-slate-700">
                      {lead.paymentPlan?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {lead.paymentPlan?.displayPrice || '$0'}
                      {lead.bookingStatus === 'paid' && lead.paymentPlan?.price && (
                        <div className="text-xs text-emerald-700 mt-1">
                          +₹{getIncentiveForLead(lead).toFixed(0)} incentives
                        </div>
                      )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lead.claimedBy?.claimedAt ? format(parseISO(lead.claimedBy.claimedAt), 'MMM d, yyyy') : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lead.scheduledEventStartTime ? format(parseISO(lead.scheduledEventStartTime), 'MMM d, yyyy') : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  Showing {((data.pagination.page - 1) * data.pagination.limit) + 1} to {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of {data.pagination.total} leads
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={data.pagination.page === 1}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm text-slate-700 px-3">
                    Page {data.pagination.page} of {data.pagination.pages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(data.pagination.pages, p + 1))}
                    disabled={data.pagination.page === data.pagination.pages}
                    className="p-2 border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedLead.clientName || 'Lead Details'}</h2>
                <p className="text-sm text-slate-600 mt-1">Booking ID: {selectedLead.bookingId}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={24} className="text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Client Email</label>
                    <div className="flex items-center gap-2 text-slate-900">
                      <Mail size={16} />
                      {selectedLead.clientEmail || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Client Phone</label>
                    <div className="flex items-center gap-2 text-slate-900">
                      <Phone size={16} />
                      {selectedLead.clientPhone || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(selectedLead.bookingStatus)}`}>
                      {selectedLead.bookingStatus.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Plan</label>
                    <div className="text-slate-900">
                      {selectedLead.paymentPlan?.name || 'N/A'} - {selectedLead.paymentPlan?.displayPrice || '$0'}
                    </div>
                    {selectedLead.bookingStatus === 'paid' && selectedLead.paymentPlan?.price && (
                      <div className="mt-2 text-sm">
                        <span className="text-slate-700 mr-1">Incentive:</span>
                        <span className="font-semibold text-emerald-700">
                          ₹{getIncentiveForLead(selectedLead).toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Meeting Time</label>
                    <div className="flex items-center gap-2 text-slate-900">
                      <Calendar size={16} />
                      {formatDate(selectedLead.scheduledEventStartTime || '')}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Claimed Date</label>
                    <div className="text-slate-900">
                      {selectedLead.claimedBy?.claimedAt ? format(parseISO(selectedLead.claimedBy.claimedAt), 'MMM d, yyyy • h:mm a') : 'N/A'}
                    </div>
                  </div>
                </div>
                {(selectedLead.meetingNotes || selectedLead.anythingToKnow) && (
                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    {selectedLead.meetingNotes && (
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Meeting Notes</label>
                        <div className="bg-slate-50 rounded-lg p-4 text-slate-900">
                          {selectedLead.meetingNotes}
                        </div>
                      </div>
                    )}
                    {selectedLead.anythingToKnow && (
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Information</label>
                        <div className="bg-slate-50 rounded-lg p-4 text-slate-900">
                          {selectedLead.anythingToKnow}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BdaPerformanceView() {
  return <BdaPerformanceContent />;
}
