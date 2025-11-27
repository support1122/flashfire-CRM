import { useEffect, useMemo, useState, useCallback } from 'react';
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
  ExternalLink,
  CheckSquare,
  Square,
  Send,
  X,
  Info,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Edit,
  Plus,
} from 'lucide-react';
import {
  format,
  parseISO,
  isBefore,
  isAfter,
  isSameDay,
  startOfDay,
  endOfDay,
} from 'date-fns';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import {
  getCachedBookings,
  setCachedBookings,
  getCachedUsers,
  setCachedUsers,
  clearAllCache,
} from '../utils/dataCache';

import NotesModal from './NotesModal';
import InsertDataModal, { type InsertDataFormData } from './InsertDataModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type BookingStatus = 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show';
type DataType = 'booking' | 'user';

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
  reminderCallJobId?: string;
  paymentReminders?: Array<{
    jobId: string;
    paymentLink: string;
    reminderDays: number;
    scheduledTime: string;
    status: string;
    sentAt?: string;
    createdAt: string;
  }>;
  rescheduledCount?: number;
  whatsappReminderSent?: boolean;
}

interface UserWithoutBooking {
  email: string;
  fullName: string;
  phone: string;
  countryCode: string;
  createdAt: string;
  workAuthorization: string;
}

interface UnifiedRow {
  id: string;
  type: DataType;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
  scheduledTime?: string;
  source?: string;
  status?: BookingStatus;
  meetLink?: string;
  notes?: string;
  meetingNotes?: string;
  bookingId?: string;
  workAuthorization?: string;
}

interface UnifiedDataViewProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
}

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

interface UserCampaign {
  _id: string;
  templateName: string;
  provider: string;
  status: string;
  sentAt: string;
  createdAt: string;
}

interface CampaignDetails {
  campaign: {
    _id: string;
    templateName: string;
    domainName: string;
    templateId: string;
    provider: string;
    status: string;
    total: number;
    success: number;
    failed: number;
    createdAt: string;
  };
  userEmailDetails: {
    email: string;
    status: string;
    sentAt: string;
    error: string | null;
  };
  timeWindow: {
    start: string;
    end: string;
    hasNextEmail: boolean;
    nextEmailDate: string | null;
  };
  bookingsAfterEmail: Array<{
    bookingId: string;
    clientName: string;
    clientEmail: string;
    scheduledEventStartTime: string;
    bookingCreatedAt: string;
    bookingStatus: string;
    calendlyMeetLink: string;
  }>;
  bookingCount: number;
  bookedAfterEmail: boolean;
}

