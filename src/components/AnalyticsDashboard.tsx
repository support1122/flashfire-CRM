import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  RefreshCcw,
  Search,
  Users,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Edit,
  X,
  Info,
  AlertCircle,
} from 'lucide-react';
import NotesModal from './NotesModal';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  eachDayOfInterval,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import {
  getCachedBookings,
  setCachedBookings,
  clearAllCache,
} from '../utils/dataCache';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type BookingStatus = 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show';

interface Booking {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  calendlyMeetLink?: string;
  scheduledEventStartTime?: string;
  bookingCreatedAt: string;
  bookingStatus: BookingStatus;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  anythingToKnow?: string;
  meetingNotes?: string;
}

interface CampaignStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalClicks: number;
  totalUniqueVisitors: number;
  totalBookings: number;
  averageConversionRate: number;
}

type TrendRange = '7d' | '30d' | '90d';

const statusLabels: Record<BookingStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
  'no-show': 'No Show',
};

const statusColors: Record<BookingStatus, string> = {
  scheduled: 'text-blue-600 bg-blue-100',
  completed: 'text-green-600 bg-green-100',
  canceled: 'text-red-600 bg-red-100',
  rescheduled: 'text-amber-600 bg-amber-100',
  'no-show': 'text-rose-600 bg-rose-100',
};

interface AnalyticsDashboardProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
}

