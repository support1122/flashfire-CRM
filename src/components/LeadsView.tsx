import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
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
  FileText,
  Workflow,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, CartesianGrid } from 'recharts';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';
import { useCrmAuth } from '../auth/CrmAuthContext';
import { validatePostMeetingBookingStatus } from '../utils/postMeetingStatus';
import { usePlanConfig, type PlanOption, type PlanName } from '../context/PlanConfigContext';
import NotesModal from './NotesModal';
import FollowUpModal, { type FollowUpData } from './FollowUpModal';
import PlanDetailsModal, { type PlanDetailsData } from './PlanDetailsModal';
import CustomWorkflowsModal from './CustomWorkflowsModal';

const QualifiedLeadsGraphs = lazy(() => import('./QualifiedLeadsGraphs'));

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

/** Calendar day yyyy-MM-dd for Meta parity: Meta export time when present, else booking ingest time. */
function getMetaComparableDay(booking: { metaRawData?: { created_time?: string }; bookingCreatedAt: string }): string {
  const raw = booking.metaRawData?.created_time?.trim();
  if (raw) {
    try {
      return format(parseISO(raw), 'yyyy-MM-dd');
    } catch {
      /* fall through */
    }
  }
  return format(parseISO(booking.bookingCreatedAt), 'yyyy-MM-dd');
}

function metaLeadInUserDateRange(
  booking: { metaRawData?: { created_time?: string }; bookingCreatedAt: string },
  fromDate: string,
  toDate: string
): boolean {
  const day = getMetaComparableDay(booking);
  if (fromDate && day < fromDate) return false;
  if (toDate && day > toDate) return false;
  return true;
}

function metaLeadSortTime(booking: { metaRawData?: { created_time?: string }; bookingCreatedAt: string }): number {
  const raw = booking.metaRawData?.created_time?.trim();
  if (raw) {
    try {
      return parseISO(raw).getTime();
    } catch {
      /* fall through */
    }
  }
  return parseISO(booking.bookingCreatedAt).getTime();
}

type PaymentPlan = {
  name: PlanName;
  price: number;
  currency?: string;
  displayPrice?: string;
  selectedAt?: string;
};

const statusLabels: Record<BookingStatus, string> = {
  'not-scheduled': 'Not Scheduled',
  scheduled: 'Scheduled',
  completed: 'Completed',
  canceled: 'Canceled',
  rescheduled: 'Rescheduled',
  'no-show': 'No Show',
  ignored: 'Ignored',
  paid: 'Paid',
};

const statusColors: Record<BookingStatus, string> = {
  'not-scheduled': 'text-blue-600 w-fit bg-blue-50',
  scheduled: 'text-orange-600 w-fit bg-orange-50',
  completed: 'text-emerald-700 bg-emerald-50',
  canceled: 'text-rose-700 w-fit bg-rose-50',
  rescheduled: 'text-amber-600 bg-amber-50',
  'no-show': 'text-rose-600 bg-rose-50',
  ignored: 'text-slate-600 bg-slate-100',
  paid: 'text-teal-700 bg-teal-50',
};

type BookingStatus = 'not-scheduled' | 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show' | 'ignored' | 'paid';
type Qualification = 'MQL' | 'SQL' | 'Converted';
type QuickRange = 'all' | 'thisMonth' | 'last30' | 'last90';
type LeadsTab = 'table' | 'graphs';

interface Booking {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  calendlyMeetLink?: string;
  googleMeetUrl?: string;
  meetingVideoUrl?: string;
  scheduledEventStartTime?: string;
  bookingCreatedAt: string;
  bookingStatus: BookingStatus;
  qualification?: Qualification;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  paymentPlan?: PaymentPlan;
  meetingNotes?: string;
  anythingToKnow?: string;
  totalBookings?: number;
  firefliesTranscriptId?: string;
  leadSource?: 'calendly' | 'meta_lead_ad' | 'manual' | 'frontend_direct' | 'bulk_import';
  metaLeadId?: string | null;
  metaFormName?: string;
  metaCampaignName?: string | null;
  metaAdName?: string | null;
  metaAdsetName?: string | null;
  metaPlatform?: string | null;
  metaIsOrganic?: boolean | null;
  metaLeadStatus?: string | null;
  /** Meta Lead Ads original created_time — aligns date filter with Meta export when present */
  metaRawData?: { created_time?: string };
  claimedBy?: {
    email: string;
    name: string;
    claimedAt: string;
  };
}

interface LeadsViewProps {
  variant?: 'all' | 'qualified';
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
  onOpenWhatsAppCampaign?: (payload: WhatsAppPrefillPayload) => void;
  onNavigateToWorkflows?: () => void;
  defaultUtmSource?: string; // Optional: Set default UTM source filter (e.g., 'meta_lead_ad')
  hideSourceFilter?: boolean; // Optional: Hide the source filter dropdown
  /** When true, Meta tab date range matches Meta export: client filters by metaRawData.created_time, else bookingCreatedAt (API often filters by meeting time). */
  dateRangeOnBookingCreatedAt?: boolean;
}

