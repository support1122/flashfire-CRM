import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Loader2,
  Mail,
  RefreshCcw,
  Search,
  ExternalLink,
  CheckSquare,
  Square,
  Send,
  Edit,
  MessageCircle,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Calendar,
  ChevronDown,
  AlertCircle,
  Info,
  Trash2,
} from 'lucide-react';
import {
  format,
  parseISO,
} from 'date-fns';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';
import NotesModal from './NotesModal';
import FollowUpModal, { type FollowUpData } from './FollowUpModal';
import PlanDetailsModal, { type PlanDetailsData } from './PlanDetailsModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

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
  scheduled: 'text-orange-600 w-fit bg-orange-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-rose-700 w-fit bg-rose-50',
  rescheduled: 'text-amber-600 bg-amber-50',
  'no-show': 'text-rose-600 bg-rose-50',
  ignored: 'text-slate-600 bg-slate-100',
  paid: 'text-teal-700 bg-teal-50',
};

type BookingStatus = 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show' | 'ignored' | 'paid';

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
  paymentPlan?: PaymentPlan;
  meetingNotes?: string;
  anythingToKnow?: string;
  totalBookings?: number;
  claimedBy?: {
    email: string;
    name: string;
    claimedAt: string;
  };
}

interface LeadsViewProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
  onOpenWhatsAppCampaign?: (payload: WhatsAppPrefillPayload) => void;
}

