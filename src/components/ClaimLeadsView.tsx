import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Save, CheckCircle2, AlertCircle, X, Calendar, Phone, Mail, User, DollarSign, UserCheck, List, BarChart3, Filter } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { usePlanConfig, type PlanName } from '../context/PlanConfigContext';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import BdaPerformanceView from './BdaPerformanceView';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type ActiveTab = 'claim' | 'my_leads' | 'bda_performance';

interface Lead {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  scheduledEventStartTime?: string;
  bookingStatus: 'paid' | 'scheduled' | 'completed';
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

export default function ClaimLeadsView() {
  const { user, token } = useCrmAuth();
  const { planOptions, incentiveConfig } = usePlanConfig();
  const [activeTab, setActiveTab] = useState<ActiveTab>('claim');
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Lead>>({});
  const [showPaidConfirmModal, setShowPaidConfirmModal] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ status: 'paid' | 'scheduled' | 'completed' } | null>(null);
  
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [myLeadsLoading, setMyLeadsLoading] = useState(false);
  const [myLeadsPage, setMyLeadsPage] = useState(1);
  const [myLeadsPagination, setMyLeadsPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [myLeadsTotalIncentives, setMyLeadsTotalIncentives] = useState<number>(0);
  const [myLeadsFromDate, setMyLeadsFromDate] = useState<string>('');
  const [myLeadsToDate, setMyLeadsToDate] = useState<string>('');
  const [myLeadsStatusFilter, setMyLeadsStatusFilter] = useState<'all' | 'paid' | 'scheduled' | 'completed'>('all');
  const [myLeadsPlanFilter, setMyLeadsPlanFilter] = useState<PlanName | 'all'>('all');

  /** Prorated incentive: same % as (amount paid / current plan price). Uses plan config from BDA Incentive Settings (single source of truth).
   * Note: For multi-currency support, this should use currency-specific configs. Currently uses basePriceUsd which works for USD.
   * For CAD, the admin should configure CAD-specific base prices in the admin settings. */
  const getIncentiveProrated = useCallback((planName?: PlanName, amountPaid?: number, currency?: string): number => {
    if (!planName || amountPaid == null || amountPaid <= 0) return 0;
    const config = incentiveConfig[planName];
    if (!config) return 0;
    
    // For now, use basePriceUsd (works for USD)
    // TODO: Update PlanConfigContext to support currency-specific base prices
    // For CAD, admin needs to configure CAD base prices separately in admin settings
    const basePrice = config.basePriceUsd > 0 ? config.basePriceUsd : 1;
    const paymentRatio = Math.min(1, amountPaid / basePrice);
    return config.incentivePerLeadInr * paymentRatio;
  }, [incentiveConfig]);

  const fetchMyLeads = useCallback(async () => {
    if (!token) return;
    setMyLeadsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(myLeadsPage));
      params.set('limit', '50');
      if (myLeadsFromDate) params.set('fromDate', myLeadsFromDate);
      if (myLeadsToDate) params.set('toDate', myLeadsToDate);
      if (myLeadsStatusFilter !== 'all') params.set('status', myLeadsStatusFilter);
      if (myLeadsPlanFilter !== 'all') params.set('planName', myLeadsPlanFilter);
      const response = await fetch(`${API_BASE_URL}/api/bda/my-leads?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setMyLeads(data.data || []);
        setMyLeadsPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
        setMyLeadsTotalIncentives(typeof data.totalIncentivesForFilter === 'number' ? data.totalIncentivesForFilter : 0);
      }
    } catch (err) {
      console.error('Error fetching my leads:', err);
    } finally {
      setMyLeadsLoading(false);
    }
  }, [token, myLeadsPage, myLeadsFromDate, myLeadsToDate, myLeadsStatusFilter, myLeadsPlanFilter]);

  useEffect(() => {
    if (activeTab === 'my_leads' && token) {
      fetchMyLeads();
    }
  }, [activeTab, myLeadsPage, myLeadsFromDate, myLeadsToDate, myLeadsStatusFilter, myLeadsPlanFilter, token, fetchMyLeads]);

  useEffect(() => {
    if (lead) {
      let dateValue = '';
      if (lead.scheduledEventStartTime) {
        try {
          const date = typeof lead.scheduledEventStartTime === 'string' 
            ? parseISO(lead.scheduledEventStartTime)
            : new Date(lead.scheduledEventStartTime);
          dateValue = format(date, "yyyy-MM-dd'T'HH:mm");
        } catch {
          dateValue = '';
        }
      }
      
      setFormData({
        clientName: lead.clientName,
        clientPhone: lead.clientPhone || '',
        scheduledEventStartTime: dateValue,
        paymentPlan: lead.paymentPlan || undefined,
        meetingNotes: lead.meetingNotes || '',
        anythingToKnow: lead.anythingToKnow || '',
      });
    } else {
      setFormData({});
    }
  }, [lead]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientEmail.trim()) {
      setError('Please enter a client email');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setLead(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/bda/lead-by-email/${encodeURIComponent(clientEmail.trim())}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch lead');
      }

      setLead(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lead');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!lead) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const body: { paymentPlan?: typeof formData.paymentPlan } = {};
      if (formData.paymentPlan?.name && formData.paymentPlan.price !== undefined) {
        const amt = formData.paymentPlan.price;
        if (amt <= 0) {
          setError('Amount paid by client must be greater than 0');
          setLoading(false);
          return;
        }
        body.paymentPlan = {
          name: formData.paymentPlan.name,
          price: amt,
          currency: formData.paymentPlan.currency || 'USD',
          displayPrice: formData.paymentPlan.displayPrice || `$${amt}`,
        };
      }
      const response = await fetch(`${API_BASE_URL}/api/bda/claim-lead/${lead.bookingId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to claim lead');
      }

      setSuccess('Lead claimed successfully!');
      setLead(data.data);
      if (activeTab === 'my_leads') {
        fetchMyLeads();
      }
      window.dispatchEvent(new CustomEvent('bookingUpdated', { detail: { bookingId: lead.bookingId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim lead');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: 'paid' | 'scheduled' | 'completed') => {
    if (!lead) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const planPayload = formData.paymentPlan ? {
        name: formData.paymentPlan.name,
        price: formData.paymentPlan.price,
        currency: formData.paymentPlan.currency || 'USD',
        displayPrice: formData.paymentPlan.displayPrice || `$${formData.paymentPlan.price}`,
      } : undefined;

      const requestBody: any = {
        status: newStatus,
      };

      if (planPayload) {
        requestBody.plan = planPayload;
      }

      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${lead.bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update status');
      }

      setSuccess('Status updated successfully!');
      setLead(data.data);
      if (activeTab === 'my_leads') {
        fetchMyLeads();
      }
      
      window.dispatchEvent(new CustomEvent('bookingUpdated', { detail: { bookingId: lead.bookingId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!lead) return;
    if (formData.paymentPlan?.name && (formData.paymentPlan.price == null || formData.paymentPlan.price <= 0)) {
      setError('Amount paid by client must be greater than 0');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/bda/update-lead/${lead.bookingId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to update lead');
      }

      setSuccess('Lead details updated successfully!');
      setLead(data.data);
      if (activeTab === 'my_leads') {
        fetchMyLeads();
      }
      window.dispatchEvent(new CustomEvent('bookingUpdated', { detail: { bookingId: lead.bookingId } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectLead = async (selectedLead: Lead) => {
    setLead(selectedLead);
    setActiveTab('claim');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isClaimed = lead?.claimedBy && lead.claimedBy.email && lead.claimedBy.email === user?.email;

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-1">BDA LEAD MANAGEMENT</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Claim Your Leads</h1>
        <p className="text-slate-600">
          {user?.name} ({user?.email}) - Search for a lead by client email to claim and manage it.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <div className="border-b border-slate-200">
          <div className="flex items-center gap-1 px-4">
            <button
              onClick={() => setActiveTab('claim')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === 'claim'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck size={16} className="inline mr-2" />
              Claim Leads
            </button>
            <button
              onClick={() => setActiveTab('my_leads')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === 'my_leads'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <List size={16} className="inline mr-2" />
              My Leads ({myLeadsPagination.total})
            </button>
            <button
              onClick={() => setActiveTab('bda_performance')}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                activeTab === 'bda_performance'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 size={16} className="inline mr-2" />
              BDA Performance
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'claim' && (
            <>
              <div className="mb-6">
                <form onSubmit={handleSearch} className="flex items-center gap-4">
                  <div className="flex-1 flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3">
                    <Mail size={20} className="text-slate-400" />
                    <input
                      type="email"
                      placeholder="Enter client email address"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="flex-1 bg-transparent focus:outline-none text-sm"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !clientEmail.trim()}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search size={18} />
                        Search Lead
                      </>
                    )}
                  </button>
                </form>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle className="text-red-600" size={20} />
                  <span className="text-red-700">{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-600 hover:text-red-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {success && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle2 className="text-green-600" size={20} />
                  <span className="text-green-700">{success}</span>
                  <button
                    onClick={() => setSuccess(null)}
                    className="ml-auto text-green-600 hover:text-green-700"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {lead && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Lead Details</h2>
                      <p className="text-sm text-slate-600 mt-1">Booking ID: {lead.bookingId}</p>
                    </div>
                    {!isClaimed && (
                      <button
                        onClick={handleClaim}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-semibold disabled:opacity-50"
                      >
                        <CheckCircle2 size={18} />
                        Claim This Lead
                      </button>
                    )}
                    {isClaimed && (
                      <div className="text-sm">
                        <p className="text-slate-600">Claimed by:</p>
                        <p className="font-semibold text-slate-900">{lead.claimedBy?.name}</p>
                        <p className="text-slate-500">{lead.claimedBy?.email}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          <User size={16} className="inline mr-2" />
                          Client Name
                        </label>
                        <input
                          type="text"
                          value={formData.clientName || ''}
                          onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          <Mail size={16} className="inline mr-2" />
                          Client Email
                        </label>
                        <input
                          type="email"
                          value={lead.clientEmail}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 bg-slate-50 text-slate-600"
                          disabled
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          <Phone size={16} className="inline mr-2" />
                          Mobile Number
                        </label>
                        <input
                          type="tel"
                          value={formData.clientPhone || ''}
                          onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          <Calendar size={16} className="inline mr-2" />
                          Meeting Time
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.scheduledEventStartTime || ''}
                          onChange={(e) => setFormData({ ...formData, scheduledEventStartTime: e.target.value })}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          <DollarSign size={16} className="inline mr-2" />
                          Plan
                        </label>
                        <select
                          value={formData.paymentPlan?.name || ''}
                          onChange={(e) => {
                            const selectedValue = e.target.value;
                            if (selectedValue === '') {
                              setFormData({
                                ...formData,
                                paymentPlan: undefined,
                              });
                            } else {
                              const plan = planOptions.find(p => p.key === selectedValue);
                              if (plan) {
                                const existingCurrency = formData.paymentPlan?.currency || 'USD';
                                const currencySymbol = existingCurrency === 'CAD' ? 'CA$' : '$';
                                const existingPrice = formData.paymentPlan?.price ?? plan.price;
                                setFormData({
                                  ...formData,
                                  paymentPlan: {
                                    name: plan.key,
                                    price: existingPrice,
                                    currency: existingCurrency,
                                    displayPrice: `${currencySymbol}${existingPrice.toFixed(2)}`,
                                  },
                                });
                              }
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white cursor-pointer"
                          disabled={saving}
                          title={!isClaimed ? 'Select plan and amount, then Claim to save. After claiming, use Save to update.' : undefined}
                        >
                          <option value="">Select Plan</option>
                          {planOptions.map((plan) => (
                            <option key={plan.key} value={plan.key}>
                              {plan.label} ({plan.displayPrice})
                            </option>
                          ))}
                        </select>
                      </div>

                      {formData.paymentPlan?.name && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Currency <span className="text-red-600">*</span>
                          </label>
                          <select
                            value={formData.paymentPlan?.currency || 'USD'}
                            onChange={(e) => {
                              const currency = e.target.value;
                              const currentPlan = formData.paymentPlan || { name: 'PRIME' as PlanName, price: 0, currency: 'USD', displayPrice: '' };
                              const currencySymbol = currency === 'CAD' ? 'CA$' : currency === 'USD' ? '$' : currency;
                              setFormData({
                                ...formData,
                                paymentPlan: {
                                  ...currentPlan,
                                  currency,
                                  displayPrice: currentPlan.price > 0 ? `${currencySymbol}${currentPlan.price.toFixed(2)}` : '',
                                },
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white cursor-pointer"
                            disabled={saving}
                          >
                            <option value="USD">USD ($)</option>
                            <option value="CAD">CAD (CA$)</option>
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Amount paid by client {formData.paymentPlan?.currency === 'CAD' ? '(CA$)' : '($)'} <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={formData.paymentPlan?.price ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              if (formData.paymentPlan) {
                                setFormData({
                                  ...formData,
                                  paymentPlan: {
                                    ...formData.paymentPlan,
                                    price: 0,
                                    displayPrice: '',
                                  },
                                });
                              }
                            } else {
                              const price = parseFloat(value);
                              if (!isNaN(price) && price >= 0) {
                                const currentPlan = formData.paymentPlan || { name: 'PRIME' as PlanName, price: 0, currency: 'USD', displayPrice: '' };
                                const currency = currentPlan.currency || 'USD';
                                const currencySymbol = currency === 'CAD' ? 'CA$' : '$';
                                setFormData({
                                  ...formData,
                                  paymentPlan: {
                                    ...currentPlan,
                                    price,
                                    displayPrice: `${currencySymbol}${price.toFixed(2)}`,
                                  },
                                });
                              }
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                          disabled={saving}
                          placeholder={`Enter amount paid (e.g., ${formData.paymentPlan?.currency === 'CAD' ? '799' : '599'})`}
                          title="Required. Incentive is prorated by this amount vs plan price."
                        />
                        <p className="text-xs text-slate-500 mt-1">Required. Incentive is prorated </p>
                      </div>

                      {formData.paymentPlan && formData.paymentPlan.name && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Incentive (INR)
                          </label>
                          <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-emerald-700 font-semibold">
                            ₹{getIncentiveProrated(formData.paymentPlan.name, formData.paymentPlan.price ?? 0, formData.paymentPlan.currency).toFixed(0)}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Status
                        </label>
                        <select
                          value={lead.bookingStatus}
                          onChange={(e) => {
                            const newStatus = e.target.value as 'paid' | 'scheduled' | 'completed';
                            if (newStatus === 'paid' && lead.bookingStatus !== 'paid') {
                              if (!formData.paymentPlan || !formData.paymentPlan.name) {
                                setError('Please select a plan before marking as paid');
                                return;
                              }
                              const amt = formData.paymentPlan.price ?? 0;
                              if (amt <= 0) {
                                setError('Amount paid by client must be greater than 0');
                                return;
                              }
                              setPendingStatusChange({ status: newStatus });
                              setShowPaidConfirmModal(true);
                            } else {
                              handleStatusUpdate(newStatus);
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white cursor-pointer"
                          disabled={saving}
                          title={!isClaimed ? 'You can change status before or after claiming.' : undefined}
                        >
                          <option value="scheduled">SCHEDULED</option>
                          <option value="paid">PAID</option>
                          <option value="completed">COMPLETED</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Meeting Notes
                        </label>
                        <textarea
                          value={formData.meetingNotes || ''}
                          onChange={(e) => setFormData({ ...formData, meetingNotes: e.target.value })}
                          rows={4}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Additional Information
                        </label>
                        <textarea
                          value={formData.anythingToKnow || ''}
                          onChange={(e) => setFormData({ ...formData, anythingToKnow: e.target.value })}
                          rows={3}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        />
                      </div>
                    </div>
                  </div>

                  {isClaimed && (
                    <div className="flex justify-end pt-4 border-t border-slate-200">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-50"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save size={18} />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!lead && !loading && (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <Search size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600">Enter a client email to search for a lead</p>
                </div>
              )}
            </>
          )}

          {activeTab === 'my_leads' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Filter size={16} className="text-slate-500" />
                {(() => {
                  const now = new Date();
                  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
                  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
                  const isThisMonthActive = myLeadsFromDate === thisMonthStart && myLeadsToDate === thisMonthEnd;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setMyLeadsFromDate(thisMonthStart);
                        setMyLeadsToDate(thisMonthEnd);
                        setMyLeadsPage(1);
                      }}
                      className={`text-[11px] font-semibold px-3 py-2 rounded-lg border transition ${
                        isThisMonthActive
                          ? 'border-orange-200 bg-orange-50 text-orange-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      This Month
                    </button>
                  );
                })()}
                <input
                  type="date"
                  value={myLeadsFromDate}
                  onChange={(e) => {
                    setMyLeadsFromDate(e.target.value);
                    setMyLeadsPage(1);
                  }}
                  className="text-[11px] border border-slate-200 px-3 py-2 rounded-lg bg-white"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="date"
                  value={myLeadsToDate}
                  onChange={(e) => {
                    setMyLeadsToDate(e.target.value);
                    setMyLeadsPage(1);
                  }}
                  className="text-[11px] border border-slate-200 px-3 py-2 rounded-lg bg-white"
                />
                <select
                  value={myLeadsStatusFilter}
                  onChange={(e) => {
                    setMyLeadsStatusFilter(e.target.value as 'all' | 'paid' | 'scheduled' | 'completed');
                    setMyLeadsPage(1);
                  }}
                  className="text-[11px] border border-slate-200 px-3 py-2 rounded-lg bg-white min-w-[120px]"
                >
                  <option value="all">All statuses</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paid">Paid</option>
                  <option value="completed">Completed</option>
                </select>
                <select
                  value={myLeadsPlanFilter}
                  onChange={(e) => {
                    setMyLeadsPlanFilter(e.target.value as PlanName | 'all');
                    setMyLeadsPage(1);
                  }}
                  className="text-[11px] border border-slate-200 px-3 py-2 rounded-lg bg-white min-w-[140px]"
                >
                  <option value="all">All plans</option>
                  {planOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label} ({p.displayPrice})
                    </option>
                  ))}
                </select>
                {(myLeadsFromDate || myLeadsToDate || myLeadsStatusFilter !== 'all' || myLeadsPlanFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMyLeadsFromDate('');
                      setMyLeadsToDate('');
                      setMyLeadsStatusFilter('all');
                      setMyLeadsPlanFilter('all');
                      setMyLeadsPage(1);
                    }}
                    className="text-[11px] text-orange-600 font-semibold px-3 py-2 hover:bg-orange-50 rounded-lg transition"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  Leads: {myLeadsPagination.total}
                  {myLeadsPagination.total > 0 && (
                    <span className="text-slate-500 ml-1">
                      (page {myLeadsPagination.page} of {myLeadsPagination.pages})
                    </span>
                  )}
                </span>
                <span className="font-semibold text-emerald-700">
                  Total incentives: ₹{myLeadsTotalIncentives.toFixed(0)}
                </span>
              </div>
              {myLeadsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
              ) : myLeads.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                  <List size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600">You haven't claimed any leads yet</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {myLeads.map((item) => (
                      <div
                        key={item.bookingId}
                        className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
                        onClick={() => handleSelectLead(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="font-semibold text-slate-900">{item.clientName}</h3>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.bookingStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                                item.bookingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {item.bookingStatus.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600 space-y-1">
                              <p><Mail size={14} className="inline mr-1" />{item.clientEmail}</p>
                              {item.clientPhone && (
                                <p><Phone size={14} className="inline mr-1" />{item.clientPhone}</p>
                              )}
                              {item.scheduledEventStartTime && (
                                <p><Calendar size={14} className="inline mr-1" />
                                  {format(parseISO(item.scheduledEventStartTime), 'MMM d, yyyy • h:mm a')}
                                </p>
                              )}
                              {item.paymentPlan && (
                                <p><DollarSign size={14} className="inline mr-1" />
                                  {item.paymentPlan.name} - {item.paymentPlan.displayPrice} paid
                                </p>
                              )}
                              {item.bookingStatus === 'paid' && item.paymentPlan && item.paymentPlan.price && (
                                <p className="text-emerald-700">
                                  Incentive: ₹{getIncentiveProrated(item.paymentPlan.name, item.paymentPlan.price, item.paymentPlan.currency).toFixed(0)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm text-slate-500">
                            {item.claimedBy?.claimedAt && (
                              <p>Claimed {format(parseISO(item.claimedBy.claimedAt), 'MMM d, yyyy')}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {myLeadsPagination.pages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <button
                        onClick={() => setMyLeadsPage(p => Math.max(1, p - 1))}
                        disabled={myLeadsPage === 1}
                        className="px-4 py-2 border border-slate-200 rounded-lg disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-slate-600">
                        Page {myLeadsPagination.page} of {myLeadsPagination.pages}
                      </span>
                      <button
                        onClick={() => setMyLeadsPage(p => Math.min(myLeadsPagination.pages, p + 1))}
                        disabled={myLeadsPage === myLeadsPagination.pages}
                        className="px-4 py-2 border border-slate-200 rounded-lg disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'bda_performance' && (
            <BdaPerformanceView />
          )}
        </div>
      </div>

      {showPaidConfirmModal && pendingStatusChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Mark as Paid</h3>
              <p className="text-slate-600 mb-4">
                Are you sure you want to mark <span className="font-semibold">{lead?.clientName || 'this client'}</span> as paid?
              </p>
              {formData.paymentPlan && (
                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-slate-600 mb-1">Plan: <span className="font-semibold text-slate-900">{formData.paymentPlan.name}</span></div>
                  <div className="text-sm text-slate-600 mb-1">Amount paid by client: <span className="font-semibold text-emerald-600">{formData.paymentPlan.displayPrice || `$${formData.paymentPlan.price}`}</span></div>
                  <div className="text-sm text-slate-600">Your incentive (prorated): <span className="font-semibold text-emerald-700">₹{getIncentiveProrated(formData.paymentPlan.name, formData.paymentPlan.price ?? 0, formData.paymentPlan.currency).toFixed(0)}</span></div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowPaidConfirmModal(false);
                    setPendingStatusChange(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowPaidConfirmModal(false);
                    if (pendingStatusChange) {
                      handleStatusUpdate(pendingStatusChange.status);
                    }
                    setPendingStatusChange(null);
                  }}
                  className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition font-semibold"
                >
                  Mark as Paid
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