export default function LeadsView({
  variant = 'all',
  onOpenEmailCampaign,
  onOpenWhatsAppCampaign,
  onNavigateToWorkflows,
  defaultUtmSource,
  hideSourceFilter = false,
  dateRangeOnBookingCreatedAt = false,
}: LeadsViewProps) {
  const { token } = useCrmAuth();
  const { planOptions } = usePlanConfig();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [planFilter, setPlanFilter] = useState<PlanName | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [qualificationFilter, setQualificationFilter] = useState<'all' | 'mql' | 'sql' | 'converted'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [quickRange, setQuickRange] = useState<QuickRange>('all');
  const [activeLeadsTab, setActiveLeadsTab] = useState<LeadsTab>('table');
  const [utmFilter, setUtmFilter] = useState<string>(defaultUtmSource || 'all');
  const [mediumFilter, setMediumFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [openStatusDropdown, setOpenStatusDropdown] = useState<string | null>(null);
  const [planPickerFor, setPlanPickerFor] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [bookingsPage, setBookingsPage] = useState(1);
  const [bookingsPagination, setBookingsPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [planBreakdown, setPlanBreakdown] = useState<Array<{ _id: string; count: number; revenue: number }>>([]);
  const [mqlCount, setMqlCount] = useState(0);
  const [sqlCount, setSqlCount] = useState(0);
  const [convertedCount, setConvertedCount] = useState(0);
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});
  const [monthlyStatusBreakdown, setMonthlyStatusBreakdown] = useState<Array<Record<string, number | string>>>([]);
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [mediumOptions, setMediumOptions] = useState<string[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<string[]>([]);
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
  const [customWorkflowsForLead, setCustomWorkflowsForLead] = useState<{ bookingId: string; name: string } | null>(null);
  const [isAttachWorkflowsModalOpen, setIsAttachWorkflowsModalOpen] = useState(false);
  const [bulkCustomWorkflows, setBulkCustomWorkflows] = useState<Array<{ workflowId: string; name?: string }>>([]);
  const [bulkSelectedWorkflowIds, setBulkSelectedWorkflowIds] = useState<Set<string>>(new Set());
  const [bulkWorkflowsLoading, setBulkWorkflowsLoading] = useState(false);
  const [bulkAttaching, setBulkAttaching] = useState(false);
  const [allSelectedBookingIds, setAllSelectedBookingIds] = useState<string[] | null>(null);
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const statusDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [statusDropdownPosition, setStatusDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [graphsRefreshKey, setGraphsRefreshKey] = useState(0);

  /** Full Meta date–filtered list + signature so we paginate locally without re-fetching (matches Meta UI export). */
  const metaDateFilteredFullRef = useRef<Booking[] | null>(null);
  const metaDateFilterSigRef = useRef<string>('');

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
    const metaClientDateMode = dateRangeOnBookingCreatedAt && (fromDate || toDate);
    const metaSig = metaClientDateMode
      ? JSON.stringify({
          fromDate,
          toDate,
          utmFilter,
          mediumFilter,
          campaignFilter,
          search,
          statusFilter,
          planFilter,
          qualificationFilter,
          variant,
          minAmount,
          maxAmount,
        })
      : '';

    try {
      setRefreshing(true);
      setError(null);

      // Meta tab + date: API often applies range to meeting time. Fetch all Meta leads without date, then filter by Meta created_time (else bookingCreatedAt) to match Meta export.
      if (metaClientDateMode) {
        if (metaDateFilteredFullRef.current && metaDateFilterSigRef.current === metaSig && page >= 1) {
          const full = metaDateFilteredFullRef.current;
          const totalPages = Math.max(1, Math.ceil(full.length / 50));
          const safePage = Math.min(page, totalPages);
          setBookings(full.slice((safePage - 1) * 50, safePage * 50));
          setBookingsPagination({ total: full.length, pages: totalPages, limit: 50, page: safePage });
          setBookingsPage(safePage);
          setRefreshing(false);
          setLoading(false);
          return;
        }

        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const allRows: Booking[] = [];
        let p = 1;
        let totalApiPages = 1;
        const maxPages = 200;

        do {
          const params = new URLSearchParams({ page: String(p), limit: '50' });
          if (utmFilter !== 'all') params.append('utmSource', utmFilter);
          if (mediumFilter !== 'all') params.append('utmMedium', mediumFilter);
          if (campaignFilter !== 'all') params.append('utmCampaign', campaignFilter);
          if (planFilter !== 'all') params.append('planName', planFilter);
          if (variant === 'qualified' && qualificationFilter !== 'all') {
            params.append('qualification', qualificationFilter);
          }
          if (statusFilter !== 'all') params.append('status', statusFilter);
          if (search) params.append('search', search);
          if (minAmount) params.append('minAmount', minAmount);
          if (maxAmount) params.append('maxAmount', maxAmount);

          const response = await fetch(`${API_BASE_URL}/api/leads/paginated?${params}`, { headers });
          const data = await safeJsonParse(response);
          if (!data.success) throw new Error(data.message || 'Failed to fetch leads');
          const chunk = (data.data || []) as Booking[];
          allRows.push(...chunk);
          totalApiPages = data.pagination?.pages ?? 1;
          if (chunk.length === 0) break;
          p += 1;
        } while (p <= totalApiPages && p <= maxPages);

        const fd = fromDate || '1970-01-01';
        const td = toDate || '2099-12-31';
        const filtered = allRows
          .filter((b) => metaLeadInUserDateRange(b, fd, td))
          .sort((a, b) => metaLeadSortTime(b) - metaLeadSortTime(a));

        metaDateFilteredFullRef.current = filtered;
        metaDateFilterSigRef.current = metaSig;

        const totalPages = Math.max(1, Math.ceil(filtered.length / 50));
        const safePage = Math.min(page, totalPages);
        setBookings(filtered.slice((safePage - 1) * 50, safePage * 50));
        setBookingsPagination({ total: filtered.length, pages: totalPages, limit: 50, page: safePage });
        setBookingsPage(safePage);
        setTotalRevenue(0);
        setPlanBreakdown([]);
        setMqlCount(0);
        setSqlCount(0);
        setConvertedCount(0);
        setStatusBreakdown({});
        setMonthlyStatusBreakdown([]);
      } else {
        metaDateFilteredFullRef.current = null;
        metaDateFilterSigRef.current = '';

        const params = new URLSearchParams({
          page: page.toString(),
          limit: '50',
        });

        if (utmFilter !== 'all') {
          params.append('utmSource', utmFilter);
        }
        if (mediumFilter !== 'all') {
          params.append('utmMedium', mediumFilter);
        }
        if (campaignFilter !== 'all') {
          params.append('utmCampaign', campaignFilter);
        }
        if (planFilter !== 'all') {
          params.append('planName', planFilter);
        }
        if (variant === 'qualified' && qualificationFilter !== 'all') {
          params.append('qualification', qualificationFilter);
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

        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${API_BASE_URL}/api/leads/paginated?${params}`, { headers });
        const data = await safeJsonParse(response);

        if (data.success) {
          setBookings(data.data);
          setBookingsPagination(data.pagination);
          setBookingsPage(page);
          if (data.stats) {
            setTotalRevenue(data.stats.totalRevenue || 0);
            setPlanBreakdown(data.stats.planBreakdown || []);
            setMqlCount(data.stats.mqlCount ?? 0);
            setSqlCount(data.stats.sqlCount ?? 0);
            setConvertedCount(data.stats.convertedCount ?? 0);
            setStatusBreakdown((data.stats as { statusBreakdown?: Record<string, number> }).statusBreakdown || {});
            setMonthlyStatusBreakdown((data.stats as { monthlyStatusBreakdown?: Array<Record<string, number | string>> }).monthlyStatusBreakdown || []);
          } else {
            setStatusBreakdown({});
            setMonthlyStatusBreakdown([]);
          }
        } else {
          throw new Error(data.message || 'Failed to fetch leads');
        }
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leads');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [token, variant, planFilter, statusFilter, qualificationFilter, utmFilter, mediumFilter, campaignFilter, search, fromDate, toDate, minAmount, maxAmount, dateRangeOnBookingCreatedAt]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    const fetchUtmOptions = async () => {
      try {
        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        // Fetch registered campaigns + distinct values actually present on bookings
        // (including Meta campaign names) so the dropdown surfaces every filterable value.
        const [campaignsRes, distinctRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/campaigns`, { headers }),
          fetch(`${API_BASE_URL}/api/campaign-bookings/distinct-utm`, { headers }),
        ]);

        const campaigns = campaignsRes.ok ? (await campaignsRes.json())?.data || [] : [];
        const distinct = distinctRes.ok ? (await distinctRes.json())?.data || {} : {};

        const sourceOpts = [
          ...(Array.isArray(campaigns) ? campaigns : [])
            .map((c: { utmSource?: unknown }) => (typeof c.utmSource === 'string' ? c.utmSource.trim() : ''))
            .filter(Boolean),
          ...((distinct.utmSources || []) as string[]),
        ];
        const mediumOpts = [
          ...(Array.isArray(campaigns) ? campaigns : [])
            .map((c: { utmMedium?: unknown }) => (typeof c.utmMedium === 'string' ? c.utmMedium.trim() : ''))
            .filter(Boolean),
          ...((distinct.utmMediums || []) as string[]),
        ];
        // Merge registered Campaign.utmCampaign + distinct booking utmCampaign + metaCampaignName
        const campaignOpts = [
          ...(Array.isArray(campaigns) ? campaigns : [])
            .map((c: { utmCampaign?: unknown }) => (typeof c.utmCampaign === 'string' ? c.utmCampaign.trim() : ''))
            .filter(Boolean),
          ...((distinct.utmCampaigns || []) as string[]),
          ...((distinct.metaCampaignNames || []) as string[]),
        ];

        if (!cancelled) {
          setSourceOptions((prev) => Array.from(new Set([...prev, ...sourceOpts, 'direct'])).sort());
          setMediumOptions((prev) => Array.from(new Set([...prev, ...mediumOpts])).sort());
          setCampaignOptions((prev) => Array.from(new Set([...prev, ...campaignOpts])).sort());
        }
      } catch {
        // Keep leads table usable even if option fetch fails.
      }
    };

    fetchUtmOptions();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleQuickRangeChange = useCallback((range: QuickRange) => {
    setQuickRange(range);

    if (range === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }

    const today = new Date();
    let start: Date;

    if (range === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (range === 'last30') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      start = d;
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - 90);
      start = d;
    }

    const formatInputDate = (date: Date) => format(date, 'yyyy-MM-dd');

    setFromDate(formatInputDate(start));
    setToDate(formatInputDate(today));
  }, []);

  useEffect(() => {
    // Debounce filter-driven refetch: coalesce rapid dropdown/range changes into a single
    // request instead of firing one per change.
    const timer = setTimeout(() => {
      const page = 1;
      setBookingsPage(page);
      fetchLeads(page);
      setAllSelectedBookingIds(null);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, planFilter, statusFilter, qualificationFilter, utmFilter, mediumFilter, campaignFilter, search, fromDate, toDate, minAmount, maxAmount, dateRangeOnBookingCreatedAt]);

  useEffect(() => {
    const handleBookingUpdate = (event: CustomEvent) => {
      const { bookingId } = event.detail;
      if (bookingId) {
        metaDateFilteredFullRef.current = null;
        metaDateFilterSigRef.current = '';
        fetchLeads(bookingsPage);
      }
    };

    window.addEventListener('bookingUpdated', handleBookingUpdate as EventListener);
    return () => {
      window.removeEventListener('bookingUpdated', handleBookingUpdate as EventListener);
    };
  }, [bookingsPage, fetchLeads]);

  const uniqueSources = useMemo(() => {
    const sources = new Set<string>(sourceOptions);
    bookings.forEach((booking) => sources.add(booking.utmSource || 'direct'));
    if (utmFilter !== 'all' && utmFilter.trim()) {
      sources.add(utmFilter.trim());
    }
    return Array.from(sources).sort();
  }, [bookings, sourceOptions, utmFilter]);

  const uniqueMediums = useMemo(() => {
    const mediums = new Set<string>(mediumOptions);
    bookings.forEach((booking) => {
      const medium = booking.utmMedium?.trim();
      if (medium) mediums.add(medium);
    });
    if (mediumFilter !== 'all' && mediumFilter.trim()) {
      mediums.add(mediumFilter.trim());
    }
    return Array.from(mediums).sort();
  }, [bookings, mediumOptions, mediumFilter]);

  const uniqueCampaigns = useMemo(() => {
    const campaigns = new Set<string>(campaignOptions);
    bookings.forEach((booking) => {
      const metaName = booking.metaCampaignName?.trim();
      if (metaName) campaigns.add(metaName);
      const campaign = booking.utmCampaign?.trim();
      if (campaign) campaigns.add(campaign);
    });
    if (campaignFilter !== 'all' && campaignFilter.trim()) {
      campaigns.add(campaignFilter.trim());
    }
    return Array.from(campaigns).sort();
  }, [bookings, campaignOptions, campaignFilter]);

  const filteredData = useMemo(() => {
    return bookings.map((booking) => {
      // Use bookingId for unique ID to show all leads (including duplicates)
      // For Meta Leads tab, we want to show all individual leads, not group by email/phone
      const idKey = booking.bookingId || `${booking.clientEmail}-${Date.now()}`;

      return {
        id: `lead-${idKey}`,
        type: 'lead' as const,
        name: booking.clientName || 'Unknown',
        email: booking.clientEmail,
        phone: booking.clientPhone,
        createdAt: booking.bookingCreatedAt,
        scheduledTime: booking.scheduledEventStartTime,
        source: booking.utmSource || 'direct',
        medium: booking.utmMedium || '',
        campaign: booking.metaCampaignName || booking.utmCampaign || '',
        status: booking.bookingStatus,
        qualification: booking.qualification ?? (booking.bookingStatus === 'paid' ? 'Converted' : booking.bookingStatus === 'completed' ? 'SQL' : 'MQL'),
        meetLink: booking.googleMeetUrl || (booking.calendlyMeetLink && booking.calendlyMeetLink !== 'Not Provided' ? booking.calendlyMeetLink : undefined),
        videoUrl: booking.meetingVideoUrl || undefined,
        notes: booking.anythingToKnow,
        meetingNotes: booking.meetingNotes,
        paymentPlan: booking.paymentPlan,
        bookingId: booking.bookingId,
        totalBookings: booking.totalBookings || 1,
        firefliesTranscriptId: booking.firefliesTranscriptId,
        claimedBy: booking.claimedBy,
        leadSource: booking.leadSource,
        metaLeadId: booking.metaLeadId ?? undefined,
        metaFormName: booking.metaFormName,
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

  // Use API statusBreakdown when available (correct full-filtered counts); fallback to filteredData for backwards compat
  const statusStats = useMemo(() => {
    const sb = statusBreakdown;
    const hasApiBreakdown = Object.keys(sb).length > 0;
    if (hasApiBreakdown) {
      const booked = (sb['scheduled'] ?? 0) + (sb['rescheduled'] ?? 0);
      const total = Object.values(sb).reduce((sum, n) => sum + n, 0);
      return {
        notScheduled: sb['not-scheduled'] ?? 0,
        booked,
        completed: sb['completed'] ?? 0,
        canceled: sb['canceled'] ?? 0,
        noShow: sb['no-show'] ?? 0,
        rescheduled: sb['rescheduled'] ?? 0,
        ignored: sb['ignored'] ?? 0,
        paid: sb['paid'] ?? 0,
        total,
      };
    }
    const stats = {
      'not-scheduled': 0,
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
    const booked = stats.scheduled + stats.rescheduled;
    return {
      notScheduled: stats['not-scheduled'],
      booked,
      completed: stats.completed,
      canceled: stats.canceled,
      noShow: stats['no-show'],
      rescheduled: stats.rescheduled,
      ignored: stats.ignored,
      paid: stats.paid,
      total,
    };
  }, [filteredData, statusBreakdown]);

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
    setAllSelectedBookingIds(null);
  }, [filteredData, selectedRows.size]);

  const handleSelectAllFiltered = useCallback(async () => {
    if (allSelectedBookingIds !== null) {
      setAllSelectedBookingIds(null);
      setSelectedRows(new Set());
      return;
    }
    setSelectAllLoading(true);
    try {
      if (dateRangeOnBookingCreatedAt && (fromDate || toDate) && metaDateFilteredFullRef.current?.length) {
        const ids = metaDateFilteredFullRef.current.map((b) => b.bookingId).filter(Boolean);
        if (ids.length > 0) {
          setAllSelectedBookingIds(ids);
          setSelectedRows(new Set());
        } else {
          showToast('No booking IDs to select', 'error');
        }
        return;
      }

      const params = new URLSearchParams();
      if (utmFilter !== 'all') params.append('utmSource', utmFilter);
      if (mediumFilter !== 'all') params.append('utmMedium', mediumFilter);
      if (campaignFilter !== 'all') params.append('utmCampaign', campaignFilter);
      if (planFilter !== 'all') params.append('planName', planFilter);
      if (variant === 'qualified' && qualificationFilter !== 'all') params.append('qualification', qualificationFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (search) params.append('search', search);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE_URL}/api/leads/ids?${params}`, { headers });
      const data = await safeJsonParse(res);
      if (data.success && Array.isArray(data.data?.bookingIds)) {
        setAllSelectedBookingIds(data.data.bookingIds);
        setSelectedRows(new Set());
      } else {
        showToast('Failed to fetch leads for selection', 'error');
      }
    } catch {
      showToast('Failed to select all filtered leads', 'error');
    } finally {
      setSelectAllLoading(false);
    }
  }, [token, utmFilter, mediumFilter, campaignFilter, planFilter, qualificationFilter, statusFilter, search, fromDate, toDate, minAmount, maxAmount, variant, allSelectedBookingIds, dateRangeOnBookingCreatedAt]);

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

  const selectedBookingIdsForBulk = useMemo(() => {
    if (allSelectedBookingIds && allSelectedBookingIds.length > 0) {
      return allSelectedBookingIds;
    }
    return filteredData
      .filter((row) => selectedRows.has(row.id) && row.bookingId)
      .map((row) => row.bookingId!);
  }, [filteredData, selectedRows, allSelectedBookingIds]);

  useEffect(() => {
    if (!isAttachWorkflowsModalOpen) return;
    setBulkWorkflowsLoading(true);
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    fetch(`${API_BASE_URL}/api/workflows?isCustom=true`, { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setBulkCustomWorkflows(data.data.map((w: { workflowId: string; name?: string }) => ({ workflowId: w.workflowId, name: w.name })));
        } else {
          setBulkCustomWorkflows([]);
        }
      })
      .catch(() => setBulkCustomWorkflows([]))
      .finally(() => setBulkWorkflowsLoading(false));
    setBulkSelectedWorkflowIds(new Set());
  }, [isAttachWorkflowsModalOpen, token]);

  const handleBulkAttachWorkflows = async () => {
    if (bulkSelectedWorkflowIds.size === 0 || selectedBookingIdsForBulk.length === 0) return;
    setBulkAttaching(true);
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    let attached = 0;
    let triggered = 0;
    for (const bookingId of selectedBookingIdsForBulk) {
      for (const workflowId of bulkSelectedWorkflowIds) {
        try {
          const attachRes = await fetch(
            `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/attach`,
            { method: 'POST', headers }
          );
          const attachData = await attachRes.json();
          if (attachData.success) {
            attached += 1;
            try {
              const triggerRes = await fetch(
                `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/trigger`,
                { method: 'POST', headers }
              );
              const triggerData = await triggerRes.json();
              if (triggerData.success) triggered += 1;
            } catch {
              //
            }
          }
        } catch {
          //
        }
      }
    }
    setBulkAttaching(false);
    showToast(`Attached and triggered workflows: ${attached} attached, ${triggered} triggered. Check Logs tab for execution status.`, 'success');
    setIsAttachWorkflowsModalOpen(false);
  };

  const toggleBulkWorkflowSelection = (workflowId: string) => {
    setBulkSelectedWorkflowIds((prev) => {
      const next = new Set(prev);
      if (next.has(workflowId)) next.delete(workflowId);
      else next.add(workflowId);
      return next;
    });
  };

  const bookingsById = useMemo(() => {
    const map = new Map<string, Booking>();
    bookings.forEach((booking) => {
      map.set(booking.bookingId, booking);
    });
    return map;
  }, [bookings]);

  const confirmNoShowWithFutureMeeting = useCallback(
    async (bookingId: string) => {
      const currentBooking = bookingsById.get(bookingId);
      const clientEmail = currentBooking?.clientEmail?.trim();
      if (!clientEmail) return true;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/campaign-bookings/email/${encodeURIComponent(clientEmail.toLowerCase())}`
        );
        const data = await safeJsonParse(response);
        const relatedBookings = Array.isArray(data?.data) ? data.data : [];
        const now = Date.now();

        const futureMeetings = relatedBookings
          .filter((booking: Booking) => {
            if (!booking || booking.bookingId === bookingId) return false;
            if (!booking.scheduledEventStartTime) return false;
            const startTime = new Date(booking.scheduledEventStartTime).getTime();
            if (Number.isNaN(startTime) || startTime <= now) return false;
            return booking.bookingStatus === 'scheduled' || booking.bookingStatus === 'rescheduled';
          })
          .sort(
            (a: Booking, b: Booking) =>
              new Date(a.scheduledEventStartTime || '').getTime() -
              new Date(b.scheduledEventStartTime || '').getTime()
          );

        if (futureMeetings.length === 0) return true;

        const meetingLines = futureMeetings
          .slice(0, 3)
          .map((meeting: Booking) => {
            const meetingTime = meeting.scheduledEventStartTime
              ? format(parseISO(meeting.scheduledEventStartTime), 'MMM d, yyyy h:mm a')
              : 'Unknown time';
            const label = statusLabels[meeting.bookingStatus] || meeting.bookingStatus;
            return `- ${meetingTime} (${label})`;
          })
          .join('\n');

        const remainingCount = futureMeetings.length - 3;
        const extraLine = remainingCount > 0 ? `\n- +${remainingCount} more future meeting(s)` : '';

        return window.confirm(
          `This client already has ${futureMeetings.length} future meeting(s):\n\n${meetingLines}${extraLine}\n\nAre you sure you want to mark this booking as No Show?`
        );
      } catch (error) {
        console.warn('No-show future meeting check failed, proceeding anyway:', error);
        return true;
      }
    },
    [bookingsById]
  );

  const handleStatusUpdate = async (bookingId: string, status: BookingStatus, plan?: PlanOption) => {
    try {
      setUpdatingBookingId(bookingId);

      const bookingForTime = bookingsById.get(bookingId);
      const timeRule = validatePostMeetingBookingStatus(
        bookingForTime?.scheduledEventStartTime,
        status
      );
      if (!timeRule.ok) {
        showToast(timeRule.message, 'error');
        setUpdatingBookingId(null);
        setPlanPickerFor(null);
        setOpenStatusDropdown(null);
        return;
      }

      if (status === 'no-show') {
        const allowNoShow = await confirmNoShowWithFutureMeeting(bookingId);
        if (!allowNoShow) {
          setUpdatingBookingId(null);
          setPlanPickerFor(null);
          setOpenStatusDropdown(null);
          return;
        }
      }

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

      const bookingForTime = bookings.find((b) => b.bookingId === bookingId);
      const timeRule = validatePostMeetingBookingStatus(
        bookingForTime?.scheduledEventStartTime,
        status
      );
      if (!timeRule.ok) {
        showToast(timeRule.message, 'error');
        setUpdatingBookingId(null);
        setPlanPickerFor(null);
        setOpenStatusDropdown(null);
        return;
      }

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
      const target = event.target as Element;
      if (openStatusDropdown && !target.closest('.status-dropdown-container') && !target.closest('.status-dropdown-panel')) {
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

  useEffect(() => {
    if (!openStatusDropdown) {
      setStatusDropdownPosition(null);
      return;
    }
    const measure = () => {
      const container = statusDropdownRefs.current[openStatusDropdown];
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const panelW = 224;
      const panelMaxH = 380;
      let left = rect.right + 4;
      let top = rect.top;
      if (left + panelW > window.innerWidth - 8) left = rect.left - panelW - 4;
      if (left < 8) left = 8;
      if (top + panelMaxH > window.innerHeight - 8) top = window.innerHeight - panelMaxH - 8;
      if (top < 8) top = 8;
      setStatusDropdownPosition({ top, left });
    };
    const t = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(t);
  }, [openStatusDropdown]);

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
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">{variant === 'qualified' ? 'Pipeline' : 'Unified Data'}</p>
            <h1 className="text-3xl font-bold text-slate-900">{variant === 'qualified' ? 'Qualified Leads' : 'Leads'}</h1>
            <p className="text-slate-600 max-w-2xl">
              {variant === 'qualified'
                ? 'MQL, SQL & Converted pipeline. Each client appears once with their latest qualification. Filter and manage by stage.'
                : 'View and manage all clients. Each client appears once with their latest booking status. Status and amount are editable.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-wrap">
            <div className="flex-1 min-w-[160px] bg-orange-50 border border-orange-100 px-4 py-3 text-left rounded-lg">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">Total Leads</p>
              <p className="text-2xl font-bold text-slate-900">{bookingsPagination.total.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 mt-1">Across all sources</p>
            </div>
            {variant === 'all' && (
              <div className="flex-1 min-w-[160px] bg-slate-50 border border-slate-100 px-4 py-3 text-left rounded-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Currently Showing</p>
                <p className="text-2xl font-bold text-slate-900">{filteredData.length.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 mt-1">After active filters</p>
              </div>
            )}
            {variant === 'qualified' && (
              <>
                <div className="flex-1 min-w-[140px] bg-violet-50 border border-violet-100 px-4 py-3 text-left rounded-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">MQL</p>
                  <p className="text-2xl font-bold text-slate-900">{mqlCount.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Marketing qualified</p>
                </div>
                <div className="flex-1 min-w-[140px] bg-emerald-50 border border-emerald-100 px-4 py-3 text-left rounded-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">SQL</p>
                  <p className="text-2xl font-bold text-slate-900">{sqlCount.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Sales qualified</p>
                </div>
                <div className="flex-1 min-w-[140px] bg-teal-50 border border-teal-100 px-4 py-3 text-left rounded-lg">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-600">Converted</p>
                  <p className="text-2xl font-bold text-slate-900">{convertedCount.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Paid</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {variant === 'qualified' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-200">
            <div className="flex items-center gap-1 px-4">
              <button
                onClick={() => setActiveLeadsTab('table')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                  activeLeadsTab === 'table'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setActiveLeadsTab('graphs')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${
                  activeLeadsTab === 'graphs'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Graphs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Status Chart - Show when date filters are selected */}
      {dateRangeDisplay && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            {dateRangeOnBookingCreatedAt
              ? `Meta lead time window (${dateRangeDisplay})`
              : `Meetings from ${dateRangeDisplay}`}
          </h2>
          <p className="text-xs text-slate-500 mb-4">Monthly breakdown by status • Hover for details</p>
          {monthlyStatusBreakdown.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyStatusBreakdown.map((m) => ({
                    ...m,
                    monthLabel: (() => {
                      const [y, mo] = (m.month as string).split('-');
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      return `${months[parseInt(mo, 10) - 1]} ${y}`;
                    })(),
                    NotScheduled: m['not-scheduled'] ?? 0,
                    Booked: m.booked ?? 0,
                    Cancelled: m.canceled ?? 0,
                    NoShow: m['no-show'] ?? 0,
                    Completed: m.completed ?? 0,
                    Rescheduled: m.rescheduled ?? 0,
                    Ignored: m.ignored ?? 0,
                    Converted: m.paid ?? 0,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(15,23,42,0.04)' }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number, name: string) => [value, name]}
                    labelFormatter={(label) => label}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="NotScheduled" stackId="a" fill="#3B82F6" name="Not Scheduled" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Booked" stackId="a" fill="#F97316" name="Booked" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Cancelled" stackId="a" fill="#BE123C" name="Cancelled" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="NoShow" stackId="a" fill="#FB7185" name="No-Show" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Completed" stackId="a" fill="#22C55E" name="Completed" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Rescheduled" stackId="a" fill="#F59E0B" name="Rescheduled" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Ignored" stackId="a" fill="#64748B" name="Ignored" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Converted" stackId="a" fill="#14B8A6" name="Converted" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-4">
              {statusStats.notScheduled > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="text-slate-600 text-[11px] font-medium">Not Scheduled</span>
                  <span className="text-lg font-bold text-blue-600">{statusStats.notScheduled}</span>
                </div>
              )}
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
              {variant === 'qualified' && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-violet-600 text-[11px] font-medium">MQL</span>
                    <span className="text-lg font-bold text-violet-700">{statusStats.notScheduled + statusStats.booked + statusStats.canceled + statusStats.noShow + statusStats.rescheduled + statusStats.ignored}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-emerald-600 text-[11px] font-medium">SQL</span>
                    <span className="text-lg font-bold text-emerald-700">{statusStats.completed}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-teal-600 text-[11px] font-medium">Converted</span>
                    <span className="text-lg font-bold text-teal-700">{statusStats.paid}</span>
                  </div>
                </>
              )}
              <div className="flex items-baseline gap-2 ml-auto">
                <span className="text-slate-500 text-[11px] font-medium">Total:</span>
                <span className="text-lg font-bold text-slate-700">{statusStats.total}</span>
              </div>
            </div>
          )}
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

      {/* Filters - shown above graphs when on Graphs tab, above table when on Table tab */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">
              {variant === 'qualified' && activeLeadsTab === 'graphs' ? 'Graph filters' : 'Filters'}
            </span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {activeLeadsTab === 'table' && (
              <div className="flex flex-col gap-1.5 min-w-[200px] flex-1 max-w-xs">
                <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Search</label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-400">
                  <Search size={14} className="text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Name, email, phone, source…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setSearch(searchInput.trim());
                        setBookingsPage(1);
                        fetchLeads(1);
                      }
                    }}
                    className="text-sm bg-transparent focus:outline-none w-full placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}
            {variant === 'qualified' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Qualification</label>
                <select
                  value={qualificationFilter}
                  onChange={(e) => setQualificationFilter(e.target.value as 'all' | 'mql' | 'sql' | 'converted')}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[140px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                >
                  <option value="all">All qualifications</option>
                  <option value="mql">MQL</option>
                  <option value="sql">SQL</option>
                  <option value="converted">Converted</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as BookingStatus | 'all')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[130px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              >
                <option value="all">All statuses</option>
                {(['not-scheduled', 'scheduled', 'completed', 'rescheduled', 'no-show', 'canceled', 'ignored', 'paid'] as BookingStatus[]).map((status) => (
                  <option key={status} value={status}>{statusLabels[status]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Plan</label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as PlanName | 'all')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[130px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              >
                <option value="all">All plans</option>
                {planOptions.map((plan) => (
                  <option key={plan.key} value={plan.key}>{plan.label} ({plan.displayPrice})</option>
                ))}
              </select>
            </div>
            {!hideSourceFilter && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Source</label>
                <select
                  value={utmFilter}
                  onChange={(e) => setUtmFilter(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[140px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                >
                  <option value="all">All sources</option>
                  {uniqueSources.map((source) => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Medium</label>
              <select
                value={mediumFilter}
                onChange={(e) => setMediumFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[140px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              >
                <option value="all">All mediums</option>
                {uniqueMediums.map((medium) => (
                  <option key={medium} value={medium}>{medium}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Campaign</label>
              <select
                value={campaignFilter}
                onChange={(e) => setCampaignFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[160px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              >
                <option value="all">All campaigns</option>
                {uniqueCampaigns.map((campaign) => (
                  <option key={campaign} value={campaign}>{campaign}</option>
                ))}
              </select>
            </div>
            {activeLeadsTab === 'table' && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                disabled={selectAllLoading || bookingsPagination.total === 0}
                className="h-9 px-4 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-sm font-semibold hover:bg-orange-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={allSelectedBookingIds ? 'Deselect all filtered' : `Select all ${bookingsPagination.total} filtered lead(s)`}
              >
                {selectAllLoading ? <Loader2 size={14} className="animate-spin" /> : allSelectedBookingIds ? 'Deselect All' : 'Select All'}
                {!selectAllLoading && !allSelectedBookingIds && <span className="text-orange-600 ml-1">({bookingsPagination.total})</span>}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Date range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
              </div>
              {dateRangeOnBookingCreatedAt && (
                <p className="text-[10px] text-slate-500 max-w-[min(100%,26rem)]">
                  Matches Meta export: uses <span className="font-medium text-slate-600">meta created_time</span> when present, else{' '}
                  <span className="font-medium text-slate-600">bookingCreatedAt</span> (local calendar day). Loads all Meta leads once, then filters in the browser.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Quick range</label>
              <select
                value={quickRange}
                onChange={(e) => handleQuickRangeChange(e.target.value as QuickRange)}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 min-w-[130px] focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
              >
                <option value="all">All time</option>
                <option value="thisMonth">This month</option>
                <option value="last30">Last 30 days</option>
                <option value="last90">Last 90 days</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Amount</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min $"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 w-24 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="number"
                  placeholder="Max $"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 w-24 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {(fromDate || toDate || searchInput || planFilter !== 'all' || (utmFilter !== 'all' && !hideSourceFilter) || mediumFilter !== 'all' || campaignFilter !== 'all' || statusFilter !== 'all' || qualificationFilter !== 'all' || minAmount || maxAmount) && (
                <button
                  onClick={() => {
                    metaDateFilteredFullRef.current = null;
                    metaDateFilterSigRef.current = '';
                    setFromDate('');
                    setToDate('');
                    setPlanFilter('all');
                    setUtmFilter(defaultUtmSource || 'all');
                    setMediumFilter('all');
                    setCampaignFilter('all');
                    setStatusFilter('all');
                    setQualificationFilter('all');
                    setSearchInput('');
                    setSearch('');
                    setMinAmount('');
                    setMaxAmount('');
                    setQuickRange('all');
                    setBookingsPage(1);
                  }}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
                >
                  Clear filters
                </button>
              )}
              <button
                onClick={() => {
                  metaDateFilteredFullRef.current = null;
                  metaDateFilterSigRef.current = '';
                  if (activeLeadsTab === 'table') fetchLeads(bookingsPage);
                  if (activeLeadsTab === 'graphs') setGraphsRefreshKey((k) => k + 1);
                }}
                disabled={refreshing}
                className="h-9 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {variant === 'qualified' && activeLeadsTab === 'graphs' && (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" /></div>}>
          <QualifiedLeadsGraphs
            key={graphsRefreshKey}
            filters={{
              fromDate,
              toDate,
              qualification: qualificationFilter,
              status: statusFilter,
              planName: planFilter,
              utmSource: utmFilter,
              utmMedium: mediumFilter,
              utmCampaign: campaignFilter,
              minAmount,
              maxAmount,
            }}
            monthlyStatusBreakdown={monthlyStatusBreakdown}
          />
        </Suspense>
      )}

      {error && (
        <div className="bg-orange-50 border border-orange-200  p-4 text-orange-700">
          {error}
        </div>
      )}

      {activeLeadsTab === 'table' && (selectedRows.size > 0 || (allSelectedBookingIds && allSelectedBookingIds.length > 0)) && (
        <div className="bg-orange-50 border border-orange-200  px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-orange-900">
            {allSelectedBookingIds
              ? `${allSelectedBookingIds.length} row${allSelectedBookingIds.length !== 1 ? 's' : ''} selected (all filtered)`
              : `${selectedRows.size} row${selectedRows.size !== 1 ? 's' : ''} selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAttachWorkflowsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-violet-200 text-violet-700 rounded-lg bg-white hover:bg-violet-50 transition text-[11px] font-semibold"
            >
              <Workflow size={16} />
              Attach Workflows ({selectedBookingIdsForBulk.length})
            </button>
            <button
              onClick={handleBulkEmail}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-[11px] font-semibold"
            >
              <Send size={16} />
              Send Email ({selectedBookingIdsForBulk.length})
            </button>
          </div>
        </div>
      )}

      {activeLeadsTab === 'table' && (
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
                        {variant === 'qualified' && (
                          <span
                            className={`inline-flex w-fit items-center text-[9px] px-1 py-0.5 font-semibold rounded ${
                              row.qualification === 'Converted'
                                ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                : row.qualification === 'SQL'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-violet-50 text-violet-700 border border-violet-200'
                            }`}
                          >
                            {row.qualification}
                          </span>
                        )}
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
                      <div className="flex flex-col gap-0.5">
                        {(row.leadSource === 'meta_lead_ad' || row.metaLeadId) ? (
                          <span className="inline-flex items-center px-1 py-0.5 rounded-full bg-blue-100 text-[9px] font-semibold text-blue-700 truncate max-w-full" title={`Meta Lead Ad${row.metaFormName ? ` - ${row.metaFormName}` : ''}`}>
                            Meta Ad
                          </span>
                        ) : row.source ? (
                          <span className="inline-flex items-center px-1 py-0.5 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 truncate max-w-full" title={row.source}>
                            {row.source}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[9px]">—</span>
                        )}
                        {row.medium ? (
                          <span className="text-[8px] text-slate-500 truncate" title={`Medium: ${row.medium}`}>
                            M: {row.medium}
                          </span>
                        ) : null}
                        {row.campaign ? (
                          <span className="text-[8px] text-slate-500 truncate" title={`Campaign: ${row.campaign}`}>
                            C: {row.campaign}
                          </span>
                        ) : null}
                      </div>
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
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenStatusDropdown(null)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1.5">
                      {row.paymentPlan ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center w-fit gap-0.5 rounded border border-orange-100 bg-orange-50 px-1 py-0.5 text-[9px] font-semibold text-orange-800">
                            <DollarSign size={8} className="text-orange-600 flex-shrink-0" />
                            <span className="truncate text-[8px]">{row.paymentPlan.name}</span>
                            {(() => {
                              const rawDisplay = row.paymentPlan.displayPrice?.toString().trim() ?? '';
                              const lower = rawDisplay.toLowerCase();
                              const hasValidDisplay =
                                !!rawDisplay &&
                                lower !== 'null' &&
                                lower !== 'undefined' &&
                                lower !== '$null' &&
                                lower !== '$undefined';
                              const safeDisplay = hasValidDisplay
                                ? rawDisplay
                                : (row.paymentPlan.price && row.paymentPlan.price > 0
                                  ? `$${row.paymentPlan.price}`
                                  : '$349');
                              return (
                                <span className="text-orange-700 truncate text-[8px]">
                                  {safeDisplay}
                                </span>
                              );
                            })()}
                          </div>
                          {row.status === 'paid' && (
                            <>
                              <select
                                value={row.paymentPlan.name}
                                onChange={(e) => {
                                  const plan = planOptions.find(p => p.key === e.target.value);
                                  if (plan && row.bookingId) {
                                    handleUpdateAmount(row.bookingId, plan.price, plan.key);
                                  }
                                }}
                                disabled={updatingBookingId === row.bookingId}
                                className="w-full text-[9px] border border-orange-200 rounded px-1 py-0.5 bg-orange-50 text-orange-800"
                                title={row.paymentPlan.name}
                              >
                                {planOptions.map((plan) => (
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
                        {row.videoUrl && (
                          <a
                            href={row.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View Recording"
                            className="inline-flex items-center justify-center p-0.5 rounded border border-slate-200 bg-white hover:border-orange-400 hover:text-orange-600 transition flex-shrink-0"
                          >
                            <FileText size={9} />
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
                          onClick={() => row.bookingId && setCustomWorkflowsForLead({ bookingId: row.bookingId, name: row.name })}
                          title={row.bookingId ? 'Custom Workflows' : 'Custom workflows require a lead record'}
                          disabled={!row.bookingId}
                          className="inline-flex items-center justify-center p-0.5 rounded border border-violet-200 text-violet-700 bg-white hover:bg-violet-50 transition flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Workflow size={9} />
                        </button>
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
            Total {hideSourceFilter ? 'leads' : 'unique leads'}: <span className="font-semibold text-slate-900">{bookingsPagination.total}</span>
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
      )}

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

      {customWorkflowsForLead && (
        <CustomWorkflowsModal
          isOpen={!!customWorkflowsForLead}
          onClose={() => setCustomWorkflowsForLead(null)}
          bookingId={customWorkflowsForLead.bookingId}
          clientName={customWorkflowsForLead.name}
          onSuccess={() => {
            showToast('Custom workflow updated', 'success');
          }}
        />
      )}

      {isAttachWorkflowsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !bulkAttaching && setIsAttachWorkflowsModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Workflow size={20} className="text-violet-500" />
                <h3 className="text-lg font-bold text-slate-900">Attach Workflows</h3>
              </div>
              <button
                onClick={() => !bulkAttaching && setIsAttachWorkflowsModalOpen(false)}
                disabled={bulkAttaching}
                className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Attach custom workflows to <span className="font-semibold">{selectedBookingIdsForBulk.length}</span> selected lead(s). Select one or more workflows below.
              </p>
              {onNavigateToWorkflows && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAttachWorkflowsModalOpen(false);
                    onNavigateToWorkflows();
                  }}
                  className="w-full mb-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-violet-300 bg-violet-50/50 text-violet-700 rounded-xl font-semibold hover:bg-violet-100 hover:border-violet-400 transition"
                >
                  <Plus size={18} />
                  Create new workflow
                </button>
              )}
              {bulkWorkflowsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-orange-500" size={28} />
                </div>
              ) : bulkCustomWorkflows.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No custom workflows found. Create one from a lead’s row first.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto mb-4">
                  {bulkCustomWorkflows.map((w) => (
                    <li key={w.workflowId} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition">
                      <button
                        type="button"
                        onClick={() => toggleBulkWorkflowSelection(w.workflowId)}
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${bulkSelectedWorkflowIds.has(w.workflowId) ? 'bg-violet-500 border-violet-500 text-white' : 'border-slate-300 bg-white'}`}
                      >
                        {bulkSelectedWorkflowIds.has(w.workflowId) ? <CheckSquare size={14} /> : null}
                      </button>
                      <span className="font-medium text-slate-800 truncate flex-1">{w.name || w.workflowId}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => !bulkAttaching && setIsAttachWorkflowsModalOpen(false)}
                  disabled={bulkAttaching}
                  className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkAttachWorkflows}
                  disabled={bulkAttaching || bulkSelectedWorkflowIds.size === 0 || bulkCustomWorkflows.length === 0}
                  className="flex-1 py-2.5 bg-violet-500 text-white rounded-lg font-semibold hover:bg-violet-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bulkAttaching ? <Loader2 size={18} className="animate-spin" /> : <Workflow size={18} />}
                  Attach to {selectedBookingIdsForBulk.length} lead(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {openStatusDropdown && statusDropdownPosition && (() => {
        const openRow = filteredData.find((r) => r.bookingId === openStatusDropdown);
        if (!openRow) return null;
        return createPortal(
          <div
            className="status-dropdown-panel fixed z-50 w-56 min-w-[224px] bg-white rounded-lg shadow-xl border border-slate-200 py-0 overflow-hidden max-h-[350px] overflow-y-auto"
            style={{ top: statusDropdownPosition.top, left: statusDropdownPosition.left }}
          >
            <div className="px-2.5 py-2 border-b border-slate-100 bg-slate-50/80">
              <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Client</div>
              <div className="text-[10px] font-semibold text-slate-900 truncate" title={openRow.name}>{openRow.name}</div>
              <div className="text-[9px] text-slate-600 truncate mt-0.5" title={openRow.email}>{openRow.email}</div>
              {openRow.phone && openRow.phone !== 'Not Specified' && (
                <div className="text-[9px] text-slate-600 truncate mt-0.5" title={openRow.phone}>{openRow.phone}</div>
              )}
            </div>
            <div className="px-2 py-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 sticky top-0 bg-white">
              Change Status
            </div>
            <div className="py-1">
              {(['not-scheduled', 'scheduled', 'completed', 'no-show', 'rescheduled', 'paid', 'canceled', 'ignored'] as BookingStatus[]).map((status) => {
                if (status === openRow.status) return null;
                const statusIcon = status === 'not-scheduled' ? Clock : status === 'completed' ? CheckCircle2 : status === 'no-show' ? AlertTriangle : status === 'paid' ? DollarSign : status === 'rescheduled' ? Clock : status === 'canceled' ? X : status === 'ignored' ? X : Calendar;
                const StatusIcon = statusIcon;
                const isPaidOption = status === 'paid';
                const isPlanOpen = isPaidOption && planPickerFor === openRow.bookingId;
                const postMeetingCheck = validatePostMeetingBookingStatus(openRow.scheduledTime, status);
                const postMeetingBlocked = !postMeetingCheck.ok;
                return (
                  <div key={status} className="border-b last:border-b-0 border-slate-100">
                    <button
                      type="button"
                      disabled={postMeetingBlocked}
                      title={postMeetingBlocked ? postMeetingCheck.message : undefined}
                      onClick={() => {
                        const booking = bookingsById.get(openRow.bookingId!);
                        if (!booking) return;
                        if (postMeetingBlocked) return;
                        if (isPaidOption) {
                          setPlanPickerFor(openRow.bookingId!);
                          return;
                        }
                        setPlanPickerFor(null);
                        handleStatusUpdate(booking.bookingId, status);
                        setOpenStatusDropdown(null);
                      }}
                      className={`w-full text-left px-2 py-1.5 text-[9px] transition flex items-center gap-1.5 group ${postMeetingBlocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                    >
                      <StatusIcon size={11} className={`flex-shrink-0 ${status === 'not-scheduled' ? 'text-blue-600' : status === 'completed' ? 'text-emerald-600' : status === 'no-show' ? 'text-rose-600' : status === 'rescheduled' ? 'text-amber-600' : status === 'paid' ? 'text-teal-600' : status === 'canceled' ? 'text-rose-700' : status === 'ignored' ? 'text-slate-500' : 'text-orange-600'}`} />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium">{statusLabels[status]}</span>
                        {isPaidOption && <span className="text-[8px] text-slate-500">Select a plan</span>}
                      </div>
                    </button>
                    {isPlanOpen && (
                      <div className="px-2 pb-1.5 grid grid-cols-1 gap-0.5">
                        {planOptions.map((plan) => (
                          <button
                            type="button"
                            key={plan.key}
                            onClick={() => {
                              const booking = bookingsById.get(openRow.bookingId!);
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
                            <DollarSign size={11} className="text-orange-600 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        );
      })()}

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