export default function LeadsView({ onOpenEmailCampaign, onOpenWhatsAppCampaign }: LeadsViewProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [planFilter, setPlanFilter] = useState<PlanName | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [utmFilter, setUtmFilter] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [planPickerFor, setPlanPickerFor] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsPagination, setBookingsPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [planBreakdown, setPlanBreakdown] = useState<Array<{ _id: string; count: number; revenue: number }>>([]);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [selectedBookingForNotes, setSelectedBookingForNotes] = useState<{ id: string; name: string; notes: string } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLeadForDelete, setSelectedLeadForDelete] = useState<{ name: string; email: string; phone?: string } | null>(null);
  const [deletingLead, setDeletingLead] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [selectedBookingForFollowUp, setSelectedBookingForFollowUp] = useState<Booking | null>(null);
  const [isPlanDetailsModalOpen, setIsPlanDetailsModalOpen] = useState(false);
  const [selectedBookingForPlanDetails, setSelectedBookingForPlanDetails] = useState<{ bookingId: string; status: BookingStatus; booking: Booking } | null>(null);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState<{ bookingId: string; status: BookingStatus; plan?: PlanOption } | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const statusDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const safeJsonParse = async (response: Response) => {
    if (!response.ok) {
      const text = await response.text();
      try {
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || `Server error: ${response.status}`);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message.includes('Server error')) {
          throw parseErr;
        }
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response received:', text.substring(0, 200));
      throw new Error('Server returned non-JSON response. Please check the API endpoint.');
    }

    return await response.json();
  };

  const fetchLeads = useCallback(async (page: number = 1) => {
    try {
      setRefreshing(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });

      if (utmFilter !== 'all') {
        params.append('utmSource', utmFilter);
      }
      if (planFilter !== 'all') {
        params.append('planName', planFilter);
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
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
      if (minAmount) {
        params.append('minAmount', minAmount);
      }
      if (maxAmount) {
        params.append('maxAmount', maxAmount);
      }

      const response = await fetch(`${API_BASE_URL}/api/leads/paginated?${params}`);
      const data = await safeJsonParse(response);

      if (data.success) {
        setBookings(data.data);
        setBookingsPagination(data.pagination);
        setBookingsPage(page);
        if (data.stats) {
          setTotalRevenue(data.stats.totalRevenue || 0);
          setPlanBreakdown(data.stats.planBreakdown || []);
        }
      } else {
        throw new Error(data.message || 'Failed to fetch leads');
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [planFilter, statusFilter, utmFilter, search, fromDate, toDate, minAmount, maxAmount]);

  // Debounce search input to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 and fetch when filters change
  useEffect(() => {
    const page = 1;
    setBookingsPage(page);
    fetchLeads(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planFilter, statusFilter, utmFilter, search, fromDate, toDate, minAmount, maxAmount]);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    bookings.forEach((booking) => sources.add(booking.utmSource || 'direct'));
    return Array.from(sources).sort();
  }, [bookings]);

  const filteredData = useMemo(() => {
    return bookings.map((booking) => {
      // Use phone number for ID if available, otherwise use email
      // This ensures proper grouping when phone numbers are normalized
      const idKey = booking.clientPhone && booking.clientPhone !== 'Not Specified'
        ? booking.clientPhone.replace(/\D/g, '').slice(-10) // Last 10 digits for matching
        : booking.clientEmail;

      return {
        id: `lead-${idKey}`,
        type: 'lead' as const,
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
        totalBookings: booking.totalBookings || 1,
        claimedBy: booking.claimedBy,
      };
    }).filter((row) => {
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
  }, [bookings]);

  // Calculate status statistics from filtered data (unique leads only)
  const statusStats = useMemo(() => {
    const stats = {
      scheduled: 0,
      completed: 0,
      canceled: 0,
      'no-show': 0,
      rescheduled: 0,
      ignored: 0,
      paid: 0,
    };

    filteredData.forEach((lead) => {
      if (lead.status && stats.hasOwnProperty(lead.status)) {
        stats[lead.status as keyof typeof stats]++;
      }
    });

    const total = filteredData.length;
    const booked = stats.scheduled + stats.rescheduled; // Booked includes scheduled and rescheduled

    return {
      booked,
      completed: stats.completed,
      canceled: stats.canceled,
      noShow: stats['no-show'],
      rescheduled: stats.rescheduled,
      ignored: stats.ignored,
      paid: stats.paid,
      total,
    };
  }, [filteredData]);

  // Format date range for display
  const dateRangeDisplay = useMemo(() => {
    if (!fromDate && !toDate) return null;

    const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      try {
        // Handle YYYY-MM-DD format from date inputs
        const date = parseISO(dateStr + 'T00:00:00');
        return format(date, 'MMMM d, yyyy');
      } catch {
        return dateStr;
      }
    };

    if (fromDate && toDate) {
      return `${formatDate(fromDate)} to ${formatDate(toDate)}`;
    } else if (fromDate) {
      return `From ${formatDate(fromDate)}`;
    } else if (toDate) {
      return `Until ${formatDate(toDate)}`;
    }
    return null;
  }, [fromDate, toDate]);

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
        if (row.phone && row.phone !== 'Not Specified') {
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

  const bookingsById = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((booking) => {
      map.set(booking.bookingId, booking);
    });
    return map;
  }, [bookings]);

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus, plan?: PlanOption) => {
    try {
      setUpdatingBookingId(bookingId);

      // Check if workflows need plan details for this status (fail gracefully if endpoint doesn't exist)
      try {
        const checkResponse = await fetch(`${API_BASE_URL}/api/workflows/check-plan-details?action=${status}`);
        const checkData = await safeJsonParse(checkResponse);

        if (checkData.success && checkData.needsPlanDetails) {
          // Store pending status update and show plan details modal
          const booking = bookings.find(b => b.bookingId === bookingId);
          if (booking) {
            setPendingStatusUpdate({ bookingId, status, plan });
            setSelectedBookingForPlanDetails({
              bookingId,
              status,
              booking,
            });
            setIsPlanDetailsModalOpen(true);
            setUpdatingBookingId(null);
            setPlanPickerFor(null);
            setOpenStatusDropdown(null);
            return;
          }
        }
      } catch (checkErr) {
        // If workflow check fails, log but continue with status update
        console.warn('Workflow check failed, proceeding with status update:', checkErr);
      }

      // If no plan details needed, proceed with status update
      await performStatusUpdate(bookingId, status, plan);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to update booking status', 'error');
      setUpdatingBookingId(null);
      setPlanPickerFor(null);
      setOpenStatusDropdown(null);
    }
  };

  const performStatusUpdate = async (bookingId: string, status: BookingStatus, plan?: PlanOption, planDetails?: PlanDetailsData) => {
    try {
      setUpdatingBookingId(bookingId);

      // Use planDetails if provided, otherwise use plan
      const planPayload = planDetails
        ? {
          name: planDetails.planName as PlanName,
          price: planDetails.planAmount,
          currency: 'USD',
          displayPrice: `$${planDetails.planAmount}`,
        }
        : plan
          ? {
            name: plan.key,
            price: plan.price,
            currency: plan.currency || 'USD',
            displayPrice: plan.displayPrice,
          }
          : undefined;

      const requestBody: any = {
        status,
      };

      if (planPayload) {
        requestBody.plan = planPayload;
      }

      // If planDetails provided, also send days for finalkk template
      if (planDetails) {
        requestBody.planDetails = {
          days: planDetails.days,
        };
      }

      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const data = await safeJsonParse(response);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update booking status');
      }
      const updatedBooking = data.data as Booking | undefined;

      // Update local bookings state and prepare updated booking for follow-up modal
      let updatedBookingForFollowUp: Booking | null = null;
      setBookings((prev) => {
        return prev.map((booking) => {
          if (booking.bookingId === bookingId) {
            const updated = {
              ...booking,
              bookingStatus: status,
              paymentPlan: updatedBooking?.paymentPlan || planPayload || booking.paymentPlan,
            };
            if (status === 'completed') {
              updatedBookingForFollowUp = updated;
            }
            return updated;
          }
          return booking;
        });
      });

      // Show toast notification if workflow was triggered
      if (data.workflowTriggered) {
        showToast(`Workflow triggered for ${status} action`, 'success');
      }

      if (status === 'completed' && updatedBookingForFollowUp) {
        setSelectedBookingForFollowUp(updatedBookingForFollowUp);
        setIsFollowUpModalOpen(true);
      }

      await fetchLeads(bookingsPage);
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Failed to update booking status', 'error');
    } finally {
      setUpdatingBookingId(null);
      setPlanPickerFor(null);
      setOpenStatusDropdown(null);
    }
  };

  const handlePlanDetailsSave = async (planDetails: PlanDetailsData) => {
    if (!pendingStatusUpdate) return;

    await performStatusUpdate(
      pendingStatusUpdate.bookingId,
      pendingStatusUpdate.status,
      pendingStatusUpdate.plan,
      planDetails
    );

    setPendingStatusUpdate(null);
    setSelectedBookingForPlanDetails(null);
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

      const data = await safeJsonParse(response);
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

  const handleUpdateAmount = async (bookingId: string, amount: number, planName: PlanName) => {
    try {
      setUpdatingBookingId(bookingId);
      const response = await fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/amount`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          planName,
        }),
      });
      const data = await safeJsonParse(response);
      if (!data.success) {
        throw new Error(data.message || 'Failed to update amount');
      }
      await fetchLeads(bookingsPage);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update amount');
    } finally {
      setUpdatingBookingId(null);
    }
  };

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
    if (!openStatusDropdown) {
      setPlanPickerFor(null);
    }
  }, [openStatusDropdown]);

  const scrollDropdownIntoView = useCallback((bookingId: string) => {
    requestAnimationFrame(() => {
      const container = statusDropdownRefs.current[bookingId];
      if (!container) return;

      const dropdownPanel = container.querySelector('.status-dropdown-panel') as HTMLElement | null;
      const target = dropdownPanel || container;
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    if (openStatusDropdown) {
      scrollDropdownIntoView(openStatusDropdown);
    }
  }, [openStatusDropdown, scrollDropdownIntoView]);

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
      const data = await safeJsonParse(response);
      if (!data.success) {
        throw new Error(data.message || 'Failed to save notes');
      }
      await fetchLeads(bookingsPage);
      setIsNotesModalOpen(false);
      setSelectedBookingForNotes(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteClick = (row: { name: string; email: string; phone?: string }) => {
    setSelectedLeadForDelete({
      name: row.name,
      email: row.email,
      phone: row.phone
    });
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedLeadForDelete) return;

    setDeletingLead(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/delete/${encodeURIComponent(selectedLeadForDelete.email)}`, {
        method: 'DELETE',
      });

      const data = await safeJsonParse(response);

      if (data.success) {
        showToast(`Successfully deleted all records for ${selectedLeadForDelete.name}`, 'success');
        await fetchLeads(bookingsPage);
        setIsDeleteModalOpen(false);
        setSelectedLeadForDelete(null);
      } else {
        showToast(data.message || 'Failed to delete lead records', 'error');
      }
    } catch (err) {
      console.error('Error deleting lead records:', err);
      showToast('Failed to delete lead records. Please try again.', 'error');
    } finally {
      setDeletingLead(false);
    }
  };

  if (loading && bookings.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-white ">
      <div className="bg-gray-50 border border-slate-200  px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="text-center md:text-left space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Unified Data</p>
            <h1 className="text-3xl font-bold text-slate-900">Leads</h1>
            <p className="text-slate-600 max-w-2xl">
              View and manage all clients. Each client appears once with their latest booking status. Status and amount are editable.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex-1 min-w-[180px] bg-orange-50 border border-orange-100  px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">Total Leads</p>
              <p className="text-2xl font-bold text-slate-900">{bookingsPagination.total.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Across all sources</p>
            </div>
            <div className="flex-1 min-w-[180px] bg-slate-50 border border-slate-100  px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Currently Showing</p>
              <p className="text-2xl font-bold text-slate-900">{filteredData.length.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">After active filters</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status Statistics - Show when date filters are selected */}
      {dateRangeDisplay && (
        <div className="bg-white border border-slate-200  p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Meetings from {dateRangeDisplay}
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-slate-600 text-[11px] font-medium">Booked</span>
              <span className="text-lg font-bold text-orange-600">{statusStats.booked}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-slate-600 text-[11px] font-medium">Cancelled</span>
              <span className="text-lg font-bold text-rose-700">{statusStats.canceled}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-slate-600 text-[11px] font-medium">No-Show</span>
              <span className="text-lg font-bold text-rose-600">{statusStats.noShow}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-slate-600 text-[11px] font-medium">Completed</span>
              <span className="text-lg font-bold text-emerald-700">{statusStats.completed}</span>
            </div>
            <div className="flex items-baseline gap-2 ml-auto">
              <span className="text-slate-500 text-[11px] font-medium">Total:</span>
              <span className="text-lg font-bold text-slate-700">{statusStats.total}</span>
            </div>
          </div>
        </div>
      )}

      {totalRevenue > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 border border-slate-200  p-4">
            <div className="text-[11px] text-slate-500 font-semibold mb-1">Total Revenue</div>
            <div className="text-2xl font-bold text-black">${totalRevenue.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-1">From {bookingsPagination.total} lead{bookingsPagination.total !== 1 ? 's' : ''}</div>
          </div>
          {planBreakdown.map((plan) => (
            <div key={plan._id} className="bg-gray-50 border border-slate-200  p-4">
              <div className="text-[11px] text-slate-500 font-semibold mb-1">{plan._id || 'Unknown'}</div>
              <div className="text-lg font-bold text-slate-900">{plan.count} lead{plan.count !== 1 ? 's' : ''}</div>
              <div className="text-[11px] text-gray-500">${plan.revenue.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-orange-50 border border-orange-200  p-4 text-orange-700">
          {error}
        </div>
      )}

      {selectedRows.size > 0 && (
        <div className="bg-orange-50 border border-orange-200  px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-orange-900">
            {selectedRows.size} row{selectedRows.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            {onOpenWhatsAppCampaign && (
              <button
                onClick={handleBulkWhatsApp}
                className="inline-flex items-center gap-2 px-4 py-2 border border-teal-200 text-teal-700 rounded-lg bg-white hover:bg-teal-50 transition text-[11px] font-semibold"
              >
                <MessageCircle size={16} />
                Send WhatsApp ({selectedRows.size})
              </button>
            )}
            <button
              onClick={handleBulkEmail}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-[11px] font-semibold"
            >
              <Send size={16} />
              Send Email ({selectedRows.size})
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-slate-200  px-5 py-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 border border-slate-200  px-3 py-2 flex-1 min-w-[220px]">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone, or source…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-[11px] bg-transparent focus:outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BookingStatus | 'all')}
            className="text-[11px] border border-slate-200  px-3 py-2 bg-white"
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
            className="text-[11px] border border-slate-200  px-3 py-2 bg-white"
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
            className="text-[11px] border border-slate-200 px-3 py-2 bg-white min-w-[160px]"
          >
            <option value="all">All sources</option>
            {uniqueSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-slate-200 px-3 py-2 bg-white"
            />
            <span>—</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-slate-200  px-3 py-2 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min $"
              value={minAmount}    
              onChange={(e) => setMinAmount(e.target.value)}
              className="border border-slate-200 px-3 py-2 bg-white w-24"
            />
            <span>—</span>
            <input
              type="number"
              placeholder="Max $"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="border border-slate-200 px-3 py-2 bg-white w-24"
            />
          </div>
          {(fromDate || toDate || searchInput || planFilter !== 'all' || utmFilter !== 'all' || statusFilter !== 'all' || minAmount || maxAmount) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
                setPlanFilter('all');
                setUtmFilter('all');
                setStatusFilter('all');
                setSearchInput('');
                setSearch('');
                setMinAmount('');
                setMaxAmount('');
                setBookingsPage(1);
              }}
              className="text-[11px] text-orange-600 font-semibold px-3 py-2  hover:bg-orange-50 transition"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={() => fetchLeads(bookingsPage)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700  hover:bg-slate-200 transition text-[11px] font-semibold disabled:opacity-60"
          >
            <RefreshCcw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>
 
      <div className="overflow-hidden bg-white border border-slate-200">
        
          <table className="w-full text-[10px] table-auto border-separate border-spacing-y-1 border-spacing-x-0.5">
            <thead className=" sticky top-0 z-10">
              <tr className="text-left bg-gray-100 text-slate-500">
                <th className="px-1 py-1.5 font-semibold w-8">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center justify-center"
                    type="button"
                    title="Select All"
                  >
                    {selectedRows.size === filteredData.length && filteredData.length > 0 ? (
                      <CheckSquare size={11} className="text-orange-600" />
                    ) : (
                      <Square size={11} className="text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-10">Type</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-20">Name</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-24">Email</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-20">Phone</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-20">Meeting</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-14">Source</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-14">Status</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-16">Amount</th>
                <th className="px-1 py-1.5 font-semibold text-[10px] w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row) => {
                const scheduledDate = row.scheduledTime
                  ? format(parseISO(row.scheduledTime), 'MMM d, yyyy • h:mm a')
                  : 'Not scheduled';
                const isSelected = selectedRows.has(row.id);
                const calendlyNoteKey = `calendly-${row.id}`;
                const meetingNoteKey = `meeting-${row.id}`;
                const isCalendlyNoteExpanded = expandedNotes.has(calendlyNoteKey);
                const isMeetingNoteExpanded = expandedNotes.has(meetingNoteKey);
                const TRUNCATE_LENGTH = 80;

                const isClaimed = row.claimedBy && row.claimedBy.email;

                return (
                  <tr
                    key={row.id}
                    className={`transition rounded-xl border ${isSelected
                        ? 'bg-orange-50 border-orange-200 shadow-sm'
                        : isClaimed
                          ? 'bg-white border-l-4 border-l-orange-300 border-slate-200 shadow'
                          : 'bg-white border-slate-200 shadow'
                      }`}
                  >
                    <td className="px-1 py-1.5">
                      <button
                        onClick={() => handleSelectRow(row.id)}
                        className="flex items-center justify-center"
                        type="button"
                        title={isSelected ? "Deselect" : "Select"}
                      >
                        {isSelected ? (
                          <CheckSquare size={11} className="text-orange-600" />
                        ) : (
                          <Square size={11} className="text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex w-fit items-center text-[11px] px-1 py-0.5 font-semibold bg-orange-50 text-orange-700 rounded">
                          Lead
                        </span>
                        {isClaimed && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded-full text-[9px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                            Claimed
                          </span>
                        )}
                        {row.totalBookings && row.totalBookings > 1 && (
                          <span className="text-xs text-slate-500">
                            {row.totalBookings} bookings
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="font-semibold text-slate-900 truncate text-[10px]" title={row.name}>{row.name}</div>
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="text-slate-700 truncate text-[9px]" title={row.email}>{row.email}</div>
                    </td>
                    <td className="px-1 py-1.5">
                      {row.phone && row.phone !== 'Not Specified' ? (
                        <a
                          href={`tel:${row.phone}`}
                          className="text-[9px] text-gray-600 font-semibold hover:text-gray-700 truncate block"
                          title={row.phone}
                        >
                          {row.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-[9px]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="text-slate-600 text-[9px]">
                        <div className="font-semibold truncate" title={scheduledDate}>
                          {row.scheduledTime ? format(parseISO(row.scheduledTime), 'MMM d, h:mm a') : 'Not scheduled'}
                        </div>
                        {row.totalBookings && row.totalBookings > 1 && (
                          <div className="text-slate-400 mt-0.5 text-[8px]">{row.totalBookings} b</div>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      {row.source ? (
                        <span className="inline-flex items-center px-1 py-0.5 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 truncate max-w-full" title={row.source}>
                          {row.source}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[9px]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1.5">
                      <div
                        className="relative status-dropdown-container"
                        ref={(el) => {
                          if (!row.bookingId) return;
                          if (el) {
                            statusDropdownRefs.current[row.bookingId] = el;
                          } else {
                            delete statusDropdownRefs.current[row.bookingId];
                          }
                        }}
                      >
                        <button
                          onClick={() => setOpenStatusDropdown(openStatusDropdown === row.bookingId ? null : row.bookingId!)}
                          disabled={updatingBookingId === row.bookingId}
                          className={`inline-flex items-center gap-0.5 px-1 py-0.5 w-fit rounded text-[9px] font-semibold border transition disabled:opacity-60 w-full justify-center ${row.status ? statusColors[row.status] : 'text-slate-600 bg-slate-100'
                            } border-current/20 hover:border-current/40`}
                          title={row.status ? statusLabels[row.status] : 'No Status'}
                        >
                          {updatingBookingId === row.bookingId ? (
                            <>
                              <Loader2 className="animate-spin" size={9} />
                              <span className="text-[8px]">Updating...</span>
                            </>
                          ) : (
                            <>
                              <span className="truncate">{row.status ? statusLabels[row.status] : 'No Status'}</span>
                              <ChevronDown size={8} className={`transition-transform duration-200 flex-shrink-0 ${openStatusDropdown === row.bookingId ? 'rotate-180' : ''}`} />
                            </>
                          )}
                        </button>

                        {openStatusDropdown === row.bookingId && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenStatusDropdown(null)}
                            />
                            <div className="status-dropdown-panel absolute left-full ml-1 top-0 z-20 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 overflow-hidden max-h-[350px] overflow-y-auto">
                              <div className="px-2 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 sticky top-0 bg-white">
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
                                      className="w-full text-left px-2 py-1 text-[9px] hover:bg-slate-50 transition flex items-center gap-1.5 group"
                                    >
                                      <StatusIcon size={11} className={`${status === 'completed' ? 'text-emerald-600' : status === 'no-show' ? 'text-rose-600' : status === 'rescheduled' ? 'text-amber-600' : status === 'paid' ? 'text-teal-600' : status === 'canceled' ? 'text-rose-700' : status === 'ignored' ? 'text-slate-500' : 'text-orange-600'}`} />
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-medium">{statusLabels[status]}</span>
                                        {isPaidOption && <span className="text-[8px] text-slate-500">Select a plan</span>}
                                      </div>
                                    </button>
                                    {isPlanOpen && (
                                      <div className="px-2 pb-1.5 grid grid-cols-1 gap-0.5">
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
                                            className="flex items-center justify-between w-full rounded border border-orange-100 bg-orange-50 px-1.5 py-0.5 text-[9px] font-semibold text-orange-800 hover:border-orange-200 hover:bg-orange-100 transition"
                                          >
                                            <div className="flex flex-col text-left">
                                              <span>{plan.label}</span>
                                              <span className="text-[8px] inline-flex w-fit items-center px-1.5 py-0.5 font-medium text-orange-700">{plan.displayPrice}</span>
                                            </div>
                                            <DollarSign size={11} className="text-orange-600" />
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      {row.paymentPlan ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center w-fit gap-0.5 rounded border border-orange-100 bg-orange-50 px-1 py-0.5 text-[9px] font-semibold text-orange-800">
                            <DollarSign size={8} className="text-orange-600 flex-shrink-0" />
                            <span className="truncate text-[8px]">{row.paymentPlan.name}</span>
                            <span className="text-orange-700 truncate text-[8px]">{row.paymentPlan.displayPrice || `$${row.paymentPlan.price}`}</span>
                          </div>
                          {row.status === 'paid' && (
                            <>
                              <select
                                value={row.paymentPlan.name}
                                onChange={(e) => {
                                  const plan = PLAN_OPTIONS.find(p => p.key === e.target.value);
                                  if (plan && row.bookingId) {
                                    handleUpdateAmount(row.bookingId, plan.price, plan.key);
                                  }
                                }}
                                disabled={updatingBookingId === row.bookingId}
                                className="w-full text-[9px] border border-orange-200 rounded px-1 py-0.5 bg-orange-50 text-orange-800"
                                title={row.paymentPlan.name}
                              >
                                {PLAN_OPTIONS.map((plan) => (
                                  <option key={plan.key} value={plan.key}>
                                    {plan.label} ({plan.displayPrice})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                placeholder="Custom $"
                                defaultValue={row.paymentPlan.price}
                                onBlur={(e) => {
                                  const amount = parseFloat(e.target.value);
                                  if (!isNaN(amount) && amount > 0 && row.bookingId && row.paymentPlan) {
                                    handleUpdateAmount(row.bookingId, amount, row.paymentPlan.name);
                                  }
                                }}
                                disabled={updatingBookingId === row.bookingId}
                                className="w-full text-[9px] border border-slate-200 rounded px-1 py-0.5 bg-white"
                              />
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[9px]">—</span>
                      )}
                    </td>
                    <td className="px-1 py-1.5">
                      <div className="flex items-center gap-0.5 flex-nowrap min-w-fit">
                        {row.meetLink && (
                          <a
                            href={row.meetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Join Meeting"
                            className="inline-flex items-center justify-center p-0.5 rounded border border-slate-200 bg-white hover:border-orange-400 hover:text-orange-600 transition flex-shrink-0"
                          >
                            <ExternalLink size={9} />
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
                          title="Edit Notes"
                          className="inline-flex items-center justify-center p-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition flex-shrink-0"
                        >
                          <Edit size={9} />
                        </button>
                        <button
                          onClick={() => {
                            onOpenEmailCampaign({
                              recipients: [row.email],
                              reason: 'lead_followup',
                            });
                          }}
                          title="Send Email"
                          className="inline-flex items-center justify-center p-0.5 rounded bg-orange-500 text-white hover:bg-orange-600 transition flex-shrink-0"
                        >
                          <Mail size={9} />
                        </button>
                        {onOpenWhatsAppCampaign && row.phone && row.phone !== 'Not Specified' && (
                          <button
                            onClick={() => {
                              const phone = row.phone!.replace(/[^\d+]/g, '');
                              if (phone) {
                                onOpenWhatsAppCampaign({
                                  mobileNumbers: [phone],
                                  reason: 'lead_followup',
                                });
                              }
                            }}
                            title="Send WhatsApp"
                            className="inline-flex items-center justify-center p-0.5 rounded border border-teal-200 text-teal-700 bg-white hover:bg-teal-50 transition flex-shrink-0"
                          >
                            <MessageCircle size={9} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteClick(row)}
                          title="Delete Lead"
                          className="inline-flex items-center justify-center p-0.5 rounded bg-rose-500 text-white hover:bg-rose-600 transition flex-shrink-0"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                      {row.notes && (
                        <div className="text-[9px] text-slate-500 bg-slate-100 rounded px-1 py-0.5 border border-slate-200 mt-1">
                          <span className="font-semibold text-slate-600">Calendly:</span>{' '}
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
                              className="ml-1 text-orange-600 hover:text-orange-700 font-semibold underline text-[9px]"
                            >
                              {isCalendlyNoteExpanded ? 'Less' : 'More'}
                            </button>
                          )}
                        </div>
                      )}
                      {row.meetingNotes && (
                        <div className="text-[9px] text-slate-500 bg-yellow-50 rounded px-1 py-0.5 border border-yellow-200 mt-1">
                          <span className="font-semibold text-slate-600">Meeting:</span>{' '}
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
                              className="ml-1 text-orange-600 hover:text-orange-700 font-semibold underline text-[9px]"
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
                  <td colSpan={10} className="text-center py-8 text-[10px] text-slate-500">
                    No leads found. Try adjusting the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50">
          <div className="text-[10px] text-slate-600">
            {bookingsPagination.pages > 1 ? (
              <>Page {bookingsPagination.page} of {bookingsPagination.pages} • </>
            ) : null}
            Total unique leads: <span className="font-semibold text-slate-900">{bookingsPagination.total}</span>
          </div>
          {bookingsPagination.pages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const newPage = bookingsPage - 1;
                  if (newPage >= 1) {
                    fetchLeads(newPage);
                  }
                }}
                disabled={bookingsPage === 1}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} />
                Previous
              </button>
              <button
                onClick={() => {
                  const newPage = bookingsPage + 1;
                  if (newPage <= bookingsPagination.pages) {
                    fetchLeads(newPage);
                  }
                }}
                disabled={bookingsPage === bookingsPagination.pages}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {isNotesModalOpen && selectedBookingForNotes && (
        <NotesModal
          isOpen={isNotesModalOpen}
          onClose={() => {
            setIsNotesModalOpen(false);
            setSelectedBookingForNotes(null);
          }}
          clientName={selectedBookingForNotes.name}
          initialNotes={selectedBookingForNotes.notes}
          onSave={handleSaveNotes}
        />
      )}

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

      {/* Plan Details Modal */}
      <PlanDetailsModal
        isOpen={isPlanDetailsModalOpen}
        onClose={() => {
          setIsPlanDetailsModalOpen(false);
          setSelectedBookingForPlanDetails(null);
          setPendingStatusUpdate(null);
        }}
        onSave={handlePlanDetailsSave}
        clientName={selectedBookingForPlanDetails?.booking.clientName || ''}
        currentPlan={selectedBookingForPlanDetails?.booking.paymentPlan}
        defaultDays={7}
      />

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedLeadForDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !deletingLead && setIsDeleteModalOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-rose-100 p-3 rounded-full">
                  <AlertCircle className="text-rose-600" size={24} />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Delete Lead Records</h3>
              </div>

              <p className="text-slate-600 mb-6">
                Are you sure you want to delete all entries of this user? This action cannot be undone.
              </p>

              <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Name:</span>
                  <span className="text-sm text-slate-900">{selectedLeadForDelete.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Email:</span>
                  <span className="text-sm text-slate-900">{selectedLeadForDelete.email}</span>
                </div>
                {selectedLeadForDelete.phone && selectedLeadForDelete.phone !== 'Not Specified' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Mobile:</span>
                    <span className="text-sm text-slate-900">{selectedLeadForDelete.phone}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setSelectedLeadForDelete(null);
                  }}
                  disabled={deletingLead}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deletingLead}
                  className="flex-1 px-4 py-2.5 bg-rose-500 text-white rounded-lg font-semibold hover:bg-rose-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deletingLead ? (
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

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white min-w-[300px] animate-in slide-in-from-right ${toast.type === 'success'
                ? 'bg-orange-500'
                : toast.type === 'error'
                  ? 'bg-rose-500'
                  : 'bg-slate-600'
              }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
            <span className="flex-1 font-medium">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-2 hover:opacity-80"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}