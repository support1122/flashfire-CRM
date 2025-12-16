import { useState, useEffect } from 'react';
import {
  Send,
  Loader,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RotateCw,
  RefreshCw,
  Clock,
  Pause,
  Play,
  Save,
} from 'lucide-react';
import type { EmailPrefillPayload } from '../types/emailPrefill';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

interface Campaign {
  _id: string;
  templateName: string;
  domainName: string;
  templateId: string;
  total: number;
  success: number;
  failed: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  successfulEmails: Array<{ email: string; sentAt: string; sendDay?: number; scheduledSendDate?: string }>;
  failedEmails: Array<{ email: string; error: string; failedAt: string; sendDay?: number; scheduledSendDate?: string }>;
  isScheduled?: boolean;
}

interface ScheduledCampaign {
  _id: string;
  campaignName: string;
  templateName: string;
  domainName: string;
  templateId: string;
  totalRecipients: number;
  recipientEmails: string[];
  sendSchedule: Array<{
    day: number;
    scheduledDate: string;
    status: 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';
    sentCount: number;
    failedCount: number;
    skippedCount: number;
    completedAt?: string;
  }>;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'success';
    message: string;
    details?: any;
  }>;
}

interface EmailCampaignProps {
  prefill?: EmailPrefillPayload | null;
  onPrefillConsumed?: () => void;
}

interface EmailTemplate {
  id: string;
  name: string;
  domainName: string;
  templateId: string;
  createdAt: string;
}

