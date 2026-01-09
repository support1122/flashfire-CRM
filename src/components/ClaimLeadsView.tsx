import { useState, useEffect } from 'react';
import { Loader2, Search, Save, CheckCircle2, AlertCircle, X, Calendar, Phone, Mail, User, DollarSign, UserCheck, List } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { format, parseISO } from 'date-fns';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type PlanName = 'PRIME' | 'IGNITE' | 'PROFESSIONAL' | 'EXECUTIVE';
type ActiveTab = 'claim' | 'my_leads';

const PLAN_OPTIONS: Array<{ key: PlanName; label: string; price: number; displayPrice: string }> = [
  { key: 'PRIME', label: 'PRIME', price: 119, displayPrice: '$119' },
  { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199' },
  { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349' },
  { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599' },
];

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('claim');
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Lead>>({});
  
  const [myLeads, setMyLeads] = useState<Lead[]>([]);
  const [myLeadsLoading, setMyLeadsLoading] = useState(false);
  const [myLeadsPage, setMyLeadsPage] = useState(1);
  const [myLeadsPagination, setMyLeadsPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });

  useEffect(() => {
    if (activeTab === 'my_leads') {
      fetchMyLeads();
    }
  }, [activeTab, myLeadsPage]);

  const fetchMyLeads = async () => {
    setMyLeadsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/bda/my-leads?page=${myLeadsPage}&limit=50`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setMyLeads(data.data || []);
        setMyLeadsPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
      }
    } catch (err) {
      console.error('Error fetching my leads:', err);
    } finally {
      setMyLeadsLoading(false);
    }
  };

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
        paymentPlan: lead.paymentPlan,
        meetingNotes: lead.meetingNotes || '',
        anythingToKnow: lead.anythingToKnow || '',
      });
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
      const response = await fetch(`${API_BASE_URL}/api/bda/claim-lead/${lead.bookingId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim lead');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!lead) return;

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

  const isClaimed = lead?.claimedBy && lead.claimedBy.email;

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
                            const plan = PLAN_OPTIONS.find(p => p.key === e.target.value);
                            if (plan) {
                              setFormData({
                                ...formData,
                                paymentPlan: {
                                  name: plan.key,
                                  price: plan.price,
                                  currency: 'USD',
                                  displayPrice: plan.displayPrice,
                                },
                              });
                            }
                          }}
                          className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          disabled={!isClaimed || saving}
                        >
                          <option value="">Select Plan</option>
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan.key} value={plan.key}>
                              {plan.label} ({plan.displayPrice})
                            </option>
                          ))}
                        </select>
                      </div>

                      {formData.paymentPlan && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Plan Amount ($)
                          </label>
                          <input
                            type="number"
                            value={formData.paymentPlan.price || ''}
                            onChange={(e) => {
                              const price = parseFloat(e.target.value);
                              if (!isNaN(price)) {
                                setFormData({
                                  ...formData,
                                  paymentPlan: {
                                    ...formData.paymentPlan!,
                                    price,
                                    displayPrice: `$${price}`,
                                  },
                                });
                              }
                            }}
                            className="w-full border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                            disabled={!isClaimed || saving}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Status
                        </label>
                        <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            lead.bookingStatus === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                            lead.bookingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {lead.bookingStatus.toUpperCase()}
                          </span>
                        </div>
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
                                  {item.paymentPlan.name} - {item.paymentPlan.displayPrice}
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
        </div>
      </div>
    </div>
  );
}
