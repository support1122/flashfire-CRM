import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import { checkContactsPaymentStatus } from '../utils/contactStatus';
import {
  Send,
  Loader,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  MessageSquare,
  Smartphone,
  Play,
} from 'lucide-react';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';

interface WhatsAppCampaignProps {
  prefill?: WhatsAppPrefillPayload | null;
  onPrefillConsumed?: () => void;
}

interface WatiTemplate {
  name: string;
  id: string;
  status: string;
  category?: string;
  language?: string;
}

interface WhatsAppCampaign {
  _id: string;
  campaignId: string;
  templateName: string;
  templateId: string | null;
  mobileNumbers: string[];
  parameters: string[];
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  messageStatuses: Array<{
    mobileNumber: string;
    status: 'pending' | 'scheduled' | 'sent' | 'failed';
    sentAt?: string;
    scheduledSendDate?: string;
    sendDay?: number;
    errorMessage?: string;
  }>;
  isScheduled: boolean;
  successfulMessages?: number;
  failedMessages?: number;
  pendingMessages?: number;
}

interface ScheduledWhatsAppCampaign extends WhatsAppCampaign {
  sendSchedule: Array<{
    day: number;
    scheduledDate: string;
    sent: number;
    pending: number;
    failed: number;
  }>;
}

export default function WhatsAppCampaign({ prefill, onPrefillConsumed }: WhatsAppCampaignProps = {}) {
  const [templateName, setTemplateName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [mobileNumbers, setMobileNumbers] = useState('');
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<WatiTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [scheduledCampaigns, setScheduledCampaigns] = useState<ScheduledWhatsAppCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedScheduled, setExpandedScheduled] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'scheduled' | 'history'>('create');
  const [selectedBookingStatus, setSelectedBookingStatus] = useState<string>('scheduled');
  const [fetchingMobiles, setFetchingMobiles] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  const TEMPLATE_PARAM_CONFIG: Record<
    string,
    Array<{ label: string; placeholder?: string; helper?: string }>
  > = {
    flashfire_appointment_reminder: [
      { label: 'Recipient Name ({{1}})', placeholder: 'e.g., Alex' },
      { label: 'Date ({{2}})', placeholder: 'e.g., Jan 05' },
      { label: 'Time ({{3}})', placeholder: 'e.g., 4:00 PM IST' },
      { label: 'Meeting Link ({{4}})', placeholder: 'https://meet.example.com/...' },
      { label: 'Reschedule Link ({{5}})', placeholder: 'https://calendly.com/...' },
    ],
    cancelled1: [
      { label: 'Client Name ({{1}})', placeholder: 'e.g., Alex' },
      { label: 'Date ({{2}})', placeholder: 'e.g., Jan 05' },
      { label: 'Time with Timezone ({{3}})', placeholder: 'e.g., 4pm – 4:15pm ET' },
      { label: 'Reschedule Link ({{4}})', placeholder: 'https://calendly.com/...' },
    ],
  };

  const getParamConfig = (name: string) => {
    const key = (name || '').toLowerCase();
    if (TEMPLATE_PARAM_CONFIG[key]) return TEMPLATE_PARAM_CONFIG[key];
    return [
      { label: 'Parameter 1 ({{1}})', placeholder: 'Value for {{1}}' },
      { label: 'Parameter 2 ({{2}})', placeholder: 'Value for {{2}}' },
    ];
  };

  const ensureParamValues = (name: string) => {
    const cfg = getParamConfig(name);
    setParamValues((prev) => {
      const next = [...prev];
      if (next.length < cfg.length) {
        return [...next, ...Array(cfg.length - next.length).fill('')];
      }
      return next.slice(0, cfg.length);
    });
  };

  // Handle prefill
  useEffect(() => {
    if (prefill) {
      if (prefill.mobileNumbers && prefill.mobileNumbers.length > 0) {
        setMobileNumbers(prefill.mobileNumbers.join(', '));
      }
      if (prefill.templateId) {
        setTemplateId(prefill.templateId);
        // Find template name from templates list
        const template = templates.find(t => t.id === prefill.templateId);
        if (template) {
          setTemplateName(template.name);
          ensureParamValues(template.name);
        }
      }
      setActiveTab('create');
      // Consume prefill after applying it
      if (onPrefillConsumed) {
        onPrefillConsumed();
      }
    }
  }, [prefill, templates, onPrefillConsumed]);

  useEffect(() => {
    fetchTemplates();
    fetchCampaigns();
    fetchScheduledCampaigns();
    const interval = setInterval(() => {
      fetchScheduledCampaigns();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    ensureParamValues(templateName);
  }, [templateName]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/templates`);
      const data = await response.json();

      if (data.success) {
        setTemplates(data.templates || []);
        if (data.templates && data.templates.length > 0) {
          setTemplateName(data.templates[0].name);
          setTemplateId(data.templates[0].id);
          ensureParamValues(data.templates[0].name);
        }
      }
    } catch (err) {
      console.error('Error fetching WATI templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchCampaigns = async (pageNum: number = 1, bustCache: boolean = false) => {
    setLoadingCampaigns(true);
    try {
      const cacheBuster = bustCache ? `&_t=${Date.now()}` : '';
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns?page=${pageNum}&limit=50${cacheBuster}`);
      
      // Handle 304 Not Modified - use cached data
      if (response.status === 304) {
        setLoadingCampaigns(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (pageNum === 1) {
            setCampaigns(data.data);
          } else {
            setCampaigns((prev) => [...prev, ...data.data]);
          }
          setHasMore(data.pagination?.hasMore || false);
          setPage(pageNum);
        }
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchScheduledCampaigns = async (bustCache: boolean = false) => {
    setLoadingScheduled(true);
    try {
      const cacheBuster = bustCache ? `?_t=${Date.now()}` : '';
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/scheduled${cacheBuster}`);
      
      // Handle 304 Not Modified - use cached data
      if (response.status === 304) {
        setLoadingScheduled(false);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setScheduledCampaigns(data.data);
        }
      }
    } catch (err) {
      console.error('Error fetching scheduled campaigns:', err);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const handleLoadMore = () => {
    fetchCampaigns(page + 1);
  };

  const handleGetMobilesByStatus = async (status: string) => {
    setFetchingMobiles(true);
    setError('');
    setSuccess('');

    try {
      const params = new URLSearchParams({ status });
      if (fromDateFilter) params.append('fromDate', fromDateFilter);
      if (toDateFilter) params.append('toDate', toDateFilter);

      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/mobile-numbers?${params.toString()}`);
      const data = await response.json();

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const mobilesString = data.data.join(', ');
        setMobileNumbers(mobilesString);
        setSuccess(`Found ${data.data.length} mobile numbers for status "${status}"`);
      } else {
        setError(`No mobile numbers found for status "${status}"`);
        setMobileNumbers('');
      }
    } catch (err) {
      console.error('Error fetching mobile numbers:', err);
      setError('Failed to fetch mobile numbers. Please try again.');
    } finally {
      setFetchingMobiles(false);
    }
  };

  const handleSendNow = async (campaignId: string) => {
    if (!confirm('Are you sure you want to send this campaign now? This will send messages to all pending recipients.')) {
      return;
    }

    setSendingCampaign(campaignId);
    try {
      // First, get the campaign details to check recipient status
      const campaignResponse = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/${campaignId}`);
      const campaignData = await campaignResponse.json().catch(() => ({}));
      if (!campaignResponse.ok) {
        throw new Error(campaignData.message || `Failed to fetch campaign: ${campaignResponse.statusText}`);
      }
      if (!campaignData.success) {
        throw new Error(campaignData.message || 'Failed to fetch campaign details');
      }

      // Extract contact IDs from the campaign
      const contactIds = campaignData.data.recipients
        .filter((r: any) => r.status === 'PENDING')
        .map((r: any) => r.contactId)
        .filter(Boolean);

      if (contactIds.length > 0) {
        // Check if any contacts are marked as paid
        const { allPaid, paidContactIds } = await checkContactsPaymentStatus(contactIds);
        
        if (allPaid) {
          alert('All selected contacts are marked as paid. No messages will be sent to paid contacts.');
          return;
        }
        
        if (paidContactIds.length > 0) {
          const proceed = confirm(
            `${paidContactIds.length} out of ${contactIds.length} contacts are marked as paid. ` +
            'These contacts will be skipped. Do you want to continue sending to the remaining contacts?'
          );
          
          if (!proceed) {
            setSendingCampaign(null);
            return;
          }
        }
      }

      // Proceed with sending the campaign
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/${campaignId}/send-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          excludePaid: true // Let the backend know to exclude paid contacts
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }
      if (data.success) {
        const message = data.skippedPaid > 0
          ? `Campaign sent! ${data.skippedPaid} contacts were skipped because they are marked as paid.`
          : 'Campaign messages are being sent! Check back in a few minutes.';
        alert(message);
        fetchScheduledCampaigns(true);
        fetchCampaigns(1, true);
      } else {
        alert(`Failed to send campaign: ${data.message || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send campaign';
      alert(`Error: ${errorMessage}`);
      console.error('Send campaign error:', err);
    } finally {
      setSendingCampaign(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent, options?: { scheduled?: boolean }) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Parse mobile numbers
      const mobilesArray = mobileNumbers
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

      if (mobilesArray.length === 0) {
        setError('Please enter at least one mobile number');
        return;
      }

      // Prepare parameters
      const cfg = getParamConfig(templateName);
      const parameters = paramValues.slice(0, cfg.length);
      const missing = parameters.findIndex((p) => !p || p.trim() === '');
      if (missing !== -1) {
        setError('Please fill all required template parameters');
        return;
      }

      let scheduledAtIso: string | undefined;
      if (options?.scheduled) {
        if (!scheduledAt) {
          setError('Please pick a date & time to schedule the WhatsApp send');
          return;
        }
        const parsed = new Date(scheduledAt);
        if (Number.isNaN(parsed.getTime())) {
          setError('Invalid schedule time. Please pick a valid date & time.');
          return;
        }
        scheduledAtIso = parsed.toISOString();
      }

      const payload = {
        templateName,
        templateId,
        mobileNumbers: mobilesArray,
        parameters,
        ...(scheduledAtIso ? { scheduledAt: scheduledAtIso } : {})
      };

      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      if (data.success) {
        setSuccess(data.message || 'WhatsApp campaign created successfully!');
        setMobileNumbers('');
        setParamValues((prev) => prev.map(() => ''));
        setScheduledAt('');
        setTimeout(() => {
          fetchCampaigns(1, true);
          fetchScheduledCampaigns(true);
        }, 500);
        if (data.campaign?.status === 'SCHEDULED') {
          setActiveTab('scheduled');
        } else {
          setActiveTab('history');
        }
      } else {
        setError(data.message || 'Failed to create campaign');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while creating the campaign';
      setError(errorMessage);
      console.error('Campaign creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'IN_PROGRESS':
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'FAILED':
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'PARTIAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'SCHEDULED':
      case 'scheduled':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-3 rounded-2xl shadow-lg">
              <MessageSquare className="text-white" size={32} />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">WhatsApp Marketing</h1>
          <p className="text-gray-600">Send WhatsApp messages using WATI templates</p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white rounded-lg shadow-md p-1 inline-flex">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-2 rounded-md font-semibold transition-all ${
                activeTab === 'create'
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Send Campaign
            </button>
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`px-6 py-2 rounded-md font-semibold transition-all relative ${
                activeTab === 'scheduled'
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Scheduled
              {scheduledCampaigns.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {scheduledCampaigns.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-md font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Create Campaign Tab */}
        {activeTab === 'create' && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">
                1
              </span>
              Create New WhatsApp Campaign
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="templateName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader className="animate-spin" size={16} />
                      <span>Loading templates...</span>
                    </div>
                  ) : (
                    <select
                      id="templateName"
                      value={templateName}
                      onChange={(e) => {
                        setTemplateName(e.target.value);
                        const template = templates.find(t => t.name === e.target.value);
                        setTemplateId(template?.id || '');
                        ensureParamValues(e.target.value);
                      }}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      required
                    >
                      {templates.length === 0 ? (
                        <option value="">No templates available</option>
                      ) : (
                        templates.map((template) => (
                          <option key={template.id} value={template.name}>
                            {template.name}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="templateId" className="block text-sm font-semibold text-gray-700 mb-2">
                    Template ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="templateId"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    placeholder="Template ID (auto-filled)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all bg-gray-50"
                    readOnly
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mobileNumbers" className="block text-sm font-semibold text-gray-700 mb-2">
                  Mobile Numbers (Recipients)
                </label>
                
                {/* Booking Status & Date Filter */}
                <div className="mb-3 flex flex-col md:flex-row items-start md:items-center gap-3 bg-gradient-to-r from-green-50 to-purple-50 p-4 rounded-lg border border-green-200">
                  <div className="flex-1 space-y-2">
                    <div>
                      <label htmlFor="bookingStatus" className="block text-xs font-semibold text-gray-700 mb-1">
                        Get Mobile Numbers by Booking Status
                      </label>
                      <select
                        id="bookingStatus"
                        value={selectedBookingStatus}
                        onChange={(e) => {
                          setSelectedBookingStatus(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-sm"
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                        <option value="no-show">No Show</option>
                        <option value="rescheduled">Rescheduled</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 text-xs text-gray-700">
                      <div className="flex-1">
                        <label className="block mb-1">From Date (optional)</label>
                        <input
                          type="date"
                          value={fromDateFilter}
                          onChange={(e) => setFromDateFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block mb-1">To Date (optional)</label>
                        <input
                          type="date"
                          value={toDateFilter}
                          onChange={(e) => setToDateFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleGetMobilesByStatus(selectedBookingStatus)}
                      disabled={fetchingMobiles}
                      className="mt-2 md:mt-6 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                    >
                      {fetchingMobiles ? (
                        <>
                          <Loader className="animate-spin" size={16} />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          Get Mobiles
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  id="mobileNumbers"
                  value={mobileNumbers}
                  onChange={(e) => setMobileNumbers(e.target.value)}
                  placeholder="e.g., +919876543210, +919123456789, +919988776655"
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate multiple mobile numbers with commas. Include country code (e.g., +91 for India)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getParamConfig(templateName).map((field, idx) => (
                  <div key={field.label}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {field.label}
                    </label>
                    <input
                      type="text"
                      value={paramValues[idx] || ''}
                      onChange={(e) => {
                        const next = [...paramValues];
                        next[idx] = e.target.value;
                        setParamValues(next);
                      }}
                      placeholder={field.placeholder || `Value for {{${idx + 1}}}`}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    />
                    {field.helper && <p className="text-xs text-gray-500 mt-1">{field.helper}</p>}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Schedule send (optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Pick a time to send. Leave empty to use default cadence.
                  </p>
                </div>
              </div>

              {templateName.toLowerCase() === 'flashfire_appointment_reminder' && (
                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">
                  <p className="text-sm font-semibold text-emerald-800 mb-2">Template Preview</p>
                  <div className="text-sm text-emerald-900 leading-relaxed">
                    <p>Hi {'{{1}}'}, your Flashfire consultation is confirmed for {'{{2}}'} at {'{{3}}'}.</p>
                    <p className="mt-2">👉 Join the call here: {'{{4}}'}</p>
                    <p className="mt-1">Need to reschedule? You can select another time here: {'{{5}}'}</p>
                    <p className="mt-2">Looking forward to speaking with you!</p>
                  </div>
                </div>
              )}

              {templateName.toLowerCase() === 'cancelled1' && (
                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">
                  <p className="text-sm font-semibold text-emerald-800 mb-2">Template Preview</p>
                  <div className="text-sm text-emerald-900 leading-relaxed">
                    <p>Hi {'{{1}}'},</p>
                    <p className="mt-2">The Flashfire consultation scheduled for {'{{2}}'} at {'{{3}}'} could not take place.</p>
                    <p className="mt-2">You can use the link below to choose a new time:</p>
                    <p className="mt-1">{'{{4}}'}</p>
                    <p className="mt-2">If you need any assistance, feel free to reply to this message.</p>
                  </div>
                </div>
              )}

              {(templateName.toLowerCase().includes('no show') || templateName.toLowerCase().includes('noshow')) ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 font-medium mb-2">⚡ Immediate Send Mode:</p>
                  <p className="text-sm text-green-700">
                    This template will be sent <strong>immediately</strong> to all recipients. No scheduling will occur.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">📅 Scheduled Send Times:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li><strong>Day 0:</strong> Immediately (within a few seconds)</li>
                    <li><strong>Day 1:</strong> Tomorrow at 10:00 AM IST</li>
                    <li><strong>Day 2:</strong> Day after tomorrow at 10:00 AM IST</li>
                  </ul>
                  <p className="text-sm text-blue-600 mt-2 italic">
                    Note: If a user books a call, they will not receive follow-up messages.
                  </p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <CheckCircle2 className="text-green-600 flex-shrink-0" size={20} />
                  <p className="text-green-700 text-sm font-medium">{success}</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                  <AlertTriangle className="text-red-600 flex-shrink-0" size={20} />
                  <p className="text-red-700 text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-3">
                <button
                  type="submit"
                  disabled={loading || loadingTemplates || templates.length === 0}
                  className="flex-1 py-4 px-6 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold text-lg hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02] shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      Creating Campaign...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      Create WhatsApp Campaign
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e as any, { scheduled: true })}
                  disabled={loading || loadingTemplates || templates.length === 0}
                  className="flex-1 py-4 px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-bold text-lg hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-[1.02] shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="animate-spin" size={20} />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <Clock size={20} />
                      Schedule WhatsApp
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Scheduled Campaigns Tab */}
        {activeTab === 'scheduled' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Clock className="text-green-500" size={28} />
                Scheduled Campaigns ({scheduledCampaigns.length})
              </h2>
              <button
                onClick={() => fetchScheduledCampaigns(true)}
                disabled={loadingScheduled}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-semibold"
              >
                <RefreshCw className={loadingScheduled ? 'animate-spin' : ''} size={16} />
                Refresh
              </button>
            </div>

            {loadingScheduled && scheduledCampaigns.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                <Loader className="animate-spin text-green-500 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading scheduled campaigns...</p>
              </div>
            ) : scheduledCampaigns.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                <Clock className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600 text-lg">No scheduled campaigns found</p>
                <p className="text-gray-500 text-sm mt-2">Create a new campaign to get started!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {scheduledCampaigns.map((campaign) => (
                  <div key={campaign._id} className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <MessageSquare className="text-green-500" size={20} />
                            {campaign.templateName}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            <strong>Campaign ID:</strong> {campaign.campaignId}
                          </p>
                          <p className="text-sm text-gray-600">
                            <strong>Total Recipients:</strong> {campaign.totalRecipients} mobiles
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                          
                          {/* Send Now Button - Only show if campaign has pending messages */}
                          {(campaign.status === 'SCHEDULED' || campaign.status === 'IN_PROGRESS' || campaign.status === 'PARTIAL') && 
                           (campaign.totalRecipients - campaign.successCount - campaign.failedCount) > 0 && (
                            <button
                              onClick={() => handleSendNow(campaign.campaignId)}
                              disabled={sendingCampaign === campaign.campaignId}
                              className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg text-xs font-semibold hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-1.5 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {sendingCampaign === campaign.campaignId ? (
                                <>
                                  <Loader className="animate-spin" size={14} />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Play size={14} />
                                  Send Now
                                </>
                              )}
                            </button>
                          )}
                          
                          <button
                            onClick={() => setExpandedScheduled(expandedScheduled === campaign.campaignId ? null : campaign.campaignId)}
                            className="text-green-600 hover:text-green-700 transition-colors flex items-center gap-1 text-sm font-semibold"
                          >
                            {expandedScheduled === campaign.campaignId ? (
                              <>
                                <ChevronUp size={16} />
                                Hide Details
                              </>
                            ) : (
                              <>
                                <ChevronDown size={16} />
                                Show Details
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-green-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Success</p>
                          <p className="text-2xl font-bold text-green-600">{campaign.successCount}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Failed</p>
                          <p className="text-2xl font-bold text-red-600">{campaign.failedCount}</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-gray-600 mb-1">Pending</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {campaign.totalRecipients - campaign.successCount - campaign.failedCount}
                          </p>
                        </div>
                      </div>

                      {expandedScheduled === campaign.campaignId && campaign.sendSchedule && (
                        <div className="mt-6 border-t border-gray-200 pt-6">
                          <h4 className="text-lg font-bold text-gray-900 mb-4">Send Schedule</h4>
                          <div className="space-y-3">
                            {campaign.sendSchedule.map((schedule) => (
                              <div key={schedule.day} className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-gray-900">
                                    Day {schedule.day} - {new Date(schedule.scheduledDate).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <span className="text-green-600">✓ Sent: {schedule.sent}</span>
                                  <span className="text-blue-600">⏳ Pending: {schedule.pending}</span>
                                  <span className="text-red-600">✗ Failed: {schedule.failed}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Campaign History</h2>
              <button
                onClick={() => fetchCampaigns(1)}
                disabled={loadingCampaigns}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-semibold"
              >
                <RefreshCw className={loadingCampaigns ? 'animate-spin' : ''} size={16} />
                Refresh
              </button>
            </div>

            {loadingCampaigns && campaigns.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                <Loader className="animate-spin text-green-500 mx-auto mb-4" size={32} />
                <p className="text-gray-600">Loading campaigns...</p>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
                <MessageSquare className="text-gray-400 mx-auto mb-4" size={48} />
                <p className="text-gray-600 text-lg">No campaigns found</p>
                <p className="text-gray-500 text-sm mt-2">Create your first WhatsApp campaign!</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign._id} className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                              <MessageSquare className="text-green-500" size={20} />
                              {campaign.templateName}
                            </h3>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p><strong>Campaign ID:</strong> {campaign.campaignId}</p>
                              <p><strong>Total Recipients:</strong> {campaign.totalRecipients}</p>
                              <p><strong>Created:</strong> {new Date(campaign.createdAt).toLocaleString()}</p>
                              {campaign.completedAt && (
                                <p><strong>Completed:</strong> {new Date(campaign.completedAt).toLocaleString()}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(campaign.status)}`}>
                              {campaign.status}
                            </span>
                            <button
                              onClick={() => setExpandedCampaign(expandedCampaign === campaign.campaignId ? null : campaign.campaignId)}
                              className="text-green-600 hover:text-green-700 transition-colors flex items-center gap-1 text-sm font-semibold"
                            >
                              {expandedCampaign === campaign.campaignId ? (
                                <>
                                  <ChevronUp size={16} />
                                  Hide
                                </>
                              ) : (
                                <>
                                  <ChevronDown size={16} />
                                  View
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="bg-green-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 mb-1">Successful</p>
                            <p className="text-2xl font-bold text-green-600">{campaign.successCount || 0}</p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 mb-1">Failed</p>
                            <p className="text-2xl font-bold text-red-600">{campaign.failedCount || 0}</p>
                          </div>
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs text-gray-600 mb-1">Pending</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {campaign.totalRecipients - (campaign.successCount || 0) - (campaign.failedCount || 0)}
                            </p>
                          </div>
                        </div>

                        {expandedCampaign === campaign.campaignId && campaign.messageStatuses && (
                          <div className="mt-6 border-t border-gray-200 pt-6">
                            <h4 className="text-lg font-bold text-gray-900 mb-4">Message Details</h4>
                            <div className="max-h-96 overflow-y-auto">
                              <div className="space-y-2">
                                {campaign.messageStatuses.map((msg, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Smartphone size={16} className="text-gray-400" />
                                      <span className="text-sm font-medium text-gray-900">{msg.mobileNumber}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {msg.sentAt && (
                                        <span className="text-xs text-gray-500">
                                          {new Date(msg.sentAt).toLocaleString()}
                                        </span>
                                      )}
                                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(msg.status)}`}>
                                        {msg.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingCampaigns}
                      className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-60 flex items-center gap-2"
                    >
                      {loadingCampaigns ? (
                        <>
                          <Loader className="animate-spin" size={18} />
                          Loading...
                        </>
                      ) : (
                        'Load More'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

