import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Check,
  Copy,
  TrendingUp,
  Users,
  MousePointerClick,
  Calendar,
  Trash2,
  Loader,
} from 'lucide-react';
import CampaignStatsModal from './CampaignStatsModal';

interface Campaign {
  _id: string;
  campaignId: string;
  campaignName: string;
  utmSource: string;
  utmMedium: string;
  generatedUrl: string;
  totalClicks: number;
  totalButtonClicks?: number;
  uniqueVisitorsCount: number;
  totalBookings: number;
  isActive: boolean;
  createdAt: string;
  pageVisits?: any[];
  buttonClicks?: any[];
}

interface CampaignDetails {
  campaign: Campaign & { pageVisits?: any[]; buttonClicks?: any[] };
  bookings: any[];
  stats: {
    totalClicks: number;
    totalButtonClicks?: number;
    uniqueVisitors: number;
    totalBookings: number;
    conversionRate: string;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

export default function CampaignManager() {
  const [campaignName, setCampaignName] = useState('');
  const [exactUtmSource, setExactUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('campaign');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<CampaignDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const campaignDetailsCache = useRef(new Map<string, CampaignDetails>()).current;

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    setCampaignsError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      const url = `${API_BASE_URL}/api/campaigns${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.success) {
        setCampaigns(data.data);
      } else {
        setCampaignsError(data.message || 'Failed to load campaigns');
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setCampaignsError('Failed to load campaigns. Please try again.');
    } finally {
      setCampaignsLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchAllBookings();
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const fetchAllBookings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings`);
      const data = await response.json();

      if (data.success) {
        setAllBookings(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  const getFilteredBookings = (utmSource: string) => {
    if (!fromDate || !toDate) {
      return allBookings.filter((booking) => booking.utmSource === utmSource);
    }

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    return allBookings.filter((booking) => {
      if (booking.utmSource !== utmSource) return false;

      // Filter out "Unknown Client" with placeholder email
      if (booking.clientName === 'Unknown Client' && booking.clientEmail?.includes('calendly.placeholder')) {
        return false;
      }

      // Filter out invalid dates (e.g. 1970-01-01)
      if (booking.scheduledEventStartTime) {
        const date = new Date(booking.scheduledEventStartTime);
        if (date.getFullYear() === 1970) {
          return false;
        }
      }

      if (!fromDate || !toDate) return true;

      const bookingDate = new Date(booking.bookingCreatedAt);
      return bookingDate >= startDate && bookingDate <= endDate;
    });
  };

  const getFilteredMetrics = (campaign: Campaign) => {
    const filteredBookings = getFilteredBookings(campaign.utmSource);
    return {
      totalClicks: campaign.totalClicks ?? 0,
      totalButtonClicks: campaign.totalButtonClicks ?? 0,
      uniqueVisitors: campaign.uniqueVisitorsCount ?? 0,
      totalBookings: campaign.totalBookings ?? filteredBookings.length,
      bookings: filteredBookings,
      buttonClicks: [],
    };
  };

  const clearDateFilter = () => {
    setFromDate('');
    setToDate('');
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameTrim = campaignName.trim();
    const exactTrim = exactUtmSource.trim();
    if (!nameTrim && !exactTrim) {
      alert('Please enter a campaign name or exact UTM source');
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string | null> = {
        campaignName: nameTrim || exactTrim,
        utmMedium,
        utmCampaign: utmCampaign || null,
      };
      if (exactTrim) {
        body.utmSource = exactTrim.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '');
      }
      const response = await fetch(`${API_BASE_URL}/api/campaigns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.success) {
        alert('Campaign created successfully!');
        setCampaignName('');
        setExactUtmSource('');
        setUtmMedium('campaign');
        setUtmCampaign('');
        fetchCampaigns();
      } else {
        alert(data.message || 'Failed to create campaign');
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = async (url: string, campaignId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(campaignId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleViewStats = (campaign: Campaign) => {
    setSelectedCampaign(campaign);

    const cached = campaignDetailsCache.get(campaign.campaignId);
    if (cached) {
      setSelectedCampaignDetails(cached);
      setDetailsLoading(false);
      setShowStatsModal(true);
      return;
    }

    if (selectedCampaignDetails?.campaign?.campaignId === campaign.campaignId) {
      setDetailsLoading(false);
      setShowStatsModal(true);
      return;
    }

    setShowStatsModal(true);
    setDetailsLoading(true);
    setSelectedCampaignDetails(null);

    fetch(`${API_BASE_URL}/api/campaigns/${campaign.campaignId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const details: CampaignDetails = data.data;
          campaignDetailsCache.set(campaign.campaignId, details);
          setSelectedCampaignDetails(details);
        }
      })
      .catch((err) => {
        console.error('Error fetching campaign details:', err);
      })
      .finally(() => {
        setDetailsLoading(false);
      });
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (confirmDeleteId !== campaignId) {
      setConfirmDeleteId(campaignId);
      setTimeout(() => {
        setConfirmDeleteId(null);
      }, 3000);
      return;
    }

    setDeletingId(campaignId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert('✅ Campaign deleted successfully!');
        fetchCampaigns();
        setConfirmDeleteId(null);
      } else {
        alert(data.message || 'Failed to delete campaign');
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Campaign Manager</h1>
          <p className="text-lg text-gray-600">Create and track UTM campaigns for your marketing efforts</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 mb-12 border border-orange-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm">
              1
            </span>
            Create New Campaign
          </h2>

          <form onSubmit={handleCreateCampaign} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="campaignName" className="block text-sm font-semibold text-gray-700 mb-2">
                  Campaign name *
                </label>
                <input
                  type="text"
                  id="campaignName"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., my campaign"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Display name for the campaign</p>
              </div>

              <div>
                <label htmlFor="exactUtmSource" className="block text-sm font-semibold text-gray-700 mb-2">
                  Exact UTM source (optional)
                </label>
                <input
                  type="text"
                  id="exactUtmSource"
                  value={exactUtmSource}
                  onChange={(e) => setExactUtmSource(e.target.value)}
                  placeholder="e.g., whatsapp, instagram"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">Use for exact links like ?utm_source=whatsapp</p>
              </div>

              <div>
                <label htmlFor="utmMedium" className="block text-sm font-semibold text-gray-700 mb-2">
                  UTM Medium
                </label>
                <input
                  type="text"
                  id="utmMedium"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="e.g., social, email, cpc"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="utmCampaign" className="block text-sm font-semibold text-gray-700 mb-2">
                  UTM Campaign
                </label>
                <input
                  type="text"
                  id="utmCampaign"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  placeholder="e.g., campaign name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all transform hover:scale-[1.02] ${loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg hover:shadow-xl'
                }`}
            >
              {loading ? 'Creating Campaign...' : 'Generate Campaign URL'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-orange-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm">
              2
            </span>
            Filter Campaign Metrics by Date Range
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>
            <div>
              <button
                onClick={clearDateFilter}
                className="w-full py-3 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all"
              >
                Clear Filter
              </button>
            </div>
          </div>

          {(fromDate || toDate) && (
            <div className="mt-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm text-orange-800">
                <strong>Filter Active:</strong> Showing metrics for{' '}
                {fromDate && toDate
                  ? `${new Date(fromDate).toLocaleDateString()} - ${new Date(toDate).toLocaleDateString()}`
                  : 'selected date range'}
              </p>
              <p className="text-xs text-orange-700 mt-1">
                All metrics (clicks, unique visitors, bookings) are filtered by the selected date range.
              </p>
            </div>
          )}
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center mr-3 text-sm">
              3
            </span>
            Your Campaigns ({campaigns.length})
            {(fromDate || toDate) && (
              <span className="ml-2 text-sm font-normal text-orange-600">(showing filtered metrics)</span>
            )}
          </h2>

          {campaignsError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {campaignsError}
            </div>
          )}

          {campaignsLoading ? (
            <div className="bg-white rounded-2xl shadow-md p-12 text-center border border-gray-200">
              <Loader className="animate-spin mx-auto mb-4 text-orange-500" size={48} />
              <p className="text-gray-600">Loading campaigns...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-12 text-center border border-gray-200">
              <div className="text-gray-400 mb-4">
                <TrendingUp size={64} className="mx-auto" />
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No campaigns yet</h3>
              <p className="text-gray-500">Create your first campaign to start tracking!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((campaign) => {
                const filteredMetrics = getFilteredMetrics(campaign);
                return (
                  <div
                    key={campaign._id}
                    className="bg-white rounded-xl shadow-lg hover:shadow-2xl transition-all border border-orange-100 overflow-hidden group"
                  >
                    <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4">
                      <h3 className="font-bold text-white text-lg truncate" title={campaign.campaignName}>
                        {campaign.campaignName}
                      </h3>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-orange-100 text-sm">{campaign.utmMedium}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${campaign.isActive ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-700'
                            }`}
                        >
                          {campaign.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-center border-b border-gray-100">
                      <div>
                        <div className="flex items-center justify-center text-orange-500 mb-1">
                          <MousePointerClick size={16} />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{filteredMetrics.totalClicks}</div>
                        <div className="text-xs text-gray-500">
                          Page Views
                          {(fromDate || toDate) && <span className="block text-orange-600">(filtered)</span>}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center text-purple-500 mb-1">
                          <MousePointerClick size={16} />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{filteredMetrics.totalButtonClicks || 0}</div>
                        <div className="text-xs text-gray-500">
                          Button Clicks
                          {(fromDate || toDate) && <span className="block text-orange-600">(filtered)</span>}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center text-blue-500 mb-1">
                          <Users size={16} />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{filteredMetrics.uniqueVisitors}</div>
                        <div className="text-xs text-gray-500">
                          Unique
                          {(fromDate || toDate) && <span className="block text-orange-600">(filtered)</span>}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center text-green-500 mb-1">
                          <Calendar size={16} />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{filteredMetrics.totalBookings}</div>
                        <div className="text-xs text-gray-500">
                          Bookings
                          {(fromDate || toDate) && <span className="block text-orange-600">(filtered)</span>}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 border-b border-gray-100 space-y-3">
                      <div>
                        <div className="text-xs text-gray-500 mb-1 font-semibold">Website URL:</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-gray-700 truncate font-mono bg-white px-2 py-1 rounded border border-gray-200">
                            {campaign.generatedUrl}
                          </div>
                          <button
                            onClick={() => handleCopyUrl(campaign.generatedUrl, `web-${campaign.campaignId}`)}
                            className={`p-2 rounded transition-all ${copiedId === `web-${campaign.campaignId}`
                                ? 'bg-green-500 text-white'
                                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            title="Copy Website URL"
                          >
                            {copiedId === `web-${campaign.campaignId}` ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 mb-1 font-semibold">Calendly URL:</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-xs text-gray-700 truncate font-mono bg-white px-2 py-1 rounded border border-gray-200">
                            {`https://calendly.com/feedback-flashfire/30min?utm_source=${campaign.utmSource}&utm_medium=${campaign.utmMedium || 'direct'
                              }`}
                          </div>
                          <button
                            onClick={() =>
                              handleCopyUrl(
                                `https://calendly.com/feedback-flashfire/30min?utm_source=${campaign.utmSource}&utm_medium=${campaign.utmMedium || 'direct'
                                }`,
                                `cal-${campaign.campaignId}`,
                              )
                            }
                            className={`p-2 rounded transition-all ${copiedId === `cal-${campaign.campaignId}`
                                ? 'bg-green-500 text-white'
                                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            title="Copy Calendly URL"
                          >
                            {copiedId === `cal-${campaign.campaignId}` ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewStats(campaign)}
                          className="flex-1 py-2 px-4 rounded-lg font-semibold bg-gray-800 text-white hover:bg-gray-900 transition-all"
                        >
                          View Stats
                        </button>
                      </div>
                      <button
                        onClick={() => handleDeleteCampaign(campaign.campaignId)}
                        disabled={deletingId === campaign.campaignId}
                        className={`w-full py-2 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${confirmDeleteId === campaign.campaignId
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-red-500 text-white hover:bg-red-600'
                          } ${deletingId === campaign.campaignId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {deletingId === campaign.campaignId ? (
                          <>
                            <Loader className="animate-spin" size={16} />
                            Deleting...
                          </>
                        ) : (
                          <>
                            <Trash2 size={16} />
                            {confirmDeleteId === campaign.campaignId ? 'Click Again to Confirm' : 'Delete Campaign'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showStatsModal && selectedCampaign && (
        <CampaignStatsModal
          campaign={selectedCampaign}
          campaignDetails={selectedCampaignDetails}
          detailsLoading={detailsLoading}
          dateRange={{ fromDate, toDate }}
          onClose={() => {
            setShowStatsModal(false);
            setSelectedCampaign(null);
            fetchCampaigns();
          }}
          onDelete={() => {
            if (selectedCampaign) {
              campaignDetailsCache.delete(selectedCampaign.campaignId);
            }
            fetchCampaigns();
          }}
        />
      )}
    </div>
  );
}


