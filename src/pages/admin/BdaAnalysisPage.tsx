import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, Users, CheckCircle2, BarChart3, ArrowLeft, X, Mail, Phone, Calendar, DollarSign, FileText, Trash2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const ADMIN_TOKEN_KEY = 'flashfire_crm_admin_token';

type BookingStatus = 'paid' | 'scheduled' | 'completed';
type PlanName = 'PRIME' | 'IGNITE' | 'PROFESSIONAL' | 'EXECUTIVE';

interface BdaPerformance {
  _id: string;
  name: string;
  totalClaimed: number;
  paid: number;
  scheduled: number;
  completed: number;
  totalRevenue: number;
  totalIncentiveInr?: number;
}

interface AnalysisData {
  overview: {
    totalLeads: number;
    claimedLeads: number;
    unclaimedLeads: number;
  };
  statusBreakdown: {
    paid: number;
    scheduled: number;
    completed: number;
  };
  bdaPerformance: BdaPerformance[];
}

interface Lead {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  scheduledEventStartTime: string;
  bookingStatus: string;
  paymentPlan?: {
    name: string;
    price: number;
    currency: string;
    displayPrice: string;
  };
  meetingNotes?: string;
  anythingToKnow?: string;
  claimedBy?: {
    email: string;
    name: string;
    claimedAt: string;
  };
}

interface BdaDetailData {
  bda: {
    email: string;
    name: string;
    claimedAt: string;
  } | null;
  leads: Lead[];
}

