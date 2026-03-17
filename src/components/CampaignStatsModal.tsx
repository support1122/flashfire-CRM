import { useState, useMemo } from 'react';
import {
  X,
  TrendingUp,
  Users,
  MousePointerClick,
  Calendar,
  Mail,
  Phone,
  User,
  ExternalLink,
  Trash2,
} from 'lucide-react';

interface Campaign {
  campaignId: string;
  campaignName: string;
  utmSource: string;
  utmMedium: string;
  generatedUrl: string;
  totalClicks: number;
  uniqueVisitorsCount: number;
  totalBookings: number;
  isActive: boolean;
  createdAt: string;
}

interface Booking {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  calendlyMeetLink: string;
  scheduledEventStartTime: string;
  bookingCreatedAt: string;
  bookingStatus: string;
  anythingToKnow?: string;
}

interface CampaignDetails {
  campaign: Campaign & { pageVisits?: any[]; buttonClicks?: any[] };
  bookings: Booking[];
  stats: {
    totalClicks: number;
    totalButtonClicks?: number;
    uniqueVisitors: number;
    totalBookings: number;
    conversionRate: string;
  };
}

interface Props {
  campaign: Campaign;
  campaignDetails: CampaignDetails | null;
  detailsLoading: boolean;
  dateRange?: { fromDate: string; toDate: string };
  onClose: () => void;
  onDelete?: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

export default function CampaignStatsModal({
  campaign,
  campaignDetails,
  detailsLoading,
  dateRange,
  onClose,
  onDelete,
}: Props) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const details = useMemo(() => {
    if (!campaignDetails) return null;

    const { fromDate, toDate } = dateRange || {};
    const hasDateFilter = fromDate && toDate;

    if (!hasDateFilter) {
      return campaignDetails;
    }

    const startDate = new Date(fromDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(toDate);
    endDate.setHours(23, 59, 59, 999);

    const filteredBookings = campaignDetails.bookings.filter((b: Booking) => {
      if (b.clientName === 'Unknown Client' && b.clientEmail?.includes('calendly.placeholder')) return false;
      if (b.scheduledEventStartTime) {
        const d = new Date(b.scheduledEventStartTime);
        if (d.getFullYear() === 1970) return false;
      }
      const bookingDate = new Date(b.bookingCreatedAt);
      return bookingDate >= startDate && bookingDate <= endDate;
    });

    const pageVisits = campaignDetails.campaign.pageVisits || [];
    const buttonClicks = campaignDetails.campaign.buttonClicks || [];
    const filteredVisits = pageVisits.filter((v: any) => {
      const t = new Date(v.timestamp);
      return t >= startDate && t <= endDate;
    });
    const filteredClicks = buttonClicks.filter((c: any) => {
      const t = new Date(c.timestamp);
      return t >= startDate && t <= endDate;
    });
    const uniqueVisitors = new Set(filteredVisits.map((v: any) => v.visitorId)).size;

    return {
      campaign: campaignDetails.campaign,
      bookings: filteredBookings,
      stats: {
        totalClicks: filteredVisits.length,
        totalButtonClicks: filteredClicks.length,
        uniqueVisitors,
        totalBookings: filteredBookings.length,
        conversionRate:
          uniqueVisitors > 0 ? ((filteredBookings.length / uniqueVisitors) * 100).toFixed(2) : '0.00',
      },
    };
  }, [campaignDetails, dateRange?.fromDate, dateRange?.toDate]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      scheduled: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      canceled: 'bg-red-100 text-red-800',
      rescheduled: 'bg-yellow-100 text-yellow-800',
      'no-show': 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleDeleteCampaign = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch(`${API_BASE_URL}/api/campaigns/${campaign.campaignId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        alert('Campaign deleted successfully!');
        onDelete?.();
        onClose();
      } else {
        alert(data.message || 'Failed to delete campaign');
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Failed to delete campaign. Please try again.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 rounded-t-2xl z-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{campaign.campaignName}</h2>
                <p className="text-orange-100 text-sm mt-1">UTM Source: {campaign.utmSource}</p>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white/10 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {detailsLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto" />
              <p className="text-gray-600 mt-4">Loading campaign details...</p>
            </div>
          ) : details ? (
            <>
              <div className="p-6 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-sm font-medium">Page Views</span>
                      <MousePointerClick className="text-orange-500" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{details.stats.totalClicks}</div>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-sm font-medium">Button Clicks</span>
                      <MousePointerClick className="text-purple-500" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{details.stats.totalButtonClicks || 0}</div>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-sm font-medium">Unique Visitors</span>
                      <Users className="text-blue-500" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{details.stats.uniqueVisitors}</div>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-sm font-medium">Bookings</span>
                      <Calendar className="text-green-500" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{details.stats.totalBookings}</div>
                  </div>

                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-600 text-sm font-medium">Conversion Rate</span>
                      <TrendingUp className="text-purple-500" size={20} />
                    </div>
                    <div className="text-3xl font-bold text-gray-900">{details.stats.conversionRate}%</div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                  <Calendar className="mr-2 text-orange-500" size={24} />
                  Bookings ({details.bookings.length})
                  {dateRange?.fromDate && dateRange?.toDate && (
                    <span className="ml-3 text-sm font-normal text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                      Filtered: {new Date(dateRange.fromDate).toLocaleDateString()} -{' '}
                      {new Date(dateRange.toDate).toLocaleDateString()}
                    </span>
                  )}
                </h3>

                {details.bookings.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <Calendar className="mx-auto text-gray-300 mb-4" size={48} />
                    <p className="text-gray-500 font-medium">No bookings yet</p>
                    <p className="text-gray-400 text-sm mt-2">Share your campaign URL to start getting bookings</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {details.bookings
                      .filter((booking: Booking) => {
                        if (booking.clientName === 'Unknown Client' && booking.clientEmail?.includes('calendly.placeholder')) {
                          return false;
                        }
                        if (booking.scheduledEventStartTime) {
                          const date = new Date(booking.scheduledEventStartTime);
                          if (date.getFullYear() === 1970) return false;
                        }
                        return true;
                      })
                      .map((booking: Booking) => (
                        <div
                          key={booking.bookingId}
                          className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                                  <User className="mr-2 text-gray-400" size={18} />
                                  {booking.clientName}
                                </h4>
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(booking.bookingStatus)}`}>
                                  {booking.bookingStatus}
                                </span>
                              </div>
                              <div className="space-y-1 text-sm text-gray-600">
                                <div className="flex items-center">
                                  <Mail className="mr-2 text-gray-400" size={16} />
                                  <a href={`mailto:${booking.clientEmail}`} className="hover:text-orange-500 transition-colors">
                                    {booking.clientEmail}
                                  </a>
                                </div>
                                {booking.clientPhone && (
                                  <div className="flex items-center">
                                    <Phone className="mr-2 text-gray-400" size={16} />
                                    <a href={`tel:${booking.clientPhone}`} className="hover:text-orange-500 transition-colors">
                                      {booking.clientPhone}
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>

                            {booking.calendlyMeetLink && booking.calendlyMeetLink !== 'Not Provided' && (
                              <a
                                href={booking.calendlyMeetLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 text-sm font-semibold"
                              >
                                <ExternalLink size={16} />
                                Join Meeting
                              </a>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <div className="text-gray-500 text-xs font-medium mb-1">Meeting Scheduled</div>
                              <div className="text-gray-900 font-semibold">{formatDate(booking.scheduledEventStartTime)}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <div className="text-gray-500 text-xs font-medium mb-1">Booked On</div>
                              <div className="text-gray-900 font-semibold">{formatDate(booking.bookingCreatedAt)}</div>
                            </div>
                          </div>

                          {booking.anythingToKnow && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                              <div className="text-blue-700 text-xs font-medium mb-1">Additional Notes:</div>
                              <div className="text-blue-900 text-sm">{booking.anythingToKnow}</div>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center">
              <p className="text-red-600">Failed to load campaign details</p>
            </div>
          )}

          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-2xl">
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="flex-1 py-3 px-6 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-semibold"
                disabled={isDeleting}
              >
                Close
              </button>
              <button
                onClick={handleDeleteCampaign}
                disabled={isDeleting}
                className={`flex-1 py-3 px-6 rounded-lg transition-colors font-semibold flex items-center justify-center gap-2 ${showDeleteConfirm ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-500 text-white hover:bg-red-600'
                  } ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Trash2 size={18} />
                {isDeleting ? 'Deleting...' : showDeleteConfirm ? 'Confirm Delete?' : 'Delete Campaign'}
              </button>
            </div>
            {showDeleteConfirm && (
              <p className="text-center text-red-600 text-sm mt-2 font-medium">
                Click &quot;Confirm Delete?&quot; again to permanently delete this campaign
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


