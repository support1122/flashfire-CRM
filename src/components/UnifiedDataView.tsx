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
  ChevronLeft,
  Edit,
  Plus,
  MessageCircle,
  AlertCircle,
  Trash2,
  DollarSign,
} from 'lucide-react';
import {
  format,
  parseISO,
} from 'date-fns';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import {
  clearAllCache,
} from '../utils/dataCache';

import NotesModal from './NotesModal';
import InsertDataModal, { type InsertDataFormData } from './InsertDataModal';
import FollowUpModal, { type FollowUpData } from './FollowUpModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type BookingStatus = 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show' | 'ignored' | 'paid';
type PlanName = 'PRIME' | 'IGNITE' | 'PROFESSIONAL' | 'EXECUTIVE';
type PlanOption = { key: PlanName; label: string; price: number; displayPrice: string; currency?: string };
type PaymentPlan = {
  name: PlanName;
  price: number;
  currency?: string;
  displayPrice?: string;
  selectedAt?: string;
};
const PLAN_OPTIONS: PlanOption[] = [
  { key: 'PRIME', label: 'PRIME', price: 119, displayPrice: '$119', currency: 'USD' },
  { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199', currency: 'USD' },
  { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349', currency: 'USD' },
  { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599', currency: 'USD' },
];
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
  paymentPlan?: PaymentPlan;
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
  paymentPlan?: PaymentPlan;
}

import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';

interface UnifiedDataViewProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
  onOpenWhatsAppCampaign?: (payload: WhatsAppPrefillPayload) => void;
}

const statusLabels: Record<BookingStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
  'no-show': 'No Show',
  ignored: 'Ignored',
  paid: 'Paid',
};