export default function UnifiedDataView({ onOpenEmailCampaign }: UnifiedDataViewProps) {
  const [bookings, setBookings] = useState<Booking[]>(() => {
    // Initialize from cache if available
    const cached = getCachedBookings<Booking>();
    return cached || [];
  });
  const [usersWithoutBookings, setUsersWithoutBookings] = useState<UserWithoutBooking[]>(() => {
    // Initialize from cache if available
    const cached = getCachedUsers<UserWithoutBooking>();
    return cached || [];
  });
  const [userCampaigns, setUserCampaigns] = useState<Map<string, UserCampaign[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'booking' | 'user'>('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [utmFilter, setUtmFilter] = useState<string>('all');
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<{ campaignId: string; userEmail: string } | null>(null);
  const [campaignDetails, setCampaignDetails] = useState<CampaignDetails | null>(null);
  const [loadingCampaignDetails, setLoadingCampaignDetails] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [userCampaignsList, setUserCampaignsList] = useState<UserCampaign[]>([]);
  const [loadingUserCampaigns, setLoadingUserCampaigns] = useState(false);
  const [loadingCampaignsForEmails, setLoadingCampaignsForEmails] = useState<Set<string>>(new Set());
  const [isUsersWithoutMeetingsExpanded, setIsUsersWithoutMeetingsExpanded] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedBookingForNotes, setSelectedBookingForNotes] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);

  // Indexes for fast lookups
  const bookingsById = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((booking) => {
      map.set(booking.bookingId, booking);
    });
    return map;
  }, [bookings]);

  const usersByEmail = useMemo(() => {
    const map = new Map<string, UserWithoutBooking>();
    usersWithoutBookings.forEach((user) => {
      map.set(user.email.toLowerCase(), user);
    });
    return map;
  }, [usersWithoutBookings]);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setRefreshing(true);
      setError(null);

      if (!forceRefresh) {
        const cachedBookings = getCachedBookings<Booking>();
        const cachedUsers = getCachedUsers<UserWithoutBooking>();

        if (cachedBookings && cachedUsers) {
          setBookings(cachedBookings);
          setUsersWithoutBookings(cachedUsers);
          setLoading(false);
          setRefreshing(false);
          setTimeout(() => {
            fetchData(true).catch(console.error);
          }, 100);
          return;
        }
      }

      // Fetch ALL data at once without pagination
      const [bookingsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/campaign-bookings`),
        fetch(`${API_BASE_URL}/api/users/without-bookings/detailed`),
      ]);

      const bookingsData = await bookingsRes.json();
      const usersData = await usersRes.json();

      if (bookingsData.success) {
        setBookings(bookingsData.data);
        setCachedBookings(bookingsData.data);
      } else {
        throw new Error(bookingsData.message || 'Failed to fetch bookings');
      }

      if (usersData.success) {
        setUsersWithoutBookings(usersData.data);
        setCachedUsers(usersData.data);
      } else {
        console.warn('Failed to fetch users:', usersData.message);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const fetchUserCampaigns = useCallback(async (emails: string[]) => {
    try {
      setLoadingUserCampaigns(true);
      const loadingSet = new Set<string>(emails.map(e => e.toLowerCase()));
      setLoadingCampaignsForEmails(loadingSet);

      const campaignsMap = new Map<string, UserCampaign[]>();

      await Promise.all(
        emails.map(async (email) => {
          try {
            const response = await fetch(`${API_BASE_URL}/api/email-campaigns/user/${encodeURIComponent(email)}`);
            const data = await response.json();
            if (data.success && data.data) {
              campaignsMap.set(email.toLowerCase(), data.data);
            }
          } catch (err) {
            console.error(`Failed to fetch campaigns for ${email}:`, err);
          }
        })
      );

      setUserCampaigns(campaignsMap);
    } catch (err) {
      console.error('Error fetching user campaigns:', err);
    } finally {
      setLoadingUserCampaigns(false);
      setLoadingCampaignsForEmails(new Set());
    }
  }, []);

  useEffect(() => {
    const cachedBookings = getCachedBookings<Booking>();
    const cachedUsers = getCachedUsers<UserWithoutBooking>();

    if (cachedBookings && cachedUsers) {
      setBookings(cachedBookings);
      setUsersWithoutBookings(cachedUsers);
      setLoading(false);
      const allEmails = new Set<string>();
      cachedUsers.forEach(u => {
        if (u.email) allEmails.add(u.email.toLowerCase());
      });
      cachedBookings.forEach(b => {
        if (b.clientEmail) allEmails.add(b.clientEmail.toLowerCase());
      });
      const emailArray = Array.from(allEmails);
      if (emailArray.length > 0) {
        fetchUserCampaigns(emailArray);
      }
      setTimeout(() => {
        fetchData(true).catch(console.error);
      }, 100);
    } else {
      fetchData(false).catch(console.error);
    }
  }, [fetchData, fetchUserCampaigns]);

  useEffect(() => {
    const allEmails = new Set<string>();

    usersWithoutBookings.forEach(u => {
      if (u.email) allEmails.add(u.email.toLowerCase());
    });

    bookings.forEach(b => {
      if (b.clientEmail) allEmails.add(b.clientEmail.toLowerCase());
    });

    const emailArray = Array.from(allEmails);
    if (emailArray.length > 0) {
      fetchUserCampaigns(emailArray);
    }
  }, [usersWithoutBookings, bookings, fetchUserCampaigns]);

  const unifiedData = useMemo<UnifiedRow[]>(() => {
    const rows: UnifiedRow[] = [];

    bookings.forEach((booking) => {
      rows.push({
        id: `booking-${booking.bookingId}`,
        type: 'booking',
        name: booking.clientName || 'Unknown',
        email: booking.clientEmail,
        phone: booking.clientPhone,
        createdAt: booking.bookingCreatedAt,
        scheduledTime: booking.scheduledEventStartTime,
        source: booking.utmSource || 'direct',
        status: booking.bookingStatus,
        meetLink: booking.calendlyMeetLink && booking.calendlyMeetLink !== 'Not Provided' ? booking.calendlyMeetLink : undefined,
        notes: booking.anythingToKnow,
        meetingNotes: booking.meetingNotes,
        bookingId: booking.bookingId,
      });
    });

    usersWithoutBookings.forEach((user) => {
      rows.push({
        id: `user-${user.email}`,
        type: 'user',
        name: user.fullName || 'Not Provided',
        email: user.email,
        phone: user.phone !== 'Not Specified' ? user.phone : undefined,
        createdAt: user.createdAt,
        workAuthorization: user.workAuthorization,
      });
    });

    return rows;
  }, [bookings, usersWithoutBookings]);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    bookings.forEach((booking) => sources.add(booking.utmSource || 'direct'));
    return Array.from(sources).sort();
  }, [bookings]);

  const meetingsBookedToday = useMemo(() => {
    const today = startOfDay(new Date());
    return bookings.filter((booking) => {
      if (!booking.scheduledEventStartTime) return false;
      const meetingDate = parseISO(booking.scheduledEventStartTime);
      return isSameDay(meetingDate, today);
    }).length;
  }, [bookings]);

  const handleShowMeetingsToday = useCallback(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setFromDate(today);
    setToDate(today);
    setTypeFilter('booking');
    setStatusFilter('all');
    setSearch('');
    setUtmFilter('all');
  }, []);

  const filteredData = useMemo(() => {
    return unifiedData
      .filter((row) => {
        if (typeFilter !== 'all' && row.type !== typeFilter) {
          return false;
        }
        if (statusFilter !== 'all' && row.status !== statusFilter) {
          return false;
        }
        if (utmFilter !== 'all' && (row.source || 'direct') !== utmFilter) {
          return false;
        }
        if (fromDate || toDate) {
          // For bookings, ONLY use scheduledTime (meeting time) for filtering
          // For users without bookings, use createdAt (sign up time)
          if (row.type === 'booking') {
            // Only filter bookings that have a scheduled meeting time
            if (!row.scheduledTime) {
              return false; // Don't show bookings without meeting time when filtering by date
            }
            
            const meetingDate = parseISO(row.scheduledTime);
            
            if (fromDate) {
              const from = startOfDay(parseISO(fromDate));
              if (isBefore(meetingDate, from)) {
                return false;
              }
            }
            if (toDate) {
              const to = endOfDay(parseISO(toDate));
              if (isAfter(meetingDate, to)) {
                return false;
              }
            }
          } else {
            // For users, use createdAt
            const signupDate = parseISO(row.createdAt);
            
            if (fromDate) {
              const from = startOfDay(parseISO(fromDate));
              if (isBefore(signupDate, from)) {
                return false;
              }
            }
            if (toDate) {
              const to = endOfDay(parseISO(toDate));
              if (isAfter(signupDate, to)) {
                return false;
              }
            }
          }
        }
        if (search) {
          const term = search.toLowerCase();
          return (
            row.name?.toLowerCase().includes(term) ||
            row.email?.toLowerCase().includes(term) ||
            row.source?.toLowerCase().includes(term)
          );
        }
        // Filter out "Unknown Client" with placeholder email
        if (row.name === 'Unknown Client' && row.email.includes('calendly.placeholder')) {
          return false;
        }

        // Filter out invalid dates (e.g. 1970-01-01)
        if (row.scheduledTime) {
          const date = parseISO(row.scheduledTime);
          if (date.getFullYear() === 1970) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aDate = a.scheduledTime ? parseISO(a.scheduledTime) : parseISO(a.createdAt);
        const bDate = b.scheduledTime ? parseISO(b.scheduledTime) : parseISO(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      });
  }, [unifiedData, statusFilter, typeFilter, utmFilter, fromDate, toDate, search]);

  const usersWithoutBookingsData = useMemo(() => {
    return unifiedData.filter((row) => row.type === 'user');
  }, [unifiedData]);

  const filteredUsersWithoutBookings = useMemo(() => {
    return usersWithoutBookingsData.filter((row) => {
      if (search) {
        const term = search.toLowerCase();
        return (
          row.name?.toLowerCase().includes(term) ||
          row.email?.toLowerCase().includes(term)
        );
      }
      if (fromDate) {
        const from = startOfDay(parseISO(fromDate));
        if (isBefore(parseISO(row.createdAt), from)) {
          return false;
        }
      }
      if (toDate) {
        const to = endOfDay(parseISO(toDate));
        if (isAfter(parseISO(row.createdAt), to)) {
          return false;
        }
      }
      return true;
    });
  }, [usersWithoutBookingsData, search, fromDate, toDate]);

  const handleSelectAll = useCallback(() => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map((row) => row.id)));
    }
  }, [filteredData, selectedRows.size]);

  const handleSelectRow = useCallback((id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleBulkEmail = useCallback(() => {
    const selectedEmails = filteredData
      .filter((row) => selectedRows.has(row.id))
      .map((row) => row.email)
      .filter(Boolean);

    if (selectedEmails.length === 0) {
      alert('Please select at least one row to send emails');
      return;
    }

    onOpenEmailCampaign({
      recipients: selectedEmails,
      reason: 'bulk_action',
    });
  }, [selectedRows, filteredData, onOpenEmailCampaign]);

  const handleUserCampaignsClick = useCallback(async (userEmail: string) => {
    setSelectedUserEmail(userEmail);
    setLoadingUserCampaigns(true);
    setUserCampaignsList([]);

    try {
      const campaigns = userCampaigns.get(userEmail.toLowerCase()) || [];
      if (campaigns.length > 0) {
        setUserCampaignsList(campaigns);
      } else {
        // Fetch campaigns if not already loaded
        const response = await fetch(`${API_BASE_URL}/api/email-campaigns/user/${encodeURIComponent(userEmail)}`);
        const data = await response.json();
        if (data.success && data.data) {
          setUserCampaignsList(data.data);
        } else {
          alert('Failed to load campaigns: ' + (data.message || 'Unknown error'));
        }
      }
    } catch (err) {
      console.error('Error fetching user campaigns:', err);
      alert('Failed to load campaigns. Please try again.');
    } finally {
      setLoadingUserCampaigns(false);
    }
  }, [userCampaigns]);

  const handleCampaignClick = useCallback(async (campaignId: string, userEmail: string) => {
    setSelectedCampaign({ campaignId, userEmail });
    setLoadingCampaignDetails(true);
    setCampaignDetails(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/email-campaigns/${campaignId}/details/${encodeURIComponent(userEmail)}`
      );
      const data = await response.json();
      if (data.success) {
        setCampaignDetails(data.data);
      } else {
        alert('Failed to load campaign details: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error fetching campaign details:', err);
      alert('Failed to load campaign details. Please try again.');
    } finally {
      setLoadingCampaignDetails(false);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    // Close details modal, but keep user campaigns modal open if it was open
    setSelectedCampaign(null);
    setCampaignDetails(null);
  }, []);

  const handleBackToCampaignsList = useCallback(() => {
    // Close details modal and show campaigns list again
    const userEmail = selectedCampaign?.userEmail;
    setSelectedCampaign(null);
    setCampaignDetails(null);
    // Ensure the user campaigns modal is still open
    if (userEmail) {
      setSelectedUserEmail(userEmail);
      // Reload campaigns list
      const campaigns = userCampaigns.get(userEmail.toLowerCase()) || [];
      setUserCampaignsList(campaigns);
    }
  }, [selectedCampaign, userCampaigns]);

  const handleCloseUserCampaignsModal = useCallback(() => {
    setSelectedUserEmail(null);
    setUserCampaignsList([]);
  }, []);

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
      // Removed automatic email opening when marking as no-show
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update booking status');
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
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to save notes');
    }
  };

  const handleInsertData = async (data: InsertDataFormData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to create booking');
      }

      alert('Booking created successfully!');
      // Refresh data to show the new booking
      clearAllCache();
      fetchData(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to create booking');
      throw err; // Re-throw to keep modal open on error
    }
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
              fetchData();
            }, 150);
          }}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full py-10 space-y-6">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <h3 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-2">Unified Data View</h3>
          <h2 className="text-3xl font-bold text-slate-900">All Bookings & Users</h2>
          <p className="text-slate-500 mt-2 max-w-2xl mx-auto">
            View and manage all bookings and users who haven't booked meetings in one comprehensive table. Select multiple rows for bulk actions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {meetingsBookedToday > 0 && (
            <button
              onClick={handleShowMeetingsToday}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold"
            >
              <Calendar size={16} />
              Meetings Booked Today ({meetingsBookedToday})
            </button>
          )}
          <button
            onClick={() => setIsInsertModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-semibold"
          >
            <Plus size={16} />
            Insert Data
          </button>
          <button
            onClick={() => {
              clearAllCache();
              fetchData(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-sm font-semibold"
          >
            <RefreshCcw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Users Without Meetings Section */}
      <div>
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsUsersWithoutMeetingsExpanded(!isUsersWithoutMeetingsExpanded)}
              className="flex items-center gap-3 flex-1 text-left hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg transition"
              type="button"
            >
              {isUsersWithoutMeetingsExpanded ? (
                <ChevronDown className="text-slate-600" size={20} />
              ) : (
                <ChevronRight className="text-slate-600" size={20} />
              )}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="text-purple-600" size={20} />
                  Users Without Meetings
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  High intent users who signed up but haven't booked a meeting ({filteredUsersWithoutBookings.length} users)
                </p>
              </div>
            </button>
            {filteredUsersWithoutBookings.length > 0 && (
              <button
                onClick={() => {
                  const emails = filteredUsersWithoutBookings.map((row) => row.email).filter(Boolean);
                  onOpenEmailCampaign({
                    recipients: emails,
                    reason: 'users_without_meetings_bulk',
                  });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition text-sm font-semibold"
              >
                <Send size={16} />
                Email All ({filteredUsersWithoutBookings.length})
              </button>
            )}
          </div>
        </div>
        {isUsersWithoutMeetingsExpanded && (
          <div className="p-6">
            {filteredUsersWithoutBookings.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="font-semibold">No users without bookings found</p>
                <p className="text-sm mt-1">All users who signed up have booked meetings.</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-purple-50 sticky top-0 z-10">
                        <tr className="text-left text-slate-600">
                          <th className="px-4 py-3 font-semibold w-12">
                            <button
                              onClick={() => {
                                const allUserIds = filteredUsersWithoutBookings.map((row) => row.id);
                                const allSelected = allUserIds.every((id) => selectedRows.has(id));
                                if (allSelected) {
                                  setSelectedRows((prev) => {
                                    const next = new Set(prev);
                                    allUserIds.forEach((id) => next.delete(id));
                                    return next;
                                  });
                                } else {
                                  setSelectedRows((prev) => {
                                    const next = new Set(prev);
                                    allUserIds.forEach((id) => next.add(id));
                                    return next;
                                  });
                                }
                              }}
                              className="flex items-center justify-center"
                              type="button"
                            >
                              {filteredUsersWithoutBookings.length > 0 &&
                                filteredUsersWithoutBookings.every((row) => selectedRows.has(row.id)) ? (
                                <CheckSquare size={18} className="text-purple-600" />
                              ) : (
                                <Square size={18} className="text-slate-400" />
                              )}
                            </button>
                          </th>
                          <th className="px-2 py-3 font-semibold">Name</th>
                          <th className="px-2 py-3 font-semibold">Email</th>
                          <th className="px-2 py-3 font-semibold">Phone</th>
                          <th className="px-4 py-3 font-semibold">Work Authorization</th>
                          <th className="px-4 py-3 font-semibold">Signed Up</th>
                          <th className="px-4 py-3 font-semibold">Campaigns Sent</th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredUsersWithoutBookings.map((row) => {
                          const createdDate = format(parseISO(row.createdAt), 'MMM d, yyyy • h:mm a');
                          const isSelected = selectedRows.has(row.id);
                          const userData = usersByEmail.get(row.email.toLowerCase());

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-purple-50/50 transition ${isSelected ? 'bg-purple-50' : ''}`}
                            >
                              <td className="px-4 py-4">
                                <button
                                  onClick={() => handleSelectRow(row.id)}
                                  className="flex items-center justify-center"
                                  type="button"
                                >
                                  {isSelected ? (
                                    <CheckSquare size={18} className="text-purple-600" />
                                  ) : (
                                    <Square size={18} className="text-slate-400" />
                                  )}
                                </button>
                              </td>
                              <td className="px-2 py-4">
                                <div className="font-semibold text-slate-900">{row.name}</div>
                              </td>
                              <td className="px-2 py-4">
                                <div className="text-slate-700">{row.email}</div>
                              </td>
                              <td className="px-2 py-4">
                                {row.phone && row.phone !== 'Not Specified' ? (
                                  <a
                                    href={`tel:${row.phone}`}
                                    className="text-xs text-purple-600 font-semibold hover:text-purple-700"
                                  >
                                    {row.phone}
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${userData?.workAuthorization?.toLowerCase() === 'yes'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                  {userData?.workAuthorization || 'Not Specified'}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-slate-600">{createdDate}</td>
                              <td className="px-4 py-4">
                                {(() => {
                                  const emailLower = row.email.toLowerCase();
                                  const isLoading = loadingCampaignsForEmails.has(emailLower);
                                  const campaigns = userCampaigns.get(emailLower) || [];

                                  if (isLoading) {
                                    return (
                                      <div className="flex items-center gap-2 text-slate-500">
                                        <Loader2 className="animate-spin" size={14} />
                                        <span className="text-xs">Loading...</span>
                                      </div>
                                    );
                                  }

                                  if (campaigns.length === 0) {
                                    return <span className="text-slate-400 text-xs">No campaigns</span>;
                                  }

                                  return (
                                    <div className="space-y-1 max-w-xs">
                                      <button
                                        onClick={() => handleUserCampaignsClick(row.email)}
                                        className="flex items-center gap-2 text-xs hover:bg-purple-50 rounded px-2 py-1 transition cursor-pointer w-full text-left border border-purple-200 hover:border-purple-300"
                                        type="button"
                                      >
                                        <Mail className="text-purple-500" size={14} />
                                        <span className="text-purple-700 font-semibold">
                                          {campaigns.length} campaign{campaigns.length > 1 ? 's' : ''}
                                        </span>
                                        <span className="text-slate-400 ml-auto">
                                          View all →
                                        </span>
                                      </button>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-4">
                                <button
                                  onClick={() => {
                                    onOpenEmailCampaign({
                                      recipients: [row.email],
                                      reason: 'user_without_booking',
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 transition"
                                >
                                  <Mail size={14} />
                                  Reach Out
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedRows.size > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-orange-900">
            {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={handleBulkEmail}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold"
          >
            <Send size={16} />
            Send Email Campaign ({selectedRows.size})
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 p-4">
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'booking' | 'user')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="all">All types</option>
          <option value="booking">Bookings only</option>
          <option value="user">Users without bookings</option>
        </select>
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
        {(fromDate || toDate || search || statusFilter !== 'all' || utmFilter !== 'all' || typeFilter !== 'all') && (
          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
              setStatusFilter('all');
              setTypeFilter('all');
              setUtmFilter('all');
              setSearch('');
            }}
            className="text-sm text-orange-600 font-semibold"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-3 font-semibold w-10">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center justify-center"
                      type="button"
                    >
                      {selectedRows.size === filteredData.length && filteredData.length > 0 ? (
                        <CheckSquare size={16} className="text-orange-600" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-1 py-3 font-semibold w-16">Type</th>
                  <th className="px-1 py-3 font-semibold w-32">Name</th>
                  <th className="px-1 py-3 font-semibold w-40">Email</th>
                  <th className="px-1 py-3 font-semibold w-28">Phone</th>
                  <th className="px-1 py-3 font-semibold w-36">Created/Signed Up</th>
                  <th className="px-1 py-3 font-semibold w-36">Meeting Time</th>
                  <th className="px-1 py-3 font-semibold w-28">Source</th>
                  <th className="px-1 py-3 font-semibold w-24">Status</th>
                  <th className="px-2 py-3 font-semibold w-32">Campaigns</th>
                  <th className="px-2 py-3 font-semibold w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((row) => {
                  const isBooking = row.type === 'booking';
                  const scheduledDate = row.scheduledTime
                    ? format(parseISO(row.scheduledTime), 'MMM d, yyyy • h:mm a')
                    : 'Not scheduled';
                  const createdDate = format(parseISO(row.createdAt), 'MMM d, yyyy • h:mm a');
                  const isSelected = selectedRows.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-orange-50' : ''}`}
                    >
                      <td className="px-2 py-3">
                        <button
                          onClick={() => handleSelectRow(row.id)}
                          className="flex items-center justify-center"
                          type="button"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-orange-600" />
                          ) : (
                            <Square size={16} className="text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-1 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isBooking
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                            }`}
                        >
                          {isBooking ? 'Booking' : 'User'}
                        </span>
                      </td>
                      <td className="px-1 py-3">
                        <div className="font-semibold text-slate-900 truncate" title={row.name}>{row.name}</div>
                      </td>
                      <td className="px-1 py-3">
                        <div className="text-slate-700 truncate text-xs" title={row.email}>{row.email}</div>
                      </td>
                      <td className="px-1 py-3">
                        {row.phone && row.phone !== 'Not Specified' ? (
                          <a
                            href={`tel:${row.phone}`}
                            className="text-xs text-orange-600 font-semibold hover:text-orange-700 truncate block"
                            title={row.phone}
                          >
                            {row.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-1 py-3 text-slate-600 text-xs">{createdDate}</td>
                      <td className="px-1 py-3 text-slate-600 text-xs">
                        {isBooking ? scheduledDate : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-1 py-3">
                        {row.source ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 truncate max-w-full" title={row.source}>
                            {row.source}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-1 py-3">
                        {row.status ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[row.status]}`}
                          >
                            {statusLabels[row.status]}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        {(() => {
                          const emailLower = row.email.toLowerCase();
                          const isLoading = loadingCampaignsForEmails.has(emailLower);
                          const campaigns = userCampaigns.get(emailLower) || [];
                          const booking = isBooking && row.bookingId ? bookingsById.get(row.bookingId) : null;

                          return (
                            <div className="space-y-2 max-w-xs">
                              {/* Email Campaigns */}
                              {isLoading ? (
                                <div className="flex items-center gap-2 text-slate-500">
                                  <Loader2 className="animate-spin" size={14} />
                                  <span className="text-xs">Loading...</span>
                                </div>
                              ) : campaigns.length > 0 ? (
                                <button
                                  onClick={() => handleUserCampaignsClick(row.email)}
                                  className="flex items-center gap-2 text-xs hover:bg-slate-50 rounded px-2 py-1 transition cursor-pointer w-full text-left border border-slate-200 hover:border-orange-300"
                                  type="button"
                                >
                                  <Mail className="text-orange-500" size={14} />
                                  <span className="text-slate-700 font-semibold">
                                    {campaigns.length} campaign{campaigns.length > 1 ? 's' : ''}
                                  </span>
                                  <span className="text-slate-400 ml-auto">
                                    View all →
                                  </span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-xs">No campaigns</span>
                              )}

                              {/* Scheduled Information */}
                              {booking && (
                                <div className="space-y-1 pt-1 border-t border-slate-200">
                                  {booking.scheduledEventStartTime && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                      <Calendar size={12} className="text-blue-500" />
                                      <span>Meeting: {format(parseISO(booking.scheduledEventStartTime), 'MMM d, h:mm a')}</span>
                                    </div>
                                  )}
                                  {booking.reminderCallJobId && (
                                    <div className="flex items-center gap-1.5 text-xs text-blue-600">
                                      <Clock size={12} />
                                      <span>Reminder call scheduled</span>
                                    </div>
                                  )}
                                  {booking.paymentReminders && booking.paymentReminders.length > 0 && (
                                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                                      <Clock size={12} />
                                      <span>{booking.paymentReminders.length} payment reminder{booking.paymentReminders.length > 1 ? 's' : ''}</span>
                                    </div>
                                  )}
                                  {booking.rescheduledCount && booking.rescheduledCount > 0 && (
                                    <div className="flex items-center gap-1.5 text-xs text-purple-600">
                                      <RefreshCcw size={12} />
                                      <span>Rescheduled {booking.rescheduledCount} time{booking.rescheduledCount > 1 ? 's' : ''}</span>
                                    </div>
                                  )}
                                  {booking.whatsappReminderSent && (
                                    <div className="flex items-center gap-1.5 text-xs text-green-600">
                                      <Mail size={12} />
                                      <span>WhatsApp sent</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1.5">
                        {isBooking && row.bookingId ? (
                            <div className="flex flex-col gap-2">
                              {/* Row 1: Join and Completed */}
                              <div className="flex items-center gap-2">
                                {row.meetLink && (
                                  <a
                                    href={row.meetLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition flex-1 justify-center whitespace-nowrap"
                                  >
                                    <ExternalLink size={14} />
                                    Join
                                  </a>
                                )}
                                <button
                                  onClick={() => {
                                    const booking = bookingsById.get(row.bookingId!);
                                    if (booking) {
                                      handleStatusUpdate(booking.bookingId, 'completed');
                                    }
                                  }}
                                  disabled={updatingBookingId === row.bookingId}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-60 flex-1 justify-center whitespace-nowrap"
                                >
                                  {updatingBookingId === row.bookingId ? (
                                    <Loader2 className="animate-spin" size={14} />
                                  ) : (
                                    <CheckCircle2 size={14} />
                                  )}
                                  Completed
                                </button>
                              </div>
                              {/* Row 2: Mark No-Show and Reschedule */}
                              <div className="flex items-center gap-2">
                                {row.status === 'no-show' ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        const booking = bookingsById.get(row.bookingId!);
                                        if (booking) {
                                          handleStatusUpdate(booking.bookingId, 'scheduled');
                                        }
                                      }}
                                      disabled={updatingBookingId === row.bookingId}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 transition disabled:opacity-60 flex-1 justify-center whitespace-nowrap"
                                    >
                                      {updatingBookingId === row.bookingId ? (
                                        <Loader2 className="animate-spin" size={14} />
                                      ) : (
                                        <CheckCircle2 size={14} />
                                      )}
                                      Unmark
                                    </button>
                                    <button
                                      onClick={() => {
                                        const booking = bookingsById.get(row.bookingId!);
                                        if (booking && booking.clientEmail) {
                                          onOpenEmailCampaign({
                                            recipients: [booking.clientEmail],
                                            reason: 'no_show_followup',
                                          });
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-300 text-blue-600 hover:bg-blue-50 transition flex-1 justify-center whitespace-nowrap"
                                    >
                                      <Mail size={14} />
                                      Send Mail
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        const booking = bookingsById.get(row.bookingId!);
                                        if (booking) {
                                          handleStatusUpdate(booking.bookingId, 'no-show');
                                        }
                                      }}
                                      disabled={updatingBookingId === row.bookingId}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 transition disabled:opacity-60 flex-1 justify-center whitespace-nowrap"
                                    >
                                      {updatingBookingId === row.bookingId ? (
                                        <Loader2 className="animate-spin" size={14} />
                                      ) : (
                                        <AlertTriangle size={14} />
                                      )}
                                      Mark No-Show
                                    </button>
                                    <button
                                      onClick={() => {
                                        const booking = bookingsById.get(row.bookingId!);
                                        if (booking) {
                                          handleReschedule(booking);
                                        }
                                      }}
                                      disabled={updatingBookingId === row.bookingId}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-600 hover:bg-amber-50 transition disabled:opacity-60 flex-1 justify-center whitespace-nowrap"
                                    >
                                      {updatingBookingId === row.bookingId ? (
                                        <Loader2 className="animate-spin" size={14} />
                                      ) : (
                                        <Clock size={14} />
                                      )}
                                      Reschedule
                                    </button>
                                  </>
                                )}
                              </div>
                              {/* Row 3: Take Notes and Edit Status */}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedBookingForNotes({
                                      id: row.bookingId!,
                                      name: row.name,
                                      notes: row.meetingNotes || '',
                                    });
                                    setIsNotesModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 transition whitespace-nowrap flex-1 justify-center"
                                >
                                  <Edit size={14} />
                                  {row.meetingNotes ? 'Edit Notes' : 'Take Notes'}
                                </button>
                                <select
                                  value={row.status}
                                  onChange={(e) => {
                                    const booking = bookingsById.get(row.bookingId!);
                                    if (booking && e.target.value !== row.status) {
                                      handleStatusUpdate(booking.bookingId, e.target.value as BookingStatus);
                                    }
                                  }}
                                  disabled={updatingBookingId === row.bookingId}
                                  className="px-2 py-1 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 hover:border-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition disabled:opacity-60 flex-1"
                                >
                                  <option value="scheduled">Scheduled</option>
                                  <option value="completed">Completed</option>
                                  <option value="no-show">No Show</option>
                                  <option value="rescheduled">Rescheduled</option>
                                  <option value="canceled">Canceled</option>
                                </select>
                              </div>
                            </div>
                        ) : (
                          <button
                            onClick={() => {
                              onOpenEmailCampaign({
                                recipients: [row.email],
                                reason: 'user_without_booking',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition"
                          >
                            <Mail size={12} />
                            Reach Out
                          </button>
                        )}
                        </div>
                        {row.notes && (
                          <div className="text-xs text-slate-500 bg-slate-100 rounded-lg px-2 py-1.5 border border-slate-200 mt-1.5">
                            <span className="font-semibold text-slate-600">Calendly Notes:</span> {row.notes}
                          </div>
                        )}
                        {row.meetingNotes && (
                          <div className="text-xs text-slate-500 bg-yellow-50 rounded-lg px-2 py-1.5 border border-yellow-200 mt-1.5">
                            <span className="font-semibold text-slate-600">Meeting Notes:</span> {row.meetingNotes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-sm text-slate-500">
                      No data matches your filters. Try adjusting the criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Showing {filteredData.length} of {unifiedData.length} total rows ({bookings.length} bookings,{' '}
        {usersWithoutBookings.length} users without bookings).
      </p>

      {/* User Campaigns List Modal */}
      {selectedUserEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleCloseUserCampaignsModal}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Mail className="text-orange-500" size={24} />
                Email Campaigns for {selectedUserEmail}
              </h3>
              <button
                onClick={handleCloseUserCampaignsModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                type="button"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              {loadingUserCampaigns ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                  <span className="ml-3 text-slate-600">Loading campaigns...</span>
                </div>
              ) : userCampaignsList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Provider</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Template Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Sent At</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {userCampaignsList.map((campaign) => (
                        <tr key={campaign._id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${campaign.provider === 'mailchimp'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                                }`}
                            >
                              {campaign.provider === 'mailchimp' ? 'Mailchimp' : 'SendGrid'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-slate-900">{campaign.templateName || 'N/A'}</div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${campaign.status === 'SUCCESS' || campaign.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                                }`}
                            >
                              {campaign.status === 'SUCCESS' || campaign.status === 'success' ? 'SUCCESS' : 'FAILED'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-slate-600">
                            {format(parseISO(campaign.sentAt || campaign.createdAt), 'MMM d, yyyy • h:mm a')}
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => {
                                // Keep the user campaigns modal open, just open details modal on top
                                handleCampaignClick(campaign._id, selectedUserEmail);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition"
                              type="button"
                            >
                              <Info size={14} />
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Mail className="mx-auto mb-4 text-slate-300" size={48} />
                  <p className="text-slate-600 font-semibold">No campaigns found</p>
                  <p className="text-slate-400 text-sm mt-1">No emails have been sent to this user yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Details Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={handleCloseModal}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                {selectedUserEmail && (
                  <button
                    onClick={handleBackToCampaignsList}
                    className="p-2 hover:bg-slate-100 rounded-lg transition"
                    type="button"
                    title="Back to campaigns list"
                  >
                    <ArrowLeft size={20} className="text-slate-600" />
                  </button>
                )}
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Info className="text-orange-500" size={24} />
                  Campaign Details
                </h3>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
                type="button"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              {loadingCampaignDetails ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                  <span className="ml-3 text-slate-600">Loading campaign details...</span>
                </div>
              ) : campaignDetails ? (
                <div className="space-y-6">
                  {/* Campaign Overview */}
                  <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">Campaign Overview</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Provider</p>
                        <p className="font-semibold text-slate-900">
                          {campaignDetails.campaign.provider === 'mailchimp' ? 'Mailchimp' : 'SendGrid'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Template Name</p>
                        <p className="font-semibold text-slate-900">{campaignDetails.campaign.templateName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Status</p>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${campaignDetails.campaign.status === 'SUCCESS'
                            ? 'bg-green-100 text-green-800'
                            : campaignDetails.campaign.status === 'PARTIAL'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                            }`}
                        >
                          {campaignDetails.campaign.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Total Sent</p>
                        <p className="font-semibold text-slate-900">{campaignDetails.campaign.total}</p>
                      </div>
                    </div>
                  </div>

                  {/* What Was Sent */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">What Was Sent</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Field</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-700">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="px-4 py-3 text-slate-600 font-medium">Recipient Email</td>
                            <td className="px-4 py-3 text-slate-900">{campaignDetails.userEmailDetails.email}</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-slate-600 font-medium">Send Status</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${campaignDetails.userEmailDetails.status === 'SUCCESS'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                                  }`}
                              >
                                {campaignDetails.userEmailDetails.status}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-slate-600 font-medium">Sent At</td>
                            <td className="px-4 py-3 text-slate-900">
                              {format(parseISO(campaignDetails.userEmailDetails.sentAt), 'MMM d, yyyy • h:mm a')}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-slate-600 font-medium">Template ID</td>
                            <td className="px-4 py-3 text-slate-900 font-mono text-xs">
                              {campaignDetails.campaign.templateId}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-slate-600 font-medium">Domain Name</td>
                            <td className="px-4 py-3 text-slate-900">{campaignDetails.campaign.domainName}</td>
                          </tr>
                          {campaignDetails.userEmailDetails.error && (
                            <tr>
                              <td className="px-4 py-3 text-slate-600 font-medium">Error</td>
                              <td className="px-4 py-3 text-red-600">{campaignDetails.userEmailDetails.error}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Time Window */}
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <Clock className="text-blue-600" size={20} />
                      Time Window Analysis
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Window Start:</span>
                        <span className="font-semibold text-slate-900">
                          {format(parseISO(campaignDetails.timeWindow.start), 'MMM d, yyyy • h:mm a')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Window End:</span>
                        <span className="font-semibold text-slate-900">
                          {campaignDetails.timeWindow.hasNextEmail
                            ? format(parseISO(campaignDetails.timeWindow.end), 'MMM d, yyyy • h:mm a')
                            : 'Present (No next email)'}
                        </span>
                      </div>
                      {campaignDetails.timeWindow.nextEmailDate && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">Next Email Sent:</span>
                          <span className="font-semibold text-slate-900">
                            {format(parseISO(campaignDetails.timeWindow.nextEmailDate), 'MMM d, yyyy • h:mm a')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Booking Status */}
                  <div
                    className={`rounded-xl border p-6 ${campaignDetails.bookedAfterEmail
                      ? 'bg-green-50 border-green-200'
                      : 'bg-slate-50 border-slate-200'
                      }`}
                  >
                    <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      {campaignDetails.bookedAfterEmail ? (
                        <CheckCircle2 className="text-green-600" size={20} />
                      ) : (
                        <AlertTriangle className="text-slate-400" size={20} />
                      )}
                      Booking Status After Email
                    </h4>
                    <div className="mb-4">
                      <p className={`text-lg font-bold ${campaignDetails.bookedAfterEmail ? 'text-green-700' : 'text-slate-600'}`}>
                        {campaignDetails.bookedAfterEmail
                          ? `✅ User booked ${campaignDetails.bookingCount} meeting${campaignDetails.bookingCount > 1 ? 's' : ''} after this email`
                          : '❌ User did not book a meeting after this email'}
                      </p>
                    </div>

                    {campaignDetails.bookingsAfterEmail.length > 0 && (
                      <div className="mt-4">
                        <h5 className="font-semibold text-slate-900 mb-3">Bookings Made:</h5>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-white">
                              <tr>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Booking ID</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Client Name</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Booked At</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Meeting Time</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                                <th className="px-4 py-2 text-left font-semibold text-slate-700">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {campaignDetails.bookingsAfterEmail.map((booking) => (
                                <tr key={booking.bookingId}>
                                  <td className="px-4 py-3 text-slate-900 font-mono text-xs">{booking.bookingId}</td>
                                  <td className="px-4 py-3 text-slate-900">{booking.clientName}</td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {format(parseISO(booking.bookingCreatedAt), 'MMM d, yyyy • h:mm a')}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {booking.scheduledEventStartTime
                                      ? format(parseISO(booking.scheduledEventStartTime), 'MMM d, yyyy • h:mm a')
                                      : '—'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[booking.bookingStatus as BookingStatus]}`}
                                    >
                                      {statusLabels[booking.bookingStatus as BookingStatus]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    {booking.calendlyMeetLink && booking.calendlyMeetLink !== 'Not Provided' ? (
                                      <a
                                        href={booking.calendlyMeetLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition"
                                      >
                                        <ExternalLink size={14} />
                                        Join
                                      </a>
                                    ) : (
                                      <span className="text-slate-400 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertTriangle className="mx-auto mb-4 text-slate-400" size={48} />
                  <p className="text-slate-600">Failed to load campaign details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Notes Modal */}
      <NotesModal
        isOpen={isNotesModalOpen}
        onClose={() => {
          setIsNotesModalOpen(false);
          setSelectedBookingForNotes(null);
        }}
        onSave={handleSaveNotes}
        initialNotes={selectedBookingForNotes?.notes}
        clientName={selectedBookingForNotes?.name || ''}
      />
      {/* Insert Data Modal */}
      <InsertDataModal
        isOpen={isInsertModalOpen}
        onClose={() => setIsInsertModalOpen(false)}
        onSave={handleInsertData}
      />
    </div>
  );
}