export default function BdaAnalysisPage() {
  const navigate = useNavigate();
  const [adminToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [selectedBdaEmail, setSelectedBdaEmail] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<BdaDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<PlanName | 'all'>('all');
  const [bdaEmailFilter, setBdaEmailFilter] = useState('');
  const [commissionConfigs, setCommissionConfigs] = useState<
    Array<{ planName: PlanName; basePriceUsd: number; currency: string; incentivePerLeadInr: number }>
  >([]);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);

  const [unclaimBookingId, setUnclaimBookingId] = useState<string | null>(null);
  const [unclaimConfirm, setUnclaimConfirm] = useState(false);
  const [unclaimLoading, setUnclaimLoading] = useState(false);
  const [unclaimError, setUnclaimError] = useState<string | null>(null);

  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [editStatus, setEditStatus] = useState<string>('');
  const [editPlanName, setEditPlanName] = useState<PlanName | 'all'>('all');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminToken) {
      navigate('/admin/dashboard');
      return;
    }
    fetchAnalysis();
    fetchCommissionConfig();
  }, [adminToken, navigate, fromDate, toDate, statusFilter, planFilter, bdaEmailFilter]);

  const fetchAnalysis = async () => {
    if (!adminToken) return;
    
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (planFilter !== 'all') params.append('planName', planFilter);
      if (bdaEmailFilter.trim()) params.append('bdaEmail', bdaEmailFilter.trim());

      const response = await fetch(`${API_BASE_URL}/api/bda/analysis?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch analysis');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommissionConfig = async () => {
    if (!adminToken) return;
    setCommissionLoading(true);
    setCommissionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/bda-incentives/config`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const body = await res.json();
      if (!body.success || !Array.isArray(body.configs)) {
        throw new Error(body.message || 'Failed to load commission config');
      }
      setCommissionConfigs(
        body.configs.map((c: any) => ({
          planName: c.planName as PlanName,
          basePriceUsd: Number(c.basePriceUsd) ?? 0,
          currency: c.currency || 'USD',
          incentivePerLeadInr: Number(c.incentivePerLeadInr) ?? 0
        }))
      );
    } catch (err) {
      setCommissionError(err instanceof Error ? err.message : 'Failed to load commission config');
    } finally {
      setCommissionLoading(false);
    }
  };

  const handleSaveCommission = async () => {
    if (!adminToken) return;
    setCommissionSaving(true);
    setCommissionError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crm/admin/bda-incentives/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          configs: commissionConfigs.map((c) => ({
            planName: c.planName,
            basePriceUsd: c.basePriceUsd,
            incentivePerLeadInr: c.incentivePerLeadInr
          }))
        })
      });
      const body = await res.json();
      if (!body.success) {
        throw new Error(body.message || 'Failed to save commission config');
      }
      fetchCommissionConfig();
    } catch (err) {
      setCommissionError(err instanceof Error ? err.message : 'Failed to save commission config');
    } finally {
      setCommissionSaving(false);
    }
  };

  const fetchBdaDetails = async (email: string) => {
    if (!adminToken) return;

    setDetailLoading(true);
    setDetailError(null);
    setSelectedBdaEmail(email);

    try {
      const response = await fetch(`${API_BASE_URL}/api/bda/leads/${encodeURIComponent(email)}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch BDA details');
      }

      setDetailData(result.data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load BDA details');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setSelectedBdaEmail(null);
    setDetailData(null);
    setDetailError(null);
    setUnclaimBookingId(null);
    setUnclaimConfirm(false);
    setEditLead(null);
  };

  const handleUnclaimClick = (bookingId: string) => {
    setUnclaimBookingId(bookingId);
    setUnclaimConfirm(true);
    setUnclaimError(null);
  };

  const handleUnclaimCancel = () => {
    setUnclaimBookingId(null);
    setUnclaimConfirm(false);
    setUnclaimError(null);
  };

  const handleUnclaimConfirm = async () => {
    if (!adminToken || !unclaimBookingId) return;
    setUnclaimLoading(true);
    setUnclaimError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/crm/admin/booking/${encodeURIComponent(unclaimBookingId)}/unclaim`,
        { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Failed to unclaim lead');
      setUnclaimBookingId(null);
      setUnclaimConfirm(false);
      if (selectedBdaEmail) {
        await fetchBdaDetails(selectedBdaEmail);
        await fetchAnalysis();
      }
    } catch (err) {
      setUnclaimError(err instanceof Error ? err.message : 'Failed to unclaim lead');
    } finally {
      setUnclaimLoading(false);
    }
  };

  const handleEditClick = (lead: Lead) => {
    setEditLead(lead);
    setEditStatus(lead.bookingStatus);
    setEditPlanName((lead.paymentPlan?.name as PlanName) || 'all');
    setEditAmount(lead.paymentPlan?.price != null ? String(lead.paymentPlan.price) : '');
    setEditError(null);
  };

  const handleEditClose = () => {
    setEditLead(null);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!adminToken || !editLead) return;
    const planRequired = editStatus === 'paid';
    if (planRequired && (editPlanName === 'all' || !editAmount || parseFloat(editAmount) <= 0)) {
      setEditError('Plan and amount are required when status is Paid.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const body: { status: string; plan?: { name: string; price: number } } = { status: editStatus };
      if (planRequired && editPlanName !== 'all' && editAmount) {
        body.plan = { name: editPlanName, price: parseFloat(editAmount) || 0 };
      }
      const res = await fetch(
        `${API_BASE_URL}/api/campaign-bookings/${encodeURIComponent(editLead.bookingId)}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify(body),
        }
      );
      const result = await res.json();
      if (!result.success) throw new Error(result.message || 'Failed to update lead');

      handleEditClose();
      if (selectedBdaEmail) {
        await fetchBdaDetails(selectedBdaEmail);
        await fetchAnalysis();
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (error) {
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

  const topBda = data.bdaPerformance.length > 0 ? data.bdaPerformance[0] : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 mb-4 bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition font-semibold shadow-sm"
        >
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>
        <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-1">BDA PERFORMANCE</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Lead Analysis</h1>
        <p className="text-slate-600">Comprehensive statistics on leads and BDA performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.totalLeads}</div>
          <div className="text-sm text-slate-600">Total Available Leads</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <CheckCircle2 className="text-emerald-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.claimedLeads}</div>
          <div className="text-sm text-slate-600">Claimed Leads</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <TrendingUp className="text-orange-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.unclaimedLeads}</div>
          <div className="text-sm text-slate-600">Unclaimed Leads</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-sm text-slate-600 font-semibold mb-2">Status Breakdown</div>
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

        {topBda && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="text-orange-600" size={24} />
              <h3 className="text-lg font-bold text-slate-900">Top Performer</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-600 mb-1">BDA Name</div>
                <div className="text-xl font-bold text-slate-900">{topBda.name}</div>
                <div className="text-sm text-slate-500">{topBda._id}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-600 mb-1">Total Claimed</div>
                  <div className="text-2xl font-bold text-slate-900">{topBda.totalClaimed}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-emerald-600">${topBda.totalRevenue.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 mb-1">Incentive (₹)</div>
                  <div className="text-2xl font-bold text-slate-900">₹{(topBda.totalIncentiveInr ?? 0).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">BDA Incentive Settings</h3>
          {commissionError && <span className="text-xs text-red-600 font-semibold">{commissionError}</span>}
        </div>
        {commissionLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="animate-spin text-orange-500" size={24} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Plan</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Base Price (USD)</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Incentive / Lead (INR)</th>
                </tr>
              </thead>
              <tbody>
                {commissionConfigs.map((cfg) => (
                  <tr key={cfg.planName} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-900">{cfg.planName}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={Number.isNaN(cfg.basePriceUsd) ? '' : cfg.basePriceUsd}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          setCommissionConfigs((prev) =>
                            prev.map((p) =>
                              p.planName === cfg.planName
                                ? { ...p, basePriceUsd: Number.isNaN(value) ? 0 : value }
                                : p
                            )
                          );
                        }}
                        className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={Number.isNaN(cfg.incentivePerLeadInr) ? '' : cfg.incentivePerLeadInr}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          setCommissionConfigs((prev) =>
                            prev.map((p) =>
                              p.planName === cfg.planName
                                ? { ...p, incentivePerLeadInr: Number.isNaN(value) ? 0 : value }
                                : p
                            )
                          );
                        }}
                        className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveCommission}
                disabled={commissionSaving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {commissionSaving && <Loader2 className="animate-spin" size={16} />}
                <span>{commissionSaving ? 'Saving…' : 'Save Commission'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">From date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">To date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BookingStatus | 'all')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-slate-600">Plan</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as PlanName | 'all')}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="all">All plans</option>
            <option value="PRIME">PRIME</option>
            <option value="IGNITE">IGNITE</option>
            <option value="PROFESSIONAL">PROFESSIONAL</option>
            <option value="EXECUTIVE">EXECUTIVE</option>
          </select>
        </div>
        <div className="space-y-1 flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-600">BDA email</label>
          <input
            type="email"
            value={bdaEmailFilter}
            onChange={(e) => setBdaEmailFilter(e.target.value)}
            placeholder="Filter by BDA email"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setFromDate('');
            setToDate('');
            setStatusFilter('all');
            setPlanFilter('all');
            setBdaEmailFilter('');
          }}
          className="ml-auto px-4 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
        >
          Reset filters
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">BDA Performance Rankings</h3>
        {data.bdaPerformance.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No BDA has claimed any leads yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">BDA Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Claimed</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Scheduled</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Completed</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Revenue</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Incentive (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.bdaPerformance.map((bda, index) => (
                  <tr
                    key={bda._id}
                    onClick={() => fetchBdaDetails(bda._id)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-slate-100 text-slate-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{bda.name}</td>
                    <td className="px-4 py-3 text-slate-600">{bda._id}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{bda.totalClaimed}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{bda.paid}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{bda.scheduled}</td>
                    <td className="px-4 py-3 text-right text-green-600">{bda.completed}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      ${bda.totalRevenue.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      ₹{(bda.totalIncentiveInr ?? 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBdaEmail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {detailData?.bda?.name || 'BDA Details'}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{selectedBdaEmail}</p>
              </div>
              <button
                onClick={closeDetailModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={24} className="text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
              ) : detailError ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {detailError}
                </div>
              ) : detailData && detailData.leads.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-sm text-slate-600 mb-1">Total Leads</div>
                      <div className="text-2xl font-bold text-slate-900">{detailData.leads.length}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-sm text-slate-600 mb-1">Paid Leads</div>
                      <div className="text-2xl font-bold text-emerald-600">
                        {detailData.leads.filter(l => l.bookingStatus === 'paid').length}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-sm text-slate-600 mb-1">Total Revenue</div>
                      <div className="text-2xl font-bold text-emerald-600">
                        ${detailData.leads
                          .filter(l => l.bookingStatus === 'paid')
                          .reduce((sum, l) => sum + (l.paymentPlan?.price || 0), 0)
                          .toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="text-sm text-slate-600 mb-1">Incentive (₹)</div>
                      <div className="text-2xl font-bold text-slate-900">
                        ₹{detailData.leads
                          .filter(l => l.bookingStatus === 'paid' && l.paymentPlan?.name)
                          .reduce((sum, l) => sum + (commissionConfigs.find(c => c.planName === l.paymentPlan?.name)?.incentivePerLeadInr ?? 0), 0)
                          .toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {detailData.leads.map((lead) => (
                      <div
                        key={lead.bookingId}
                        className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-bold text-slate-900">{lead.clientName || 'N/A'}</h3>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(lead.bookingStatus)}`}>
                                {lead.bookingStatus}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditClick(lead)}
                              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Edit lead"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUnclaimClick(lead.bookingId)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Remove claim (revert so lead can be claimed again)"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              <div className="flex items-center gap-2 text-slate-600">
                                <Mail size={16} />
                                <span>{lead.clientEmail || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <Phone size={16} />
                                <span>{lead.clientPhone || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <Calendar size={16} />
                                <span>{formatDate(lead.scheduledEventStartTime)}</span>
                              </div>
                              {lead.paymentPlan && (
                                <div className="flex items-center gap-2 text-slate-600">
                                  <DollarSign size={16} />
                                  <span>
                                    {lead.paymentPlan.displayPrice || `$${lead.paymentPlan.price}`} - {lead.paymentPlan.name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {(lead.meetingNotes || lead.anythingToKnow) && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                            {lead.meetingNotes && (
                              <div className="flex items-start gap-2 text-sm">
                                <FileText size={16} className="text-slate-500 mt-0.5" />
                                <div>
                                  <div className="font-semibold text-slate-700 mb-1">Meeting Notes:</div>
                                  <div className="text-slate-600">{lead.meetingNotes}</div>
                                </div>
                              </div>
                            )}
                            {lead.anythingToKnow && (
                              <div className="flex items-start gap-2 text-sm">
                                <FileText size={16} className="text-slate-500 mt-0.5" />
                                <div>
                                  <div className="font-semibold text-slate-700 mb-1">Additional Info:</div>
                                  <div className="text-slate-600">{lead.anythingToKnow}</div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  No leads found for this BDA
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unclaim confirmation modal */}
      {unclaimConfirm && unclaimBookingId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Remove claim from this lead?</h3>
            <p className="text-slate-600 text-sm mb-4">
              This lead will become unclaimed and can be claimed again by any BDA. This action cannot be undone for the current claim.
            </p>
            {unclaimError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {unclaimError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleUnclaimCancel}
                disabled={unclaimLoading}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnclaimConfirm}
                disabled={unclaimLoading}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium disabled:opacity-60 inline-flex items-center gap-2"
              >
                {unclaimLoading && <Loader2 className="animate-spin" size={18} />}
                Remove claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit lead modal */}
      {editLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Edit lead</h3>
            <p className="text-slate-600 text-sm mb-4">{editLead.clientName} · {editLead.clientEmail}</p>
            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {editError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="paid">Paid</option>
                  <option value="canceled">Canceled</option>
                  <option value="no-show">No-show</option>
                  <option value="ignored">Ignored</option>
                </select>
              </div>
              {editStatus === 'paid' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Plan</label>
                    <select
                      value={editPlanName}
                      onChange={(e) => setEditPlanName(e.target.value as PlanName | 'all')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Select plan</option>
                      <option value="PRIME">PRIME</option>
                      <option value="IGNITE">IGNITE</option>
                      <option value="PROFESSIONAL">PROFESSIONAL</option>
                      <option value="EXECUTIVE">EXECUTIVE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Amount paid ($)</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={handleEditClose}
                disabled={editSaving}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editSaving || (editStatus === 'paid' && (editPlanName === 'all' || !editAmount || parseFloat(editAmount) <= 0))}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-60 inline-flex items-center gap-2"
              >
                {editSaving && <Loader2 className="animate-spin" size={18} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