const statusColors: Record<BookingStatus, string> = {
  scheduled: 'text-blue-600 bg-blue-100',
  completed: 'text-green-600 bg-green-100',
  canceled: 'text-red-600 bg-red-100',
  rescheduled: 'text-amber-600 bg-amber-100',
  'no-show': 'text-rose-600 bg-rose-100',
  ignored: 'text-gray-600 bg-gray-100',
  paid: 'text-emerald-600 bg-emerald-100',
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

export default function UnifiedDataView({ onOpenEmailCampaign, onOpenWhatsAppCampaign }: UnifiedDataViewProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [usersWithoutBookings, setUsersWithoutBookings] = useState<UserWithoutBooking[]>([]);
  const [userCampaigns, setUserCampaigns] = useState<Map<string, UserCampaign[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [planFilter, setPlanFilter] = useState<PlanName | 'all'>('all');
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
  const [isUsersWithoutMeetingsExpanded, setIsUsersWithoutMeetingsExpanded] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedBookingForNotes, setSelectedBookingForNotes] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<{ name: string; email: string; phone?: string } | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [bookingsPagination, setBookingsPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [usersPagination, setUsersPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [meetingsBookedToday, setMeetingsBookedToday] = useState<Booking[]>([]);
  const [loadingMeetingsToday, setLoadingMeetingsToday] = useState(false);
  const [showMeetingsToday, setShowMeetingsToday] = useState(false);
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [planPickerFor, setPlanPickerFor] = useState<string | null>(null);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [selectedBookingForFollowUp, setSelectedBookingForFollowUp] = useState<Booking | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

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

  const fetchBookings = useCallback(async (page: number = 1) => {
    try {
      setRefreshing(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (utmFilter !== 'all') {
        params.append('utmSource', utmFilter);
      }
      if (planFilter !== 'all') {
        params.append('planName', planFilter);
      }
      if (search) {
        params.append('search', search);
      }
      if (fromDate) {
        params.append('fromDate', fromDate);
      }
      if (toDate) {
        params.append('toDate', toDate);
      }

      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/paginated?${params}`);
      const data = await response.json();

      if (data.success) {
        setBookings(data.data);
        setBookingsPagination(data.pagination);
        setBookingsPage(page);
      } else {
        throw new Error(data.message || 'Failed to fetch bookings');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [statusFilter, utmFilter, planFilter, search, fromDate, toDate]);

  const fetchUsers = useCallback(async (page: number = 1) => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (search) {
        params.append('search', search);
      }
      if (fromDate) {
        params.append('fromDate', fromDate);
      }
      if (toDate) {
        params.append('toDate', toDate);
      }

      const response = await fetch(`${API_BASE_URL}/api/users/without-bookings/paginated?${params}`);
      const data = await response.json();

      if (data.success) {
        setUsersWithoutBookings(data.data);
        setUsersPagination(data.pagination);
        setUsersPage(page);
      } else {
        console.warn('Failed to fetch users:', data.message);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }, [search, fromDate, toDate]);

  const fetchMeetingsBookedToday = useCallback(async () => {
    try {
      setLoadingMeetingsToday(true);
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/today`);
      const data = await response.json();

      if (data.success) {
        setMeetingsBookedToday(data.data);
        setShowMeetingsToday(true);
        setFromDate(format(new Date(), 'yyyy-MM-dd'));
        setToDate(format(new Date(), 'yyyy-MM-dd'));
        setTypeFilter('booking');
        setStatusFilter('all');
        setSearch('');
        setUtmFilter('all');
      }
    } catch (err) {
      console.error('Error fetching meetings booked today:', err);
    } finally {
      setLoadingMeetingsToday(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (typeFilter === 'booking' || typeFilter === 'all') {
      await fetchBookings(bookingsPage);
    }
    if (typeFilter === 'user' || typeFilter === 'all') {
      await fetchUsers(usersPage);
    }
  }, [typeFilter, bookingsPage, usersPage, fetchBookings, fetchUsers]);

  // Removed automatic campaign fetching - now only fetches when "Campaigns" button is clicked

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openStatusDropdown && !(event.target as Element).closest('.status-dropdown-container')) {
        setOpenStatusDropdown(null);
      }
    };

    if (openStatusDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openStatusDropdown]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeFilter === 'booking' || typeFilter === 'all') {
      const page = 1;
      setBookingsPage(page);
      fetchBookings(page);
    }
  }, [statusFilter, planFilter, utmFilter, search, fromDate, toDate, typeFilter, fetchBookings]);

  useEffect(() => {
    if (typeFilter === 'user' || typeFilter === 'all') {
      const page = 1;
      setUsersPage(page);
      fetchUsers(page);
    }
  }, [search, fromDate, toDate, typeFilter, fetchUsers]);

  useEffect(() => {
    if (!openStatusDropdown) {
      setPlanPickerFor(null);
    }
  }, [openStatusDropdown]);

  // Removed automatic campaign fetching on data changes - saves bandwidth and resources


  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    bookings.forEach((booking) => sources.add(booking.utmSource || 'direct'));
    return Array.from(sources).sort();
  }, [bookings]);

  const meetingsBookedTodayCount = useMemo(() => {
    return meetingsBookedToday.length;
  }, [meetingsBookedToday]);

  const handleShowMeetingsToday = useCallback(() => {
    fetchMeetingsBookedToday();
  }, [fetchMeetingsBookedToday]);

  const filteredData = useMemo(() => {
    const rows: UnifiedRow[] = [];

    if (showMeetingsToday && meetingsBookedToday.length > 0) {
      meetingsBookedToday.forEach((booking) => {
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
          paymentPlan: booking.paymentPlan,
          bookingId: booking.bookingId,
        });
      });
      return rows;
    }

    if (typeFilter === 'booking' || typeFilter === 'all') {
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
        paymentPlan: booking.paymentPlan,
          bookingId: booking.bookingId,
        });
      });
    }

    if (typeFilter === 'user' || typeFilter === 'all') {
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
    }

    return rows.filter((row) => {
      if (row.name === 'Unknown Client' && row.email.includes('calendly.placeholder')) {
        return false;
      }
      if (row.scheduledTime) {
        const date = parseISO(row.scheduledTime);
        if (date.getFullYear() === 1970) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const aDate = a.scheduledTime ? parseISO(a.scheduledTime) : parseISO(a.createdAt);
      const bDate = b.scheduledTime ? parseISO(b.scheduledTime) : parseISO(b.createdAt);
      return bDate.getTime() - aDate.getTime();
    });
  }, [bookings, usersWithoutBookings, typeFilter, showMeetingsToday, meetingsBookedToday]);


  const filteredUsersWithoutBookings = useMemo(() => {
    return usersWithoutBookings.map((user) => ({
      id: `user-${user.email}`,
      type: 'user' as const,
      name: user.fullName || 'Not Provided',
      email: user.email,
      phone: user.phone !== 'Not Specified' ? user.phone : undefined,
      createdAt: user.createdAt,
      workAuthorization: user.workAuthorization,
    }));
  }, [usersWithoutBookings]);

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

  const handleBulkWhatsApp = useCallback(() => {
    if (!onOpenWhatsAppCampaign) {
      alert('WhatsApp campaign feature is not available');
      return;
    }

    const selectedPhones = filteredData
      .filter((row) => selectedRows.has(row.id))
      .map((row) => {
        // Extract phone number, handling country code if present
        if (row.phone && row.phone !== 'Not Specified') {
          // Remove any non-digit characters except +
          return row.phone.replace(/[^\d+]/g, '');
        }
        return null;
      })
      .filter((phone): phone is string => phone !== null && phone.length > 0);

    if (selectedPhones.length === 0) {
      alert('Please select at least one row with a valid phone number to send WhatsApp messages');
      return;
    }

    onOpenWhatsAppCampaign({
      mobileNumbers: selectedPhones,
      reason: 'bulk_action',
    });
  }, [selectedRows, filteredData, onOpenWhatsAppCampaign]);

  const openEmailFollowUp = useCallback(
    (email: string | undefined, reason: string) => {
      if (!email) {
        alert('Missing email address');
        return;
      }
      onOpenEmailCampaign({
        recipients: [email],
        reason,
      });
    },
    [onOpenEmailCampaign]
  );

  const openWhatsAppFollowUp = useCallback(
    (phoneRaw: string | undefined, reason: string) => {
      if (!onOpenWhatsAppCampaign) {
        alert('WhatsApp campaign feature is not available');
        return;
      }
      if (!phoneRaw || phoneRaw === 'Not Specified') {
        alert('Missing phone number');
        return;
      }
      const phone = phoneRaw.replace(/[^\d+]/g, '');
      if (!phone) {
        alert('Invalid phone number');
        return;
      }
      onOpenWhatsAppCampaign({
        mobileNumbers: [phone],
        reason,
      });
    },
    [onOpenWhatsAppCampaign]
  );

  const handleUserCampaignsClick = useCallback(async (userEmail: string) => {
    setSelectedUserEmail(userEmail);
    setLoadingUserCampaigns(true);
    setUserCampaignsList([]);

    try {
      // Fetch campaigns on-demand when button is clicked
      const response = await fetch(`${API_BASE_URL}/api/email-campaigns/user/${encodeURIComponent(userEmail)}`);
      const data = await response.json();
      if (data.success && data.data) {
        setUserCampaignsList(data.data);
        // Store in cache for this session
        setUserCampaigns(prev => {
          const newMap = new Map(prev);
          newMap.set(userEmail.toLowerCase(), data.data);
          return newMap;
        });
      } else {
        alert('Failed to load campaigns: ' + (data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error fetching user campaigns:', err);
      alert('Failed to load campaigns. Please try again.');
    } finally {
      setLoadingUserCampaigns(false);
    }
  }, []);

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

  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const getPlanOptionByName = (name?: string | null) => {
    if (!name) return undefined;
    return PLAN_OPTIONS.find((p) => p.key === name) || undefined;
  };

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus, plan?: PlanOption) => {
    try {
      setUpdatingBookingId(bookingId);
      const planPayload = plan
        ? {
            name: plan.key,
            price: plan.price,
            currency: plan.currency || 'USD',
            displayPrice: plan.displayPrice,
          }
        : undefined;
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          ...(planPayload ? { plan: planPayload } : {}),
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to update booking status');
      }
      const updatedBooking = data.data as Booking | undefined;
      setBookings((prev) => {
        return prev.map((booking) =>
          booking.bookingId === bookingId
            ? {
                ...booking,
                bookingStatus: status,
                paymentPlan: updatedBooking?.paymentPlan || planPayload || booking.paymentPlan,
              }
            : booking,
        );
      });
      fetchBookings(bookingsPage);
      
      // Show toast notification if workflow was triggered
      if (data.workflowTriggered) {
        showToast(`Workflow triggered for ${status} action`, 'success');
      }

      // If status is "completed", show follow-up modal
      if (status === 'completed') {
        const booking = bookings.find(b => b.bookingId === bookingId);
        if (booking) {
          setSelectedBookingForFollowUp({
            ...booking,
            bookingStatus: status,
            paymentPlan: updatedBooking?.paymentPlan || planPayload || booking.paymentPlan,
          });
          setIsFollowUpModalOpen(true);
        }
      }
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to update booking status', 'error');
    } finally {
      setUpdatingBookingId(null);
      setPlanPickerFor(null);
    }
  };

  const handleScheduleFollowUp = async (followUpData: FollowUpData) => {
    if (!selectedBookingForFollowUp) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${selectedBookingForFollowUp.bookingId}/follow-up`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId: selectedBookingForFollowUp.bookingId,
          ...followUpData,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to schedule follow-up');
      }

      showToast('Follow-up scheduled successfully!', 'success');
      setIsFollowUpModalOpen(false);
      setSelectedBookingForFollowUp(null);
    } catch (err) {
      throw err; // Re-throw to let modal handle error display
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
        return prev.map((booking) =>
          booking.bookingId === selectedBookingForNotes.id
            ? { ...booking, meetingNotes: notes }
            : booking
        );
      });
      await fetchBookings(bookingsPage);

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
      clearAllCache();
      setBookingsPage(1);
      fetchBookings(1);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to create booking');
      throw err; // Re-throw to keep modal open on error
    }
  };

  const handleDeleteClick = (row: UnifiedRow) => {
    setSelectedUserForDelete({
      name: row.name,
      email: row.email,
      phone: row.phone
    });
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedUserForDelete) return;

    setDeletingUser(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/delete/${encodeURIComponent(selectedUserForDelete.email)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        showToast(`Successfully deleted all records for ${selectedUserForDelete.name}`, 'success');
        clearAllCache();
        setBookingsPage(1);
        setUsersPage(1);
        fetchBookings(1);
        fetchUsers(1);
        setIsDeleteModalOpen(false);
        setSelectedUserForDelete(null);
      } else {
        showToast(data.message || 'Failed to delete user records', 'error');
      }
    } catch (err) {
      console.error('Error deleting user records:', err);
      showToast('Failed to delete user records. Please try again.', 'error');
    } finally {
      setDeletingUser(false);
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
        return prev.map((item) => (item.bookingId === updatedBooking.bookingId ? { ...item, ...updatedBooking } : item));
      });
      await fetchBookings(bookingsPage);
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

      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <h3 className="text-sm uppercase tracking-wide text-slate-500 font-semibold mb-2">Unified Data View</h3>
          <h2 className="text-3xl font-bold text-slate-900">All Bookings & Users</h2>
          <p className="text-slate-500 mt-2 max-w-2xl mx-auto">
            View and manage all bookings and users who haven't booked meetings in one comprehensive table. Select multiple rows for bulk actions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleShowMeetingsToday}
            disabled={loadingMeetingsToday}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMeetingsToday ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Loading...
              </>
            ) : (
              <>
                <Calendar size={16} />
                Meetings Booked Today {meetingsBookedTodayCount > 0 && `(${meetingsBookedTodayCount})`}
              </>
            )}
          </button>
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
              setBookingsPage(1);
              setUsersPage(1);
              setShowMeetingsToday(false);
              fetchData();
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
              <div className="flex items-center gap-2">
                {onOpenWhatsAppCampaign && (
                  <button
                    onClick={() => {
                      const phones = filteredUsersWithoutBookings
                        .map((row) => {
                          if (row.phone && row.phone !== 'Not Specified') {
                            return row.phone.replace(/[^\d+]/g, '');
                          }
                          return null;
                        })
                        .filter((phone): phone is string => phone !== null && phone.length > 0);
                      
                      if (phones.length === 0) {
                        alert('No valid phone numbers found in selected users');
                        return;
                      }
                      
                      onOpenWhatsAppCampaign({
                        mobileNumbers: phones,
                        reason: 'users_without_meetings_bulk',
                      });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-semibold"
                  >
                    <MessageCircle size={16} />
                    WhatsApp All ({filteredUsersWithoutBookings.length})
                  </button>
                )}
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
              </div>
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
                                  const campaigns = userCampaigns.get(emailLower) || [];

                                  return (
                                    <div className="space-y-1 max-w-xs">
                                      <button
                                        onClick={() => handleUserCampaignsClick(row.email)}
                                        className="flex items-center gap-2 text-xs hover:bg-purple-50 rounded px-2 py-1 transition cursor-pointer w-full text-left border border-purple-200 hover:border-purple-300"
                                        type="button"
                                      >
                                        <Mail className="text-purple-500" size={14} />
                                        <span className="text-purple-700 font-semibold">
                                          {campaigns.length > 0 ? `${campaigns.length} campaign${campaigns.length > 1 ? 's' : ''}` : 'View Campaigns'}
                                        </span>
                                        <span className="text-slate-400 ml-auto">
                                          →
                                        </span>
                                      </button>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col gap-1.5">
                                {/* Delete Button */}
                                <button
                                  onClick={() => handleDeleteClick(row)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition w-full justify-center"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                                <button
                                  onClick={() => {
                                    onOpenEmailCampaign({
                                      recipients: [row.email],
                                      reason: 'user_without_booking',
                                    });
                                  }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 text-white hover:bg-purple-600 transition w-full justify-center"
                                >
                                  <Mail size={14} />
                                    Email
                                </button>
                                  {onOpenWhatsAppCampaign && row.phone && row.phone !== 'Not Specified' && (
                                    <button
                                      onClick={() => {
                                        const phone = row.phone!.replace(/[^\d+]/g, '');
                                        if (phone) {
                                          onOpenWhatsAppCampaign({
                                            mobileNumbers: [phone],
                                            reason: 'user_without_booking',
                                          });
                                        } else {
                                          alert('Invalid phone number');
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition w-full justify-center"
                                    >
                                      <MessageCircle size={14} />
                                      WhatsApp
                                    </button>
                                  )}
                                </div>
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
          <div className="flex items-center gap-2">
            {onOpenWhatsAppCampaign && (
              <button
                onClick={handleBulkWhatsApp}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-semibold"
              >
                <MessageCircle size={16} />
                Send WhatsApp ({selectedRows.size})
              </button>
            )}
          <button
            onClick={handleBulkEmail}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold"
          >
            <Send size={16} />
              Send Email ({selectedRows.size})
          </button>
          </div>
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
          {(['scheduled', 'completed', 'rescheduled', 'no-show', 'canceled', 'ignored', 'paid'] as BookingStatus[]).map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanName | 'all')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white"
        >
          <option value="all">All plans</option>
          {PLAN_OPTIONS.map((plan) => (
            <option key={plan.key} value={plan.key}>
              {plan.label} ({plan.displayPrice})
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
        {(fromDate || toDate || search || statusFilter !== 'all' || planFilter !== 'all' || utmFilter !== 'all' || typeFilter !== 'all' || showMeetingsToday) && (
          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
              setStatusFilter('all');
              setTypeFilter('all');
              setPlanFilter('all');
              setUtmFilter('all');
              setSearch('');
              setShowMeetingsToday(false);
              setBookingsPage(1);
              setUsersPage(1);
            }}
            className="text-sm text-orange-600 font-semibold"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-350px)] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-left text-slate-500">
                  <th className="px-1.5 py-2 font-semibold w-10">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center justify-center"
                      type="button"
                    >
                      {selectedRows.size === filteredData.length && filteredData.length > 0 ? (
                        <CheckSquare size={14} className="text-orange-600" />
                      ) : (
                        <Square size={14} className="text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-1 py-2 font-semibold w-16">Type</th>
                  <th className="px-1 py-2 font-semibold w-32">Name</th>
                  <th className="px-1 py-2 font-semibold w-40">Email</th>
                  <th className="px-1 py-2 font-semibold w-28">Phone</th>
                  <th className="px-1 py-2 font-semibold w-36">Created/Signed Up</th>
                  <th className="px-1 py-2 font-semibold w-36">Meeting Time</th>
                  <th className="px-1 py-2 font-semibold w-28">Source</th>
                  <th className="px-1 py-2 font-semibold w-24">Status</th>
                  <th className="px-1.5 py-2 font-semibold w-32">Campaigns</th>
                  <th className="px-1.5 py-2 font-semibold w-40">Actions</th>
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
                  const calendlyNoteKey = `calendly-${row.id}`;
                  const meetingNoteKey = `meeting-${row.id}`;
                  const isCalendlyNoteExpanded = expandedNotes.has(calendlyNoteKey);
                  const isMeetingNoteExpanded = expandedNotes.has(meetingNoteKey);
                  const TRUNCATE_LENGTH = 80;

                  return (
                    <tr
                      key={row.id}
                      className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-orange-50' : ''}`}
                    >
                      <td className="px-1.5 py-2">
                        <button
                          onClick={() => handleSelectRow(row.id)}
                          className="flex items-center justify-center"
                          type="button"
                        >
                          {isSelected ? (
                            <CheckSquare size={14} className="text-orange-600" />
                          ) : (
                            <Square size={14} className="text-slate-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-1 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isBooking
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                            }`}
                        >
                          {isBooking ? 'Booking' : 'User'}
                        </span>
                      </td>
                      <td className="px-1 py-2">
                        <div className="font-semibold text-slate-900 truncate text-sm" title={row.name}>{row.name}</div>
                      </td>
                      <td className="px-1 py-2">
                        <div className="text-slate-700 truncate text-xs" title={row.email}>{row.email}</div>
                      </td>
                      <td className="px-1 py-2">
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
                      <td className="px-1 py-2 text-slate-600 text-xs">{createdDate}</td>
                      <td className="px-1 py-2 text-slate-600 text-xs">
                        {isBooking ? scheduledDate : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-1 py-2">
                        {row.source ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-600 truncate max-w-full" title={row.source}>
                            {row.source}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-1 py-2">
                        {row.status ? (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[row.status]}`}
                          >
                            {statusLabels[row.status]}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-1.5 py-2">
                        {(() => {
                          const emailLower = row.email.toLowerCase();
                          const campaigns = userCampaigns.get(emailLower) || [];
                          const booking = isBooking && row.bookingId ? bookingsById.get(row.bookingId) : null;

                          return (
                            <div className="space-y-2 max-w-xs">
                              {/* Email Campaigns */}
                              <button
                                onClick={() => handleUserCampaignsClick(row.email)}
                                className="flex items-center gap-2 text-xs hover:bg-slate-50 rounded px-2 py-1 transition cursor-pointer w-full text-left border border-slate-200 hover:border-orange-300"
                                type="button"
                              >
                                <Mail className="text-orange-500" size={14} />
                                <span className="text-slate-700 font-semibold">
                                  {campaigns.length > 0 ? `${campaigns.length} campaign${campaigns.length > 1 ? 's' : ''}` : 'View Campaigns'}
                                </span>
                                <span className="text-slate-400 ml-auto">
                                  →
                                </span>
                              </button>

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
                      <td className="px-1.5 py-2">
                        <div className="space-y-1">
                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteClick(row)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition w-full justify-center"
                        >
                          <Trash2 size={11} />
                          Delete
                        </button>
                        {isBooking && row.bookingId ? (
                            <div className="flex flex-col gap-1">
                              {/* Follow-ups */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const booking = bookingsById.get(row.bookingId!);
                                    openEmailFollowUp(booking?.clientEmail || row.email, 'booking_followup');
                                  }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition flex-1 justify-center whitespace-nowrap"
                                >
                                  <Mail size={11} />
                                  Follow up
                                </button>
                                {onOpenWhatsAppCampaign ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const booking = bookingsById.get(row.bookingId!);
                                      openWhatsAppFollowUp(booking?.clientPhone || row.phone, 'booking_followup');
                                    }}
                                    disabled={!row.phone || row.phone === 'Not Specified'}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition disabled:opacity-60 disabled:cursor-not-allowed flex-1 justify-center whitespace-nowrap"
                                  >
                                    <MessageCircle size={11} />
                                    WhatsApp
                                  </button>
                                ) : null}
                              </div>
                              {/* Status Dropdown */}
                              <div className="relative status-dropdown-container">
                                <button
                                  onClick={() => setOpenStatusDropdown(openStatusDropdown === row.bookingId ? null : row.bookingId!)}
                                  disabled={updatingBookingId === row.bookingId}
                                  className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg text-xs font-semibold border transition disabled:opacity-60 w-full justify-center ${
                                    row.status ? statusColors[row.status] : 'text-slate-600 bg-slate-100'
                                  } border-current/20 hover:border-current/40`}
                                >
                                  {updatingBookingId === row.bookingId ? (
                                    <>
                                      <Loader2 className="animate-spin" size={14} />
                                      <span>Updating...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>{row.status ? statusLabels[row.status] : 'No Status'}</span>
                                      <ChevronDown size={12} className={`transition-transform duration-200 ${openStatusDropdown === row.bookingId ? 'rotate-180' : ''}`} />
                                    </>
                                  )}
                                </button>
                                
                                {openStatusDropdown === row.bookingId && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-10" 
                                      onClick={() => setOpenStatusDropdown(null)}
                                    />
                                    <div className="absolute left-full ml-1 top-0 z-20 w-52 bg-white rounded-lg shadow-xl border border-slate-200 py-1.5 overflow-hidden">
                                      <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                                        Change Status
                                      </div>
                                      {(['scheduled', 'completed', 'no-show', 'rescheduled', 'paid', 'canceled', 'ignored'] as BookingStatus[]).map((status) => {
                                        if (status === row.status) return null;
                                        const statusIcon = status === 'completed' ? CheckCircle2 : status === 'no-show' ? AlertTriangle : status === 'paid' ? DollarSign : status === 'rescheduled' ? Clock : status === 'canceled' ? X : status === 'ignored' ? X : Calendar;
                                        const StatusIcon = statusIcon;
                                        const isPaidOption = status === 'paid';
                                        const isPlanOpen = isPaidOption && planPickerFor === row.bookingId;
                                        return (
                                          <div key={status} className="border-b last:border-b-0 border-slate-100">
                                            <button
                                              onClick={() => {
                                                const booking = bookingsById.get(row.bookingId!);
                                                if (!booking) return;
                                                if (isPaidOption) {
                                                  setPlanPickerFor(row.bookingId!);
                                                  return;
                                                }
                                                setPlanPickerFor(null);
                                                handleStatusUpdate(booking.bookingId, status);
                                                setOpenStatusDropdown(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition flex items-center gap-2 group"
                                            >
                                              <StatusIcon size={14} className={`${status === 'completed' ? 'text-green-600' : status === 'no-show' ? 'text-rose-600' : status === 'rescheduled' ? 'text-amber-600' : status === 'paid' ? 'text-emerald-600' : status === 'canceled' ? 'text-red-600' : status === 'ignored' ? 'text-gray-600' : 'text-blue-600'}`} />
                                              <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">{statusLabels[status]}</span>
                                                {isPaidOption && <span className="text-[10px] text-slate-500">Select a plan</span>}
                                              </div>
                                            </button>
                                            {isPlanOpen && (
                                              <div className="px-3 pb-2 grid grid-cols-1 gap-1">
                                                {PLAN_OPTIONS.map((plan) => (
                                                  <button
                                                    key={plan.key}
                                                    onClick={() => {
                                                      const booking = bookingsById.get(row.bookingId!);
                                                      if (booking) {
                                                        handleStatusUpdate(booking.bookingId, 'paid', plan);
                                                        setOpenStatusDropdown(null);
                                                      }
                                                    }}
                                                    className="flex items-center justify-between w-full rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:border-emerald-200 hover:bg-emerald-100 transition"
                                                  >
                                                    <div className="flex flex-col text-left">
                                                      <span>{plan.label}</span>
                                                      <span className="text-[10px] font-medium text-emerald-700">{plan.displayPrice}</span>
                                                    </div>
                                                    <DollarSign size={14} className="text-emerald-600" />
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      <div className="border-t border-slate-200 my-0.5" />
                                      <button
                                        onClick={() => {
                                          const booking = bookingsById.get(row.bookingId!);
                                          if (booking) {
                                            handleReschedule(booking);
                                            setOpenStatusDropdown(null);
                                          }
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition flex items-center gap-2 text-amber-600 group"
                                      >
                                        <Clock size={14} />
                                        <span className="font-medium">Reschedule</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                              {row.paymentPlan && (
                                <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                  <DollarSign size={12} className="text-emerald-600" />
                                  <span>{row.paymentPlan.name}</span>
                                  <span className="text-emerald-700">{row.paymentPlan.displayPrice || `$${row.paymentPlan.price}`}</span>
                                </div>
                              )}
                              {row.status === 'paid' && (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={row.paymentPlan?.name || ''}
                                    onChange={(e) => {
                                      const plan = getPlanOptionByName(e.target.value);
                                      const booking = bookingsById.get(row.bookingId!);
                                      if (plan && booking) {
                                        handleStatusUpdate(booking.bookingId, 'paid', plan);
                                      }
                                    }}
                                    disabled={updatingBookingId === row.bookingId}
                                    className="flex-1 text-xs border border-emerald-200 rounded-lg px-2 py-1 bg-emerald-50 text-emerald-800"
                                  >
                                    <option value="">Select plan</option>
                                    {PLAN_OPTIONS.map((plan) => (
                                      <option key={plan.key} value={plan.key}>
                                        {plan.label} ({plan.displayPrice})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {/* Join and Take Notes */}
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
                              </div>
                              {/* No-Show Follow-up Actions */}
                              {row.status === 'no-show' && (
                                <div className="flex items-center gap-2">
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
                                        openEmailFollowUp(booking.clientEmail, 'no_show_followup');
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-blue-300 text-blue-600 hover:bg-blue-50 transition flex-1 justify-center whitespace-nowrap"
                                  >
                                    <Mail size={14} />
                                    Follow up
                                  </button>
                                </div>
                              )}
                            </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => {
                              onOpenEmailCampaign({
                                recipients: [row.email],
                                reason: 'user_without_booking',
                              });
                            }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 transition w-full justify-center"
                          >
                            <Mail size={12} />
                              Email
                            </button>
                            {onOpenWhatsAppCampaign && row.phone && row.phone !== 'Not Specified' && (
                              <button
                                onClick={() => {
                                  const phone = row.phone!.replace(/[^\d+]/g, '');
                                  if (phone) {
                                    onOpenWhatsAppCampaign({
                                      mobileNumbers: [phone],
                                      reason: 'user_without_booking',
                                    });
                                  } else {
                                    alert('Invalid phone number');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition w-full justify-center"
                              >
                                <MessageCircle size={12} />
                                WhatsApp
                          </button>
                            )}
                          </div>
                        )}
                        </div>
                        {row.notes && (
                          <div className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-1 border border-slate-200 mt-1">
                            <span className="font-semibold text-slate-600">Calendly Notes:</span>{' '}
                            {isCalendlyNoteExpanded || row.notes.length <= TRUNCATE_LENGTH ? (
                              <span>{row.notes}</span>
                            ) : (
                              <span>{row.notes.substring(0, TRUNCATE_LENGTH)}...</span>
                            )}
                            {row.notes.length > TRUNCATE_LENGTH && (
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedNotes);
                                  if (isCalendlyNoteExpanded) {
                                    newExpanded.delete(calendlyNoteKey);
                                  } else {
                                    newExpanded.add(calendlyNoteKey);
                                  }
                                  setExpandedNotes(newExpanded);
                                }}
                                className="ml-1 text-orange-600 hover:text-orange-700 font-semibold underline"
                              >
                                {isCalendlyNoteExpanded ? 'Less' : 'More'}
                              </button>
                            )}
                          </div>
                        )}
                        {row.meetingNotes && (
                          <div className="text-xs text-slate-500 bg-yellow-50 rounded px-1.5 py-1 border border-yellow-200 mt-1">
                            <span className="font-semibold text-slate-600">Meeting Notes:</span>{' '}
                            {isMeetingNoteExpanded || row.meetingNotes.length <= TRUNCATE_LENGTH ? (
                              <span>{row.meetingNotes}</span>
                            ) : (
                              <span>{row.meetingNotes.substring(0, TRUNCATE_LENGTH)}...</span>
                            )}
                            {row.meetingNotes.length > TRUNCATE_LENGTH && (
                              <button
                                onClick={() => {
                                  const newExpanded = new Set(expandedNotes);
                                  if (isMeetingNoteExpanded) {
                                    newExpanded.delete(meetingNoteKey);
                                  } else {
                                    newExpanded.add(meetingNoteKey);
                                  }
                                  setExpandedNotes(newExpanded);
                                }}
                                className="ml-1 text-orange-600 hover:text-orange-700 font-semibold underline"
                              >
                                {isMeetingNoteExpanded ? 'Less' : 'More'}
                              </button>
                            )}
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
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
        <div className="text-sm text-slate-600">
          {showMeetingsToday ? (
            <>Showing {meetingsBookedTodayCount} meetings booked today</>
          ) : typeFilter === 'all' ? (
            <>Showing {filteredData.length} rows (Page {bookingsPage} of {bookingsPagination.pages} bookings, Page {usersPage} of {usersPagination.pages} users)</>
          ) : typeFilter === 'booking' ? (
            <>Showing {filteredData.length} of {bookingsPagination.total} bookings (Page {bookingsPage} of {bookingsPagination.pages})</>
          ) : (
            <>Showing {filteredData.length} of {usersPagination.total} users (Page {usersPage} of {usersPagination.pages})</>
          )}
        </div>

        {!showMeetingsToday && (
          <div className="flex items-center gap-2">
            {(typeFilter === 'booking' || typeFilter === 'all') && bookingsPagination.pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newPage = Math.max(1, bookingsPage - 1);
                    setBookingsPage(newPage);
                    fetchBookings(newPage);
                  }}
                  disabled={bookingsPage === 1}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} className="inline" />
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, bookingsPagination.pages) }, (_, i) => {
                    let pageNum;
                    if (bookingsPagination.pages <= 5) {
                      pageNum = i + 1;
                    } else if (bookingsPage <= 3) {
                      pageNum = i + 1;
                    } else if (bookingsPage >= bookingsPagination.pages - 2) {
                      pageNum = bookingsPagination.pages - 4 + i;
                    } else {
                      pageNum = bookingsPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => {
                          setBookingsPage(pageNum);
                          fetchBookings(pageNum);
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                          bookingsPage === pageNum
                            ? 'bg-orange-500 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const newPage = Math.min(bookingsPagination.pages, bookingsPage + 1);
                    setBookingsPage(newPage);
                    fetchBookings(newPage);
                  }}
                  disabled={bookingsPage === bookingsPagination.pages}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={16} className="inline" />
                </button>
              </div>
            )}

            {(typeFilter === 'user' || typeFilter === 'all') && usersPagination.pages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newPage = Math.max(1, usersPage - 1);
                    setUsersPage(newPage);
                    fetchUsers(newPage);
                  }}
                  disabled={usersPage === 1}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} className="inline" />
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, usersPagination.pages) }, (_, i) => {
                    let pageNum;
                    if (usersPagination.pages <= 5) {
                      pageNum = i + 1;
                    } else if (usersPage <= 3) {
                      pageNum = i + 1;
                    } else if (usersPage >= usersPagination.pages - 2) {
                      pageNum = usersPagination.pages - 4 + i;
                    } else {
                      pageNum = usersPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => {
                          setUsersPage(pageNum);
                          fetchUsers(pageNum);
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                          usersPage === pageNum
                            ? 'bg-orange-500 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    const newPage = Math.min(usersPagination.pages, usersPage + 1);
                    setUsersPage(newPage);
                    fetchUsers(newPage);
                  }}
                  disabled={usersPage === usersPagination.pages}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight size={16} className="inline" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
      {/* Follow-Up Modal */}
      {selectedBookingForFollowUp && (
        <FollowUpModal
          isOpen={isFollowUpModalOpen}
          onClose={() => {
            setIsFollowUpModalOpen(false);
            setSelectedBookingForFollowUp(null);
          }}
          onSchedule={handleScheduleFollowUp}
          clientName={selectedBookingForFollowUp.clientName}
          clientEmail={selectedBookingForFollowUp.clientEmail}
          clientPhone={selectedBookingForFollowUp.clientPhone}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedUserForDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !deletingUser && setIsDeleteModalOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-red-100 p-3 rounded-full">
                  <AlertCircle className="text-red-600" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Delete User Records</h3>
              </div>
              
              <p className="text-slate-600 mb-6">
                Are you sure you want to delete all records for this user? This action cannot be undone.
              </p>

              <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Name:</span>
                  <span className="text-sm text-slate-900">{selectedUserForDelete.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Email:</span>
                  <span className="text-sm text-slate-900">{selectedUserForDelete.email}</span>
                </div>
                {selectedUserForDelete.phone && selectedUserForDelete.phone !== 'Not Specified' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Mobile:</span>
                    <span className="text-sm text-slate-900">{selectedUserForDelete.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setSelectedUserForDelete(null);
                  }}
                  disabled={deletingUser}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deletingUser}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deletingUser ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Confirm Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