export default function AnalyticsDashboard({ onOpenEmailCampaign }: AnalyticsDashboardProps) {
  const [bookings, setBookings] = useState<Booking[]>(() => {
    const cached = getCachedBookings<Booking>();
    return cached || [];
  });
  const [usersWithoutBookings, setUsersWithoutBookings] = useState<string[]>([]);
  const [campaignStats, setCampaignStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<TrendRange>('30d');
  const [meetingTab, setMeetingTab] = useState<'overview' | 'meetings'>('overview');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [utmFilter, setUtmFilter] = useState<string>('all');
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedBookingForNotes, setSelectedBookingForNotes] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [dateMeetings, setDateMeetings] = useState<Booking[]>([]);
  const [dateBreakdown, setDateBreakdown] = useState<{ booked: number; cancelled: number; noShow: number; completed: number; rescheduled: number; total: number } | null>(null);
  const [loadingDateMeetings, setLoadingDateMeetings] = useState(false);

  const fetchBookings = useCallback(async (forceRefresh = false) => {
    try {
      setRefreshing(true);
      
      if (!forceRefresh) {
        const cached = getCachedBookings<Booking>();
        if (cached) {
          setBookings(cached);
          setRefreshing(false);
          setLoading(false);
          // Fetch fresh data in background
          setTimeout(() => {
            fetchBookings(true).catch(console.error);
          }, 100);
          return;
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings?limit=1000`);
      const data = await response.json();
      if (data.success) {
        setBookings(data.data);
        setCachedBookings(data.data);
      } else {
        throw new Error(data.message || 'Unable to fetch bookings');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check cache first
        const cachedBookings = getCachedBookings<Booking>();
        if (cachedBookings) {
          setBookings(cachedBookings);
          setLoading(false);
          // Fetch fresh data in background
          setTimeout(() => {
            fetchBookings(true).catch(console.error);
          }, 100);
        } else {
          await fetchBookings(true);
        }

        // Always fetch users and stats (they're smaller)
        await Promise.all([
          (async () => {
            const res = await fetch(`${API_BASE_URL}/api/users/without-bookings`);
            const json = await res.json();
            if (json.success) {
              setUsersWithoutBookings(json.data);
            }
          })(),
          (async () => {
            const res = await fetch(`${API_BASE_URL}/api/campaigns/stats`);
            const json = await res.json();
            if (json.success) {
              setCampaignStats(json.data);
            }
          })(),
        ]);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [fetchBookings]);

  const derived = useMemo(() => {
    if (bookings.length === 0) {
      return {
        meetingsToday: 0,
        meetingsTodayBooked: 0,
        meetingsTodayCancelled: 0,
        meetingsTodayNoShow: 0,
        bookingsCreatedToday: 0,
        meetingsThisWeek: 0,
        upcomingMeetings: 0,
        completedMeetings: 0,
        noShowCount: 0,
        rescheduledCount: 0,
        conversionRate: 0,
        bookingsByStatus: new Map<BookingStatus, number>(),
        topSources: [] as Array<{ source: string; total: number; completed: number }>,
        bookingsTrend: [] as Array<{ date: string; booked: number; completed: number; noShow: number }>,
        averageDailyBookings: 0,
        lastPeriodDelta: {
          daily: 0,
          completion: 0,
        },
      };
    }

    const now = new Date();
    const startOfWeek = subDays(startOfDay(now), 6);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    
    // Meetings scheduled for today (based on scheduledEventStartTime)
    const meetingsTodayList = bookings.filter((booking) => {
      if (!booking.scheduledEventStartTime) return false;
      const eventDate = parseISO(booking.scheduledEventStartTime);
      return eventDate >= todayStart && eventDate <= todayEnd;
    });
    
    const meetingsToday = meetingsTodayList.length;
    const meetingsTodayBooked = meetingsTodayList.filter(b => b.bookingStatus === 'scheduled' || !b.bookingStatus).length;
    const meetingsTodayCancelled = meetingsTodayList.filter(b => b.bookingStatus === 'canceled').length;
    const meetingsTodayNoShow = meetingsTodayList.filter(b => b.bookingStatus === 'no-show').length;
    
    // Bookings created today (for backward compatibility)
    const bookingsCreatedToday = bookings.filter((booking) =>
      isSameDay(parseISO(booking.bookingCreatedAt), now),
    ).length;
    const meetingsThisWeek = bookings.filter((booking) => {
      const created = parseISO(booking.bookingCreatedAt);
      return created >= startOfWeek && created <= now;
    }).length;
    const upcomingMeetings = bookings.filter((booking) => {
      if (!booking.scheduledEventStartTime) return false;
      const eventDate = parseISO(booking.scheduledEventStartTime);
      return eventDate > now;
    }).length;
    const completedMeetings = bookings.filter((booking) => booking.bookingStatus === 'completed').length;
    const noShowCount = bookings.filter((booking) => booking.bookingStatus === 'no-show').length;
    const rescheduledCount = bookings.filter((booking) => booking.bookingStatus === 'rescheduled').length;
    const bookingsByStatus = bookings.reduce((acc, booking) => {
      acc.set(booking.bookingStatus, (acc.get(booking.bookingStatus) || 0) + 1);
      return acc;
    }, new Map<BookingStatus, number>());

    const topSourcesMap = new Map<string, { total: number; completed: number }>();
    bookings.forEach((booking) => {
      const source = booking.utmSource || 'direct';
      const existing = topSourcesMap.get(source) || { total: 0, completed: 0 };
      existing.total += 1;
      if (booking.bookingStatus === 'completed') {
        existing.completed += 1;
      }
      topSourcesMap.set(source, existing);
    });

    const topSources = Array.from(topSourcesMap.entries())
      .map(([source, stats]) => ({ source, ...stats }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const trendDays = trendRange === '7d' ? 7 : trendRange === '30d' ? 30 : 90;
    const trendStart = subDays(startOfDay(now), trendDays - 1);
    const dayBuckets = eachDayOfInterval({ start: trendStart, end: now }).map((date) => ({
      date,
      booked: 0,
      completed: 0,
      noShow: 0,
    }));

    const dayIndex = new Map<string, number>();
    dayBuckets.forEach((bucket, index) => {
      dayIndex.set(format(bucket.date, 'yyyy-MM-dd'), index);
    });

    bookings.forEach((booking) => {
      const bookingDate = parseISO(booking.bookingCreatedAt);
      if (bookingDate < trendStart || bookingDate > now) return;
      const key = format(bookingDate, 'yyyy-MM-dd');
      const idx = dayIndex.get(key);
      if (idx === undefined) return;
      dayBuckets[idx].booked += 1;
      if (booking.bookingStatus === 'completed') {
        dayBuckets[idx].completed += 1;
      }
      if (booking.bookingStatus === 'no-show') {
        dayBuckets[idx].noShow += 1;
      }
    });

    const bookingsTrend = dayBuckets.map((bucket) => ({
      date: format(bucket.date, 'MMM d'),
      booked: bucket.booked,
      completed: bucket.completed,
      noShow: bucket.noShow,
    }));

    const totalDays = Math.max(trendDays, 1);
    const averageDailyBookings =
      dayBuckets.reduce((sum, bucket) => sum + bucket.booked, 0) / totalDays;

    const conversionRate =
      bookings.length > 0 ? Math.round((completedMeetings / bookings.length) * 100) : 0;

    const previousPeriodStart = subDays(trendStart, trendDays);
    const previousPeriodEnd = subDays(trendStart, 1);
    const previousPeriodBookings = bookings.filter((booking) => {
      const created = parseISO(booking.bookingCreatedAt);
      return created >= previousPeriodStart && created <= previousPeriodEnd;
    }).length;
    const previousDailyAverage = previousPeriodBookings / trendDays || 0;
    const lastPeriodDelta = {
      daily: averageDailyBookings && previousDailyAverage
        ? ((averageDailyBookings - previousDailyAverage) / previousDailyAverage) * 100
        : averageDailyBookings > 0
          ? 100
          : 0,
      completion: 0,
    };

    const previousCompleted = bookings.filter((booking) => {
      const created = parseISO(booking.bookingCreatedAt);
      return (
        created >= previousPeriodStart &&
        created <= previousPeriodEnd &&
        booking.bookingStatus === 'completed'
      );
    }).length;
    const previousConversion =
      previousPeriodBookings > 0 ? (previousCompleted / previousPeriodBookings) * 100 : 0;
    lastPeriodDelta.completion =
      previousConversion > 0
        ? ((conversionRate - previousConversion) / previousConversion) * 100
        : conversionRate > 0
          ? 100
          : 0;

    return {
      meetingsToday,
      meetingsTodayBooked,
      meetingsTodayCancelled,
      meetingsTodayNoShow,
      bookingsCreatedToday,
      meetingsThisWeek,
      upcomingMeetings,
      completedMeetings,
      noShowCount,
      rescheduledCount,
      conversionRate,
      bookingsByStatus,
      topSources,
      bookingsTrend,
      averageDailyBookings,
      lastPeriodDelta,
    };
  }, [bookings, trendRange]);

  const statusDistributionData = useMemo(() => {
    if (bookings.length === 0) return [];
    return (['scheduled', 'completed', 'rescheduled', 'no-show', 'canceled'] as BookingStatus[]).map(
      (status) => ({
        status: statusLabels[status],
        count: bookings.filter((booking) => booking.bookingStatus === status).length,
      }),
    );
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings
      .filter((booking) => {
        if (statusFilter !== 'all' && booking.bookingStatus !== statusFilter) {
          return false;
        }
        if (utmFilter !== 'all' && (booking.utmSource || 'direct') !== utmFilter) {
          return false;
        }
        if (fromDate) {
          const from = startOfDay(parseISO(fromDate));
          if (isBefore(parseISO(booking.bookingCreatedAt), from)) {
            return false;
          }
        }
        if (toDate) {
          const to = endOfDay(parseISO(toDate));
          if (isAfter(parseISO(booking.bookingCreatedAt), to)) {
            return false;
          }
        }
        if (search) {
          const term = search.toLowerCase();
          return (
            booking.clientName?.toLowerCase().includes(term) ||
            booking.clientEmail?.toLowerCase().includes(term) ||
            booking.utmSource?.toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.scheduledEventStartTime ? parseISO(a.scheduledEventStartTime) : parseISO(a.bookingCreatedAt);
        const bDate = b.scheduledEventStartTime ? parseISO(b.scheduledEventStartTime) : parseISO(b.bookingCreatedAt);
        return bDate.getTime() - aDate.getTime();
      });
  }, [bookings, statusFilter, utmFilter, fromDate, toDate, search]);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    bookings.forEach((booking) => sources.add(booking.utmSource || 'direct'));
    return Array.from(sources).sort();
  }, [bookings]);

  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus) => {
    try {
      setUpdatingBookingId(bookingId);
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update booking status');
      }
      setBookings((prev) => {
        const updated = prev.map((booking) => (booking.bookingId === bookingId ? { ...booking, bookingStatus: status } : booking));
        setCachedBookings(updated);
        return updated;
      });
      
      // Show toast notification if workflow was triggered
      if (data.workflowTriggered) {
        showToast(`Workflow triggered for ${status} action`, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to update booking status', 'error');
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const handleSaveNotes = async (notes: string) => {
    if (!selectedBookingForNotes) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${selectedBookingForNotes.id}/notes`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save notes');
      }

      setBookings((prev) => {
        const updated = prev.map((booking) =>
          booking.bookingId === selectedBookingForNotes.id
            ? { ...booking, meetingNotes: notes }
            : booking
        );
        setCachedBookings(updated);
        return updated;
      });

      alert('Notes saved successfully');
      setIsNotesModalOpen(false);
      setSelectedBookingForNotes(null);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save notes');
      throw err;
    }
  };

  const handleReachOut = useCallback(
    (email: string) => {
      if (!email) return;
      onOpenEmailCampaign({
        recipients: [email],
        reason: 'users_without_meetings',
      });
    },
    [onOpenEmailCampaign],
  );

  const fetchMeetingsByDate = useCallback(async (date: string) => {
    if (!date) return;
    try {
      setLoadingDateMeetings(true);
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/by-date?date=${date}`);
      const data = await response.json();
      if (data.success) {
        setDateMeetings(data.data || []);
        setDateBreakdown(data.breakdown || null);
        setIsDateModalOpen(true);
      } else {
        throw new Error(data.message || 'Unable to fetch meetings');
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to load meetings', 'error');
    } finally {
      setLoadingDateMeetings(false);
    }
  }, []);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    fetchMeetingsByDate(date);
  };

  const handleReschedule = async (booking: Booking) => {
    const defaultValue = booking.scheduledEventStartTime
      ? format(parseISO(booking.scheduledEventStartTime), "yyyy-MM-dd'T'HH:mm")
      : '';
    const userInput = window.prompt(
      'Enter the new meeting time (YYYY-MM-DD HH:mm). Time is interpreted in your local timezone.',
      defaultValue,
    );
    if (!userInput) {
      return;
    }

    let parsedDate: Date | null = null;
    const normalizedInput = userInput.includes('T') ? userInput : userInput.replace(' ', 'T');
    const potentialDate = new Date(normalizedInput);
    if (!Number.isNaN(potentialDate.getTime())) {
      parsedDate = potentialDate;
    }

    if (!parsedDate) {
      alert('Invalid date/time provided. Please try again using the format YYYY-MM-DD HH:mm');
      return;
    }

    const isoString = parsedDate.toISOString();

    try {
      setUpdatingBookingId(booking.bookingId);
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${booking.bookingId}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newTime: isoString }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to reschedule meeting');
      }
      const updatedBooking: Booking = data.data;
      setBookings((prev) => {
        const updated = prev.map((item) => (item.bookingId === updatedBooking.bookingId ? { ...item, ...updatedBooking } : item));
        setCachedBookings(updated);
        return updated;
      });
      alert('Meeting rescheduled and call queue updated successfully.');
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to reschedule meeting');
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const renderDelta = (value: number) => {
    if (!Number.isFinite(value) || value === 0) {
      return <span className="text-slate-400 text-xs">No change</span>;
    }
    const isPositive = value > 0;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-rose-600'}`}>
        {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-orange-500" size={40} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="text-red-500" size={48} />
        <p className="text-lg font-semibold text-red-600">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            setTimeout(() => {
              fetchBookings();
            }, 150);
          }}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  const overviewCards = [
    {
      title: 'Meetings Today',
      value: derived.meetingsToday,
      icon: Calendar,
      subtitle: 'Scheduled for today',
      breakdown: {
        booked: derived.meetingsTodayBooked,
        cancelled: derived.meetingsTodayCancelled,
        noShow: derived.meetingsTodayNoShow,
      },
    },
    {
      title: 'Upcoming Meetings',
      value: derived.upcomingMeetings,
      icon: Clock,
      subtitle: 'Scheduled for future dates',
    },
    {
      title: 'Completed',
      value: derived.completedMeetings,
      icon: CheckCircle2,
      subtitle: 'All-time completed sessions',
    },
    {
      title: 'No Shows',
      value: derived.noShowCount,
      icon: AlertTriangle,
      subtitle: 'Marked as no-show',
    },
  ];

  return (
    <>
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white min-w-[300px] animate-in slide-in-from-right ${
              toast.type === 'success'
                ? 'bg-green-500'
                : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            <span className="flex-1 font-medium">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="hover:opacity-80"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 space-y-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-2">Analytics Overview</h3>
          <h2 className="text-3xl font-bold text-slate-900">Growth & Meeting Performance</h2>
          <p className="text-slate-500 mt-2 max-w-2xl">
            Track bookings, engagement, and meeting outcomes for Flashfire&apos;s campaigns. Use filters to dig into the
            data and take action directly from the dashboard.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-600">
            <Users size={16} />
            {campaignStats ? `${campaignStats.totalCampaigns} campaigns` : 'Campaign data loading…'}
          </div>
          <button
            onClick={() => {
              clearAllCache();
              fetchBookings(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-sm font-semibold"
          >
            <RefreshCcw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {overviewCards.map((card) => {
          const isMeetingsToday = card.title === 'Meetings Today';
          return (
            <div
              key={card.title}
              onClick={isMeetingsToday ? () => {
                const today = format(new Date(), 'yyyy-MM-dd');
                setSelectedDate(today);
                handleDateSelect(today);
              } : undefined}
              className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-6 ${isMeetingsToday ? 'cursor-pointer hover:border-orange-300 hover:shadow-md transition' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{card.title}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{card.value}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  <card.icon size={22} />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4">{card.subtitle}</p>
              {card.breakdown && (
                <div className="mt-4 space-y-2 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Booked:</span>
                    <span className="font-semibold text-blue-600">{card.breakdown.booked}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">Cancelled:</span>
                    <span className="font-semibold text-red-600">{card.breakdown.cancelled}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">No-Show:</span>
                    <span className="font-semibold text-rose-600">{card.breakdown.noShow}</span>
                  </div>
                  {isMeetingsToday && (
                    <p className="text-xs text-orange-600 font-semibold mt-2 pt-2 border-t border-slate-100">
                      Click to view details →
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Date Picker Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">View Meetings by Date</h3>
            <p className="text-sm text-slate-500 mt-1">Select a date to see all meetings scheduled for that day</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const date = e.target.value;
                setSelectedDate(date);
                if (date) {
                  handleDateSelect(date);
                }
              }}
              className="border border-slate-200 rounded-lg px-4 py-2 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {selectedDate && (
              <button
                onClick={() => {
                  setSelectedDate('');
                  setIsDateModalOpen(false);
                  setDateMeetings([]);
                  setDateBreakdown(null);
                }}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Bookings Trend</h3>
              <p className="text-sm text-slate-500">
                Average of {derived.averageDailyBookings.toFixed(1)} bookings per day
                <span className="ml-2">{renderDelta(derived.lastPeriodDelta.daily)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
              {(['7d', '30d', '90d'] as TrendRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTrendRange(range)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    trendRange === range ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  type="button"
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={derived.bookingsTrend}>
                <defs>
                  <linearGradient id="colorBooked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="booked" stroke="#f97316" fillOpacity={1} fill="url(#colorBooked)" />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stroke="#22c55e"
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Status Distribution</h3>
            <p className="text-sm text-slate-500">Track meeting outcomes at a glance.</p>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDistributionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="status" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
              Completion Rate
            </p>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-slate-900">{derived.conversionRate}%</p>
              {renderDelta(derived.lastPeriodDelta.completion)}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Completed meetings divided by total bookings during the selected range.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Top Performing Sources</h3>
              <p className="text-sm text-slate-500">UTM sources driving the highest number of bookings</p>
            </div>
          </div>
          <div className="space-y-4">
            {derived.topSources.map((source) => (
              <div key={source.source} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900 uppercase tracking-wide text-xs">
                    {source.source}
                  </p>
                  <p className="text-xs text-slate-500">
                    {source.completed} completed • {(source.completed / Math.max(source.total, 1) * 100).toFixed(0)}%
                    success
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">{source.total}</p>
                    <p className="text-xs text-slate-500">bookings</p>
                  </div>
                </div>
              </div>
            ))}
            {derived.topSources.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-6 border border-dashed border-slate-200 rounded-xl">
                Not enough data yet. Start tracking campaigns to see top sources.
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Users Without Meetings</h3>
              <p className="text-sm text-slate-500">High intent users that need follow-up</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500">
              <Mail size={14} />
              {usersWithoutBookings.length}
            </span>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 max-h-72 overflow-y-auto space-y-2">
            {usersWithoutBookings.slice(0, 25).map((email) => (
              <div
                key={email}
                className="text-sm text-slate-700 bg-white rounded-lg px-3 py-2 border border-slate-200 flex items-center justify-between gap-3"
              >
                <span className="truncate">{email}</span>
                <button
                  type="button"
                  onClick={() => handleReachOut(email)}
                  className="text-xs text-orange-600 font-semibold hover:text-orange-700"
                >
                  Reach out
                </button>
              </div>
            ))}
            {usersWithoutBookings.length > 25 && (
              <p className="text-xs text-slate-500 mt-3">
                +{usersWithoutBookings.length - 25} more users need outreach.
              </p>
            )}
            {usersWithoutBookings.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-8">
                Great! Everyone who signed up has booked at least one session.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Meeting Intelligence</h3>
            <p className="text-sm text-slate-500">
              Deep dive into individual meetings, outcomes, and follow-up actions.
            </p>
          </div>
          <div className="bg-slate-100 rounded-lg p-1 flex items-center gap-1 text-sm font-semibold">
            <button
              onClick={() => setMeetingTab('overview')}
              className={`px-3 py-1.5 rounded-md transition ${
                meetingTab === 'overview' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
              type="button"
            >
              Summary
            </button>
            <button
              onClick={() => setMeetingTab('meetings')}
              className={`px-3 py-1.5 rounded-md transition ${
                meetingTab === 'meetings' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
              type="button"
            >
              Detailed Meetings
            </button>
          </div>
        </div>

        {meetingTab === 'overview' ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-6 py-6">
            {(['scheduled', 'completed', 'rescheduled', 'no-show'] as BookingStatus[]).map((status) => {
              const count = derived.bookingsByStatus.get(status) || 0;
              const total = bookings.length || 1;
              return (
                <div key={status} className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    {statusLabels[status]}
                  </p>
                  <p className="text-3xl font-bold text-slate-900">{count}</p>
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-orange-500"
                          style={{ width: `${(count / total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{((count / total) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-6 space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or source…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="text-sm bg-transparent focus:outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as BookingStatus | 'all')}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
              >
                <option value="all">All statuses</option>
                {(['scheduled', 'completed', 'rescheduled', 'no-show', 'canceled'] as BookingStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <select
                value={utmFilter}
                onChange={(e) => setUtmFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white min-w-[160px]"
              >
                <option value="all">All sources</option>
                {uniqueSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
                <span>—</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 bg-white"
                />
              </div>
              {(fromDate || toDate || search || statusFilter !== 'all' || utmFilter !== 'all') && (
                <button
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setStatusFilter('all');
                    setUtmFilter('all');
                    setSearch('');
                  }}
                  className="text-sm text-orange-600 font-semibold"
                >
                  Clear filters
                </button>
              )}
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500">
                    <th className="px-4 py-3 font-semibold">Client</th>
                    <th className="px-4 py-3 font-semibold">Booking Created</th>
                    <th className="px-4 py-3 font-semibold">Meeting Time</th>
                    <th className="px-4 py-3 font-semibold">Source</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.map((booking) => {
                    const scheduledDate = booking.scheduledEventStartTime
                      ? format(parseISO(booking.scheduledEventStartTime), 'MMM d, yyyy • h:mm a')
                      : 'Not scheduled';
                    const createdDate = format(parseISO(booking.bookingCreatedAt), 'MMM d, yyyy • h:mm a');
                    const meetLink =
                      booking.calendlyMeetLink && booking.calendlyMeetLink !== 'Not Provided'
                        ? booking.calendlyMeetLink
                        : null;

                    return (
                      <tr key={booking.bookingId} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{booking.clientName || 'Unknown'}</div>
                          <div className="text-xs text-slate-500">{booking.clientEmail || 'No email'}</div>
                          {booking.clientPhone && (
                            <a
                              href={`tel:${booking.clientPhone}`}
                              className="text-xs text-orange-600 font-semibold"
                            >
                              {booking.clientPhone}
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-4 text-slate-600">{createdDate}</td>
                        <td className="px-4 py-4 text-slate-600">{scheduledDate}</td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {booking.utmSource || 'direct'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[booking.bookingStatus]}`}>
                            {statusLabels[booking.bookingStatus]}
                          </span>
                        </td>
                        <td className="px-4 py-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {meetLink && (
                              <a
                                href={meetLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition"
                              >
                                <ExternalLink size={14} />
                                Join
                              </a>
                            )}
                            <button
                              onClick={() => handleStatusUpdate(booking.bookingId, 'completed')}
                              disabled={updatingBookingId === booking.bookingId}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-60"
                            >
                              {updatingBookingId === booking.bookingId ? (
                                <Loader2 className="animate-spin" size={14} />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              Completed
                            </button>
                            {booking.bookingStatus === 'no-show' ? (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(booking.bookingId, 'scheduled')}
                                  disabled={updatingBookingId === booking.bookingId}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-60"
                                >
                                  {updatingBookingId === booking.bookingId ? (
                                    <Loader2 className="animate-spin" size={14} />
                                  ) : (
                                    <CheckCircle2 size={14} />
                                  )}
                                  Unmark
                                </button>
                                <button
                                  onClick={() => {
                                    if (booking.clientEmail) {
                                      onOpenEmailCampaign({
                                        recipients: [booking.clientEmail],
                                        reason: 'no_show_followup',
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-300 text-blue-600 hover:bg-blue-50 transition"
                                >
                                  <Mail size={14} />
                                  Send Mail
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleStatusUpdate(booking.bookingId, 'no-show')}
                                disabled={updatingBookingId === booking.bookingId}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 transition disabled:opacity-60"
                              >
                                {updatingBookingId === booking.bookingId ? (
                                  <Loader2 className="animate-spin" size={14} />
                                ) : (
                                  <AlertTriangle size={14} />
                                )}
                                Mark No-Show
                              </button>
                            )}
                            <button
                              onClick={() => handleReschedule(booking)}
                              disabled={updatingBookingId === booking.bookingId}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-600 hover:bg-amber-50 transition disabled:opacity-60"
                            >
                              {updatingBookingId === booking.bookingId ? (
                                <Loader2 className="animate-spin" size={14} />
                              ) : (
                                <Clock size={14} />
                              )}
                              Reschedule
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBookingForNotes({
                                  id: booking.bookingId,
                                  name: booking.clientName,
                                  notes: booking.meetingNotes || '',
                                });
                                setIsNotesModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 transition"
                            >
                              <Edit size={14} />
                              {booking.meetingNotes ? 'Edit Notes' : 'Take Notes'}
                            </button>
                          </div>
                          {booking.anythingToKnow && (
                            <div className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
                              <span className="font-semibold text-slate-600">Notes:</span> {booking.anythingToKnow}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredBookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-sm text-slate-500">
                        No meetings match your filters. Try adjusting the criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Showing {filteredBookings.length} of {bookings.length} total meetings. Data automatically includes the last
              1000 bookings. Use the refresh button above to sync with the backend.
            </p>
          </div>
        )}
      </div>

      {isNotesModalOpen && selectedBookingForNotes && (
        <NotesModal
          isOpen={isNotesModalOpen}
          onClose={() => {
            setIsNotesModalOpen(false);
            setSelectedBookingForNotes(null);
          }}
          onSave={handleSaveNotes}
          initialNotes={selectedBookingForNotes.notes}
          clientName={selectedBookingForNotes.name}
        />
      )}

      {/* Date Meetings Modal */}
      {isDateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">
                  Meetings on {selectedDate ? format(new Date(selectedDate + 'T00:00:00'), 'MMMM d, yyyy') : 'Selected Date'}
                </h3>
                {dateBreakdown && (
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-blue-600">{dateBreakdown.booked}</span> Booked
                    </span>
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-red-600">{dateBreakdown.cancelled}</span> Cancelled
                    </span>
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-rose-600">{dateBreakdown.noShow}</span> No-Show
                    </span>
                    <span className="text-sm text-slate-600">
                      <span className="font-semibold text-green-600">{dateBreakdown.completed}</span> Completed
                    </span>
                    <span className="text-sm text-slate-500">
                      Total: <span className="font-semibold">{dateBreakdown.total}</span>
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setIsDateModalOpen(false);
                  setDateMeetings([]);
                  setDateBreakdown(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <X size={24} className="text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingDateMeetings ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
              ) : dateMeetings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-lg font-semibold text-slate-600">No meetings scheduled for this date</p>
                  <p className="text-sm text-slate-500 mt-2">Try selecting a different date</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dateMeetings.map((booking) => {
                    const meetingTime = booking.scheduledEventStartTime
                      ? format(parseISO(booking.scheduledEventStartTime), 'h:mm a')
                      : 'Not scheduled';
                    return (
                      <div
                        key={booking.bookingId}
                        className="border border-slate-200 rounded-xl p-4 hover:border-orange-300 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-semibold text-slate-900">{booking.clientName || 'Unknown'}</h4>
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[booking.bookingStatus]}`}>
                                {statusLabels[booking.bookingStatus]}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2 text-slate-600">
                                <Mail size={14} className="text-slate-400" />
                                <span>{booking.clientEmail || 'No email'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <Clock size={14} className="text-slate-400" />
                                <span>Meeting Time: {meetingTime}</span>
                              </div>
                              {booking.clientPhone && (
                                <div className="flex items-center gap-2 text-slate-600">
                                  <span className="text-slate-400">📞</span>
                                  <a href={`tel:${booking.clientPhone}`} className="text-orange-600 hover:text-orange-700 font-semibold">
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
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 transition"
                            >
                              <ExternalLink size={16} />
                              Join Meeting
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}