export default function EmailCampaign({ prefill, onPrefillConsumed }: EmailCampaignProps) {
  const [domainName, setDomainName] = useState('');
  const [templateName, setTemplateName] = useState('Lead Not Booked Call Follow up 1');
  const [templateId, setTemplateId] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [emailIds, setEmailIds] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scheduledCampaigns, setScheduledCampaigns] = useState<ScheduledCampaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedScheduled, setExpandedScheduled] = useState<string | null>(null);
  const [resendingEmails, setResendingEmails] = useState<string[]>([]);
  const [togglingStatus, setTogglingStatus] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'scheduled' | 'history'>('create');
  const [selectedBookingStatus, setSelectedBookingStatus] = useState<string>('scheduled');
  const [fetchingEmails, setFetchingEmails] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loadingEmailTemplates, setLoadingEmailTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    fetchCampaigns();
    fetchScheduledCampaigns();
    fetchEmailTemplates();
    const interval = setInterval(() => {
      fetchScheduledCampaigns();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmailTemplates = async () => {
    setLoadingEmailTemplates(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/email-templates`);
      const data = await response.json();

      if (data.success) {
        setEmailTemplates(data.templates || []);
      } else {
        console.error('Failed to fetch email templates:', data.message);
      }
    } catch (err) {
      console.error('Error fetching email templates:', err);
    } finally {
      setLoadingEmailTemplates(false);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = emailTemplates.find(t => t.id === templateId);
    if (template) {
      setTemplateName(template.name);
      setTemplateId(template.templateId);
      setDomainName(template.domainName);
    }
  };

  useEffect(() => {
    if (prefill?.recipients?.length) {
      setEmailIds(prefill.recipients.join(', '));
      if (prefill.templateId) {
        setTemplateId(prefill.templateId);
      }
      // Set default template name for no-show followup
      if (prefill.reason === 'no_show_followup') {
        setTemplateName('Mark as No Show');
      }
      setSuccess(
        `Loaded ${prefill.recipients.length} recipient${prefill.recipients.length > 1 ? 's' : ''}${
          prefill.reason ? ` from ${prefill.reason.replace(/_/g, ' ')}` : ''
        }. ${prefill.reason === 'no_show_followup' ? 'This will send immediately (not scheduled).' : 'Choose a template and create scheduled campaign.'}`
      );
      setError('');
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  const fetchCampaigns = async (pageNum: number = 1) => {
    setLoadingCampaigns(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/email-campaigns?page=${pageNum}&limit=50`);
      const data = await response.json();

      if (data.success) {
        if (pageNum === 1) {
          setCampaigns(data.data);
        } else {
          setCampaigns((prev) => [...prev, ...data.data]);
        }
        setHasMore(data.pagination.hasMore);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const fetchScheduledCampaigns = async () => {
    setLoadingScheduled(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/email-campaigns/scheduled`);
      const data = await response.json();

      if (data.success) {
        setScheduledCampaigns(data.data);
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

  const handleGetEmailsByStatus = async () => {
    setFetchingEmails(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings?status=${selectedBookingStatus}`);
      const data = await response.json();

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        // Extract unique emails from bookings
        const uniqueEmails = Array.from(new Set(data.data.map((booking: any) => booking.clientEmail).filter(Boolean)));
        const emailsString = uniqueEmails.join(', ');
        setEmailIds(emailsString);
        setSuccess(`Found ${uniqueEmails.length} unique emails for status "${selectedBookingStatus}"`);
      } else {
        setError(`No emails found for status "${selectedBookingStatus}"`);
      }
    } catch (err) {
      console.error('Error fetching emails by status:', err);
      setError('Failed to fetch emails. Please try again.');
    } finally {
      setFetchingEmails(false);
    }
  };

  const handleGetEmails = async () => {
    setLoadingEmails(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/without-bookings`);
      const data = await response.json();

      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const emailsString = data.data.join(', ');
        setEmailIds(emailsString);
        setSuccess(`Found ${data.data.length} emails`);
      } else {
        setError('No emails found or failed to fetch emails');
      }
    } catch (err) {
      console.error('Error fetching emails:', err);
      setError('Failed to fetch emails. Please try again.');
    } finally {
      setLoadingEmails(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!domainName || !templateId || !templateName) {
      setError('Please fill in Domain Name, Template Name, and Template ID to save the template');
      return;
    }

    setSavingTemplate(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/email-templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domainName: domainName.trim(),
          templateId: templateId.trim(),
          templateName: templateName.trim(),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Template saved successfully!');
      } else {
        setError(data.message || 'Failed to save template');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      setError('Failed to save template. Please try again.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCreateScheduledCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!domainName || !templateId || !emailIds.trim()) {
      setError('Please fill in all required fields (Domain Name, Template ID, and Email IDs)');
      setLoading(false);
      return;
    }

    const emailArray = emailIds
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emailArray.length === 0) {
      setError('Please provide at least one email address');
      setLoading(false);
      return;
    }

    // Check if this is a "Mark as No Show" template - send immediately instead of scheduling
    const isNoShowTemplate = templateName.toLowerCase().includes('mark as no show') || 
                            templateName.toLowerCase().includes('no show') ||
                            prefill?.reason === 'no_show_followup';

    try {
      let response;
      let data;

        if (isNoShowTemplate) {
        // Send immediately using SendEmailCampaign endpoint
        response = await fetch(`${API_BASE_URL}/api/email-campaign/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateName: templateName || 'Mark as No Show',
            domainName,
            templateId,
            emailIds: emailArray,
            senderEmail: senderEmail || undefined,
          }),
        });

        data = await response.json();

        if (data.success) {
          setSuccess(`Emails sent immediately! ${data.data.totalSent} email(s) sent successfully, ${data.data.totalFailed} failed.`);
          setDomainName('');
          setTemplateId('');
          setTemplateName('');
          setSenderEmail('');
          setEmailIds('');
          setSelectedTemplateId('');
          fetchCampaigns(1);
          setActiveTab('history');
        } else {
          setError(data.message || 'Failed to send emails');
        }
      } else {
        // Create scheduled campaign as usual
        response = await fetch(`${API_BASE_URL}/api/email-campaign/scheduled`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            templateName: templateName || 'Lead Not Booked Call Follow up 1',
            domainName,
            templateId,
            emailIds: emailArray,
            senderEmail: senderEmail || undefined,
          }),
        });

        data = await response.json();

        if (data.success) {
          setSuccess(`Scheduled campaign created successfully! ${data.data.totalRecipients} recipients will receive emails on ${data.data.sendSchedule.length} scheduled dates (Day 0, 4, 7, 14, 28 at 7:30 PM).`);
          setDomainName('');
          setTemplateId('');
          setTemplateName('');
          setSenderEmail('');
          setEmailIds('');
          setSelectedTemplateId('');
          fetchScheduledCampaigns();
          setActiveTab('scheduled');
        } else {
          setError(data.message || 'Failed to create scheduled campaign');
        }
      }
    } catch (err) {
      console.error('Error creating/sending campaign:', err);
      setError(`Failed to ${isNoShowTemplate ? 'send' : 'create scheduled'} campaign. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (campaignId: string, failedEmails: Array<{ email: string }>) => {
    const emailList = failedEmails.map((f) => f.email);
    setResendingEmails((prev) => [...prev, campaignId]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/email-campaign/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaignId,
          emailIds: emailList,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Resent ${data.data.totalSent} emails successfully, ${data.data.totalFailed} failed`);
        fetchCampaigns(1);
      } else {
        setError(data.message || 'Failed to resend emails');
      }
    } catch (err) {
      console.error('Error resending emails:', err);
      setError('Failed to resend emails. Please try again.');
    } finally {
      setResendingEmails((prev) => prev.filter((id) => id !== campaignId));
    }
  };

  const handleToggleCampaignStatus = async (campaignId: string, currentStatus: string) => {
    setTogglingStatus((prev) => [...prev, campaignId]);
    setError('');
    setSuccess('');

    try {
      // Determine new status: if paused, resume to active; if active, pause it
      const newStatus = currentStatus === 'paused' ? 'active' : 'paused';

      const response = await fetch(`${API_BASE_URL}/api/email-campaigns/scheduled/${campaignId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Campaign ${newStatus === 'paused' ? 'paused' : 'resumed'} successfully`);
        fetchScheduledCampaigns();
      } else {
        setError(data.message || 'Failed to update campaign status');
      }
    } catch (err) {
      console.error('Error toggling campaign status:', err);
      setError('Failed to update campaign status. Please try again.');
    } finally {
      setTogglingStatus((prev) => prev.filter((id) => id !== campaignId));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
      case 'completed':
      case 'success':
        return <CheckCircle2 className="text-green-500" size={16} />;
      case 'PARTIAL':
      case 'processing':
        return <AlertTriangle className="text-yellow-500" size={16} />;
      case 'FAILED':
      case 'failed':
      case 'error':
        return <XCircle className="text-red-500" size={16} />;
      case 'pending':
        return <Clock className="text-blue-500" size={16} />;
      case 'active':
        return <RotateCw className="text-green-500 animate-spin" size={16} />;
      case 'paused':
        return <Pause className="text-orange-500" size={16} />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-3 py-1 rounded-full text-xs font-semibold';
    switch (status) {
      case 'SUCCESS':
      case 'completed':
      case 'success':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'PARTIAL':
      case 'processing':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'FAILED':
      case 'failed':
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`;
      case 'pending':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'active':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'paused':
        return `${baseClasses} bg-orange-100 text-orange-800`;
      case 'cancelled':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Email Campaign Manager</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-orange-100 mb-8">
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'create'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Create Campaign
            </button>
            <button
              onClick={() => {
                setActiveTab('scheduled');
                fetchScheduledCampaigns();
              }}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'scheduled'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Scheduled Campaigns
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                fetchCampaigns(1);
              }}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'history'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Campaign History
            </button>
          </div>

          {activeTab === 'create' && (
            <form onSubmit={handleCreateScheduledCampaign} className="space-y-6">
              {/* Template Selector Dropdown */}
              <div>
                <label htmlFor="savedTemplate" className="block text-sm font-semibold text-gray-700 mb-2">
                  Select Saved Template
                </label>
                <select
                  id="savedTemplate"
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                >
                  <option value="">-- Select a saved template --</option>
                  {loadingEmailTemplates ? (
                    <option value="" disabled>Loading templates...</option>
                  ) : emailTemplates.length === 0 ? (
                    <option value="" disabled>No saved templates</option>
                  ) : (
                    emailTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.domainName})
                      </option>
                    ))
                  )}
                </select>
                <p className="text-xs text-gray-500 mt-1">Select a saved template to auto-fill the form fields</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="domainName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Domain Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="domainName"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    placeholder="e.g., example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="templateName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Template Name
                  </label>
                  <input
                    type="text"
                    id="templateName"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Lead Not Booked Call Follow up 1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="templateId" className="block text-sm font-semibold text-gray-700 mb-2">
                  Template ID <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="templateId"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    placeholder="e.g., d-1234567890abcdef"
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={!domainName || !templateId || !templateName || loading}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-all transform hover:scale-[1.02] shadow-md hover:shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
                  >
                    {savingTemplate ? (
                      <>
                        <Loader className="animate-spin" size={18} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save Template
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="senderEmail" className="block text-sm font-semibold text-gray-700 mb-2">
                  Sender Email
                  <span className="text-gray-400 text-xs ml-1">(optional - defaults to elizabeth@flashfirehq.com or elizabeth@domain)</span>
                </label>
                <input
                  type="email"
                  id="senderEmail"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="e.g., elizabeth@example.com (optional)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="emailIds" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email IDs (Recipients)
                </label>
                
                {/* Booking Status Filter */}
                <div className="mb-3 flex items-center gap-3 bg-gradient-to-r from-orange-50 to-purple-50 p-4 rounded-lg border border-orange-200">
                  <div className="flex-1">
                    <label htmlFor="bookingStatus" className="block text-xs font-semibold text-gray-700 mb-2">
                      Get Emails by Booking Status
                    </label>
                    <select
                      id="bookingStatus"
                      value={selectedBookingStatus}
                      onChange={async (e) => {
                        setSelectedBookingStatus(e.target.value);
                        setFetchingEmails(true);
                        setError('');
                        setSuccess('');
                        try {
                          const response = await fetch(`${API_BASE_URL}/api/campaign-bookings?status=${e.target.value}`);
                          const data = await response.json();
                          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
                            const uniqueEmails = Array.from(new Set(data.data.map((booking: any) => booking.clientEmail).filter(Boolean)));
                            const emailsString = uniqueEmails.join(', ');
                            setEmailIds(emailsString);
                            setSuccess(`Found ${uniqueEmails.length} unique emails for status "${e.target.value}"`);
                          } else {
                            setError(`No emails found for status "${e.target.value}"`);
                          }
                        } catch (err) {
                          console.error('Error fetching emails by status:', err);
                          setError('Failed to fetch emails. Please try again.');
                        } finally {
                          setFetchingEmails(false);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="no-show">No Show</option>
                      <option value="rescheduled">Rescheduled</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetEmailsByStatus}
                    disabled={fetchingEmails}
                    className="mt-6 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-semibold hover:from-orange-600 hover:to-orange-700 transition-all transform hover:scale-[1.02] shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                  >
                    {fetchingEmails ? (
                      <>
                        <Loader className="animate-spin" size={16} />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={16} />
                        Get Emails
                      </>
                    )}
                  </button>
                </div>

                <textarea
                  id="emailIds"
                  value={emailIds}
                  onChange={(e) => setEmailIds(e.target.value)}
                  placeholder="e.g., email1@example.com, email2@example.com, email3@example.com"
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Separate multiple email addresses with commas</p>
              </div>

              {(templateName.toLowerCase().includes('mark as no show') || 
                templateName.toLowerCase().includes('no show') ||
                prefill?.reason === 'no_show_followup') ? (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm text-orange-800 font-medium mb-2">⚠️ Immediate Send Mode:</p>
                  <p className="text-sm text-orange-700">
                    This template will be sent <strong>immediately</strong> to all recipients. No scheduling will occur.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">Scheduled Send Times:</p>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Day 0: Immediately (7:30 PM)</li>
                    <li>• Day 4: 4 days later (7:30 PM)</li>
                    <li>• Day 7: 7 days later (7:30 PM)</li>
                    <li>• Day 14: 14 days later (7:30 PM)</li>
                    <li>• Day 28: 28 days later (7:30 PM)</li>
                  </ul>
                  <p className="text-xs text-blue-600 mt-2">Emails will automatically skip recipients who have booked in between sends.</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleGetEmails}
                disabled={loadingEmails}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-all transform hover:scale-[1.02] ${
                  loadingEmails
                    ? 'bg-gray-400 cursor-not-allowed text-white'
                    : 'bg-gray-600 text-white hover:bg-gray-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {loadingEmails ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader className="animate-spin" size={20} />
                    Loading emails...
                  </span>
                ) : (
                  'Get Resume Now (Load Non-Booking Users)'
                )}
              </button>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm font-medium">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-600 text-sm font-medium">{success}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2 ${
                  loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin" size={20} />
                    {(templateName.toLowerCase().includes('mark as no show') || 
                      templateName.toLowerCase().includes('no show') ||
                      prefill?.reason === 'no_show_followup') 
                      ? 'Sending Emails...' 
                      : 'Creating Scheduled Campaign...'}
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    {(templateName.toLowerCase().includes('mark as no show') || 
                      templateName.toLowerCase().includes('no show') ||
                      prefill?.reason === 'no_show_followup') 
                      ? 'Send Email Immediately' 
                      : 'Create Scheduled Campaign'}
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === 'scheduled' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Scheduled Campaigns</h2>
                <button
                  onClick={fetchScheduledCampaigns}
                  disabled={loadingScheduled}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingScheduled ? (
                    <>
                      <Loader className="animate-spin" size={18} />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      Refresh
                    </>
                  )}
                </button>
              </div>

              {loadingScheduled && scheduledCampaigns.length === 0 ? (
                <div className="text-center py-12">
                  <Loader className="animate-spin mx-auto mb-4" size={32} />
                  <p className="text-gray-500">Loading scheduled campaigns...</p>
                </div>
              ) : scheduledCampaigns.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No scheduled campaigns yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {scheduledCampaigns.map((campaign) => (
                    <div key={campaign._id} className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-all">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{campaign.campaignName}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {campaign.templateName} • {campaign.totalRecipients} recipients
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusIcon(campaign.status)}
                          <span className={getStatusBadge(campaign.status)}>{campaign.status.toUpperCase()}</span>
                          {campaign.status !== 'completed' && campaign.status !== 'cancelled' && (
                            <button
                              onClick={() => handleToggleCampaignStatus(campaign._id, campaign.status)}
                              disabled={togglingStatus.includes(campaign._id)}
                              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                campaign.status === 'paused'
                                  ? 'bg-green-500 text-white hover:bg-green-600'
                                  : 'bg-orange-500 text-white hover:bg-orange-600'
                              }`}
                              title={campaign.status === 'paused' ? 'Resume campaign' : 'Pause campaign'}
                            >
                              {togglingStatus.includes(campaign._id) ? (
                                <>
                                  <Loader className="animate-spin" size={16} />
                                  {campaign.status === 'paused' ? 'Resuming...' : 'Pausing...'}
                                </>
                              ) : campaign.status === 'paused' ? (
                                <>
                                  <Play size={16} />
                                  Resume
                                </>
                              ) : (
                                <>
                                  <Pause size={16} />
                                  Pause
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-4 mb-4">
                        {campaign.sendSchedule.map((schedule, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border ${
                              schedule.status === 'completed'
                                ? 'bg-green-50 border-green-200'
                                : schedule.status === 'processing'
                                ? 'bg-yellow-50 border-yellow-200'
                                : schedule.status === 'failed'
                                ? 'bg-red-50 border-red-200'
                                : schedule.status === 'skipped'
                                ? 'bg-orange-50 border-orange-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="text-xs font-semibold text-gray-700 mb-1">Day {schedule.day}</div>
                            <div className="text-xs text-gray-600 mb-2">{formatDate(schedule.scheduledDate)}</div>
                            <div className="flex items-center gap-1 mb-1">
                              {getStatusIcon(schedule.status)}
                              <span className="text-xs font-medium">{schedule.status}</span>
                            </div>
                            <div className="text-xs text-gray-600">
                              ✓ {schedule.sentCount} • ✗ {schedule.failedCount} • ⊘ {schedule.skippedCount}
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => setExpandedScheduled(expandedScheduled === campaign._id ? null : campaign._id)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-medium"
                      >
                        {expandedScheduled === campaign._id ? 'Hide' : 'Show'} Logs
                        {expandedScheduled === campaign._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {expandedScheduled === campaign._id && (
                        <div className="mt-4 bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                          <h4 className="font-semibold text-gray-700 mb-3">Campaign Logs</h4>
                          <div className="space-y-2">
                            {campaign.logs.map((log, idx) => (
                              <div
                                key={idx}
                                className={`p-2 rounded text-sm ${
                                  log.level === 'error'
                                    ? 'bg-red-50 text-red-800'
                                    : log.level === 'warning'
                                    ? 'bg-yellow-50 text-yellow-800'
                                    : log.level === 'success'
                                    ? 'bg-green-50 text-green-800'
                                    : 'bg-white text-gray-700'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <span className="font-medium">[{log.level.toUpperCase()}]</span>{' '}
                                    {log.message}
                                  </div>
                                  <span className="text-xs text-gray-500 ml-2">
                                    {formatDate(log.timestamp)}
                                  </span>
                                </div>
                                {log.details && (
                                  <pre className="text-xs mt-1 overflow-x-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Campaign History</h2>
                <button
                  onClick={() => fetchCampaigns(1)}
                  disabled={loadingCampaigns}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingCampaigns ? (
                    <>
                      <Loader className="animate-spin" size={18} />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={18} />
                      Refresh
                    </>
                  )}
                </button>
              </div>

              {loadingCampaigns && campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <Loader className="animate-spin mx-auto mb-4" size={32} />
                  <p className="text-gray-500">Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No campaigns yet.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">STATUS</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">TEMPLATE NAME</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">DOMAIN</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">TEMPLATE ID</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">TOTAL</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">SUCCESS</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">FAILED</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">DATE</th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-700">DETAILS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((campaign) => (
                          <tr key={campaign._id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(campaign.status)}
                                <span className={getStatusBadge(campaign.status)}>{campaign.status}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-gray-700">{campaign.templateName || '-'}</td>
                            <td className="py-4 px-4 text-gray-700">{campaign.domainName}</td>
                            <td className="py-4 px-4 text-gray-700 font-mono text-xs">{campaign.templateId}</td>
                            <td className="py-4 px-4 text-gray-700">{campaign.total}</td>
                            <td className="py-4 px-4 text-green-600 font-semibold">{campaign.success}</td>
                            <td className="py-4 px-4 text-red-600 font-semibold">{campaign.failed}</td>
                            <td className="py-4 px-4 text-gray-600 text-sm">{formatDate(campaign.createdAt)}</td>
                            <td className="py-4 px-4">
                              <button
                                onClick={() =>
                                  setExpandedCampaign(expandedCampaign === campaign._id ? null : campaign._id)
                                }
                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-medium"
                              >
                                Show Details
                                {expandedCampaign === campaign._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {expandedCampaign && (
                    <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-6 space-y-4">
                      {campaigns
                        .filter((campaign) => campaign._id === expandedCampaign)
                        .map((campaign) => (
                          <div key={campaign._id} className="space-y-6">
                            {campaign.successfulEmails.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-green-700 mb-2">
                                  Successful Emails ({campaign.successfulEmails.length})
                                </h4>
                                <div className="bg-white rounded-lg p-4 max-h-48 overflow-y-auto border border-green-100">
                                  {campaign.successfulEmails.map((item, idx) => (
                                    <div
                                      key={`${item.email}-${idx}`}
                                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                                    >
                                      <span className="text-sm text-gray-700">{item.email}</span>
                                      <div className="text-xs text-gray-500">
                                        {item.sendDay !== undefined && <span>Day {item.sendDay} • </span>}
                                        <span>Sent {formatDate(item.sentAt)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {campaign.failedEmails.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-red-700 mb-2">
                                  Failed Emails ({campaign.failedEmails.length})
                                </h4>
                                <div className="bg-white rounded-lg p-4 max-h-48 overflow-y-auto border border-red-100">
                                  {campaign.failedEmails.map((item, idx) => (
                                    <div
                                      key={`${item.email}-${idx}`}
                                      className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 py-2 border-b border-gray-100 last:border-0"
                                    >
                                      <div className="flex-1">
                                        <span className="text-sm text-gray-700 block">{item.email}</span>
                                        <p className="text-xs text-red-600 mt-1">{item.error}</p>
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {item.sendDay !== undefined && <span>Day {item.sendDay} • </span>}
                                        <span>Failed {formatDate(item.failedAt)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => handleResend(campaign._id, campaign.failedEmails)}
                                  disabled={resendingEmails.includes(campaign._id)}
                                  className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all flex items-center gap-2 text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  {resendingEmails.includes(campaign._id) ? (
                                    <>
                                      <Loader className="animate-spin" size={16} />
                                      Resending...
                                    </>
                                  ) : (
                                    <>
                                      <RotateCw size={16} />
                                      Resend Failed Emails
                                    </>
                                  )}
                                  
                                </button>
                              </div>
                            )}
                            {campaign.successfulEmails.length === 0 && campaign.failedEmails.length === 0 && (
                              <p className="text-sm text-gray-500">No additional email details available for this campaign.</p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}

                  {hasMore && (
                    <div className="mt-6 text-center">
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingCampaigns}
                        className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                      >
                        {loadingCampaigns ? (
                          <>
                            <Loader className="animate-spin" size={20} />
                            Loading...
                          </>
                        ) : (
                          'Load More (50 more)'
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
    </div>
  );
}
