import { useState, useEffect, type ReactElement } from 'react';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Mail,
  MessageCircle,
  X,
  CheckCircle2,
  AlertCircle,
  Workflow,
  Edit,
  Power,
  PowerOff,
  FileText,
  Calendar,
  Clock,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader,
  Type,
  List,
  Send,
  Users,
  Play,
  Info,
  DollarSign,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { format } from 'date-fns';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

// Plan options for finalkk template configuration
const PLAN_OPTIONS = [
  { key: 'PRIME', label: 'PRIME', price: 119, displayPrice: '$119', currency: 'USD' },
  { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199', currency: 'USD' },
  { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349', currency: 'USD' },
  { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599', currency: 'USD' },
];

interface WatiTemplate {
  name: string;
  id: string;
  status: string;
  category?: string;
  language?: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  domainName: string;
  templateId: string;
  senderEmail?: string;
  senderName?: string;
  createdAt: string;
}

interface WorkflowStep {
  channel: 'email' | 'whatsapp';
  daysAfter: number;
  templateId: string;
  templateName?: string;
  domainName?: string;
  senderEmail?: string;
  senderName?: string;
  order: number;
  templateConfig?: {
    planName?: string;
    planAmount?: number;
    days?: number;
  };
}

interface Workflow {
  _id?: string;
  workflowId: string;
  triggerAction: 'no-show' | 'complete' | 'cancel' | 're-schedule';
  steps: WorkflowStep[];
  isActive: boolean;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface WorkflowLog {
  _id: string;
  logId: string;
  workflowId: string;
  workflowName?: string;
  triggerAction: 'no-show' | 'complete' | 'cancel' | 're-schedule';
  bookingId: string;
  clientEmail: string;
  clientName?: string;
  clientPhone?: string;
  step: {
    channel: 'email' | 'whatsapp';
    daysAfter: number;
    templateId: string;
    templateName?: string;
    domainName?: string;
    senderEmail?: string;
    order: number;
  };
  status: 'scheduled' | 'executed' | 'failed';
  scheduledFor: string;
  executedAt?: string;
  error?: string;
  errorDetails?: any;
  responseData?: any;
  createdAt: string;
}

type ActiveTab = 'workflows' | 'logs' | 'bulk';
type LogStatus = 'scheduled' | 'executed' | 'all';

// Template variable mapping - maps template names to their available variables
const TEMPLATE_VARIABLES: Record<string, { variables: string[]; exampleContent?: string }> = {
  'plan_followup_utility_01dd': {
    variables: ['{{1}}', '{{2}}'],
    exampleContent: 'Hi {{1}},\n\nThis is a reminder regarding your recent plan with Flashfire. The payment of {{2}} is still pending.\n\nPlease let us know if you\'d like us to resend the payment link or if you need assistance.\n\nNeed help ?'
  },
  'finalkk': {
    variables: ['{{1}}', '{{2}}', '{{3}}'],
    exampleContent: 'Hi {{1}},\n\nThis is a payment reminder for your Flashfire {{2}} plan dated {{3}}.\n\nOur records show that the payment is still pending in the system.\n\nIf the payment has already been made, please disregard this message.'
  },
  // Add more templates as needed
};

// Common variable mappings
const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  '{{1}}': 'Client Name',
  '{{2}}': 'Plan Cost / Payment Amount',
  '{{3}}': 'Plan Name',
  '{{4}}': 'Meeting Date',
  '{{5}}': 'Meeting Time',
  '{{6}}': 'Reschedule Link',
  '{{7}}': 'Meeting Link',
};

// Helper function to get variables for a template
const getTemplateVariables = (templateName: string | undefined): string[] => {
  if (!templateName) return [];
  const template = TEMPLATE_VARIABLES[templateName];
  return template?.variables || [];
};

// Helper function to highlight variables in text
const highlightVariables = (text: string, variables: string[]): ReactElement[] => {
  if (!text) return [];
  
  const parts: Array<{ text: string; isVariable: boolean }> = [];
  let lastIndex = 0;
  
  // Find all variable occurrences
  const matches: Array<{ index: number; variable: string }> = [];
  variables.forEach(variable => {
    let index = text.indexOf(variable, lastIndex);
    while (index !== -1) {
      matches.push({ index, variable });
      index = text.indexOf(variable, index + 1);
    }
  });
  
  // Sort matches by index
  matches.sort((a, b) => a.index - b.index);
  
  // Build parts array
  matches.forEach((match) => {
    // Add text before variable
    if (match.index > lastIndex) {
      parts.push({ text: text.substring(lastIndex, match.index), isVariable: false });
    }
    // Add variable
    parts.push({ text: match.variable, isVariable: true });
    lastIndex = match.index + match.variable.length;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isVariable: false });
  }
  
  // If no variables found, return original text
  if (parts.length === 0) {
    parts.push({ text, isVariable: false });
  }
  
  return parts.map((part, i) => 
    part.isVariable ? (
      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold text-xs mx-0.5">
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
};

// Template Preview Component
const TemplatePreview = ({ templateName, variables }: { templateName?: string; variables: string[] }) => {
  if (!templateName || variables.length === 0) return null;
  
  const template = TEMPLATE_VARIABLES[templateName];
  const exampleContent = template?.exampleContent || '';
  
  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <Info size={14} className="text-blue-600" />
        <span className="text-xs font-semibold text-blue-900">Template Preview</span>
      </div>
      
      {exampleContent && (
        <div className="mb-3 p-2.5 bg-white rounded border border-blue-100 text-sm text-slate-700 whitespace-pre-wrap">
          {highlightVariables(exampleContent, variables)}
        </div>
      )}
      
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs font-semibold text-blue-900">Available Variables:</span>
        {variables.map((variable, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 text-blue-700 font-semibold text-xs"
            title={VARIABLE_DESCRIPTIONS[variable] || 'Variable'}
          >
            <span>{variable}</span>
            {VARIABLE_DESCRIPTIONS[variable] && (
              <span className="text-blue-600 text-[10px]">({VARIABLE_DESCRIPTIONS[variable]})</span>
            )}
          </span>
        ))}
      </div>
      
      <div className="mt-2 text-xs text-blue-700">
        <strong>Note:</strong> Variables will be automatically replaced with actual values when the workflow runs.
      </div>
    </div>
  );
};

export default function Workflows() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workflows');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [newWorkflow, setNewWorkflow] = useState<Partial<Workflow>>({
    triggerAction: 'no-show',
    steps: [],
    isActive: true,
  });

  // WATI Templates state
  const [watiTemplates, setWatiTemplates] = useState<WatiTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  // Email Templates state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loadingEmailTemplates, setLoadingEmailTemplates] = useState(false);
  const [useManualEmailInput, setUseManualEmailInput] = useState<{ [key: string]: boolean }>({});
  const [savingTemplate, setSavingTemplate] = useState<{ [key: string]: boolean }>({});

  // Logs state
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logStatusTab, setLogStatusTab] = useState<LogStatus>('all');
  const [logPage, setLogPage] = useState(1);
  const [totalLogPages, setTotalLogPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [sendingLogId, setSendingLogId] = useState<string | null>(null);
  const [logStats, setLogStats] = useState({
    total: 0,
    scheduled: 0,
    executed: 0,
    failed: 0,
  });

  // Bulk actions state
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [bookingsData, setBookingsData] = useState<any>(null);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [triggeringBulk, setTriggeringBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);

  // Plan configuration modal state for finalkk template
  const [showPlanConfigModal, setShowPlanConfigModal] = useState(false);
  const [planConfigStepIndex, setPlanConfigStepIndex] = useState<number | null>(null);
  const [planConfigWorkflowId, setPlanConfigWorkflowId] = useState<string | null>(null);
  const [planConfig, setPlanConfig] = useState<{ planName: string; planAmount: number; days: number }>({
    planName: 'PRIME',
    planAmount: 119,
    days: 7,
  });

  useEffect(() => {
    if (activeTab === 'workflows') {
      fetchWorkflows();
      fetchWatiTemplates();
      fetchEmailTemplates();
    } else if (activeTab === 'logs') {
      fetchLogs();
      fetchLogStats();
    } else if (activeTab === 'bulk' && selectedStatus) {
      fetchBookingsByStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'bulk' && selectedStatus) {
      fetchBookingsByStatus();
    }
  }, [selectedStatus]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [logPage, logStatusTab]);

  const fetchWatiTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/whatsapp-campaigns/templates`);
      const data = await response.json();

      if (data.success) {
        setWatiTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Error fetching WATI templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleSaveTemplate = async (workflowId: string, stepIndex: number, step: WorkflowStep) => {
    if (!step.templateId || !step.domainName) {
      showToast('Template ID and Domain Name are required', 'error');
      return;
    }

    // Find the template to get the original domainName from database
    const template = emailTemplates.find(t => t.templateId === step.templateId);
    if (!template) {
      showToast('Template not found. Please select a template from the list.', 'error');
      return;
    }

    // Use the original domainName from the database (might be email format)
    const dbDomainName = template.domainName;

    const key = `${workflowId}_${stepIndex}`;
    setSavingTemplate(prev => ({ ...prev, [key]: true }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/email-templates/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: step.templateId,
          domainName: dbDomainName, // Use the original domainName from database
          senderEmail: step.senderEmail || undefined,
          senderName: step.senderName || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showToast('Template saved successfully!', 'success');
        // Refresh templates to get updated data
        await fetchEmailTemplates();
      } else {
        showToast(data.message || 'Failed to save template', 'error');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      showToast('Failed to save template. Please try again.', 'error');
    } finally {
      setSavingTemplate(prev => ({ ...prev, [key]: false }));
    }
  };

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/workflows`);
      const data = await response.json();
      if (data.success) {
        setWorkflows(data.data || []);
      } else {
        showToast('Failed to fetch workflows', 'error');
      }
    } catch (error) {
      console.error('Error fetching workflows:', error);
      showToast('Error fetching workflows', 'error');
    } finally {
      setLoading(false);
    }
  };

  const addStepToWorkflow = (workflowId: string | null) => {
    const newStep: WorkflowStep = {
      channel: 'email',
      daysAfter: 0,
      templateId: '',
      domainName: 'flashfiremails.com',
      order: workflowId ? workflows.find((w) => w.workflowId === workflowId)?.steps.length || 0 : newWorkflow.steps?.length || 0,
    };

    if (workflowId && editingWorkflowId === workflowId) {
      const workflow = workflows.find((w) => w.workflowId === workflowId);
      if (workflow) {
        const updatedWorkflow = {
          ...workflow,
          steps: [...workflow.steps, newStep],
        };
        setWorkflows(workflows.map((w) => (w.workflowId === workflowId ? updatedWorkflow : w)));
      }
    } else {
      setNewWorkflow({
        ...newWorkflow,
        steps: [...(newWorkflow.steps || []), newStep],
      });
    }
  };

  const removeStepFromWorkflow = (workflowId: string | null, stepIndex: number) => {
    if (workflowId && editingWorkflowId === workflowId) {
      const workflow = workflows.find((w) => w.workflowId === workflowId);
      if (workflow) {
        const updatedSteps = workflow.steps.filter((_, index) => index !== stepIndex);
        const updatedWorkflow = {
          ...workflow,
          steps: updatedSteps.map((step, index) => ({ ...step, order: index })),
        };
        setWorkflows(workflows.map((w) => (w.workflowId === workflowId ? updatedWorkflow : w)));
      }
    } else {
      const updatedSteps = (newWorkflow.steps || []).filter((_, index) => index !== stepIndex);
      setNewWorkflow({
        ...newWorkflow,
        steps: updatedSteps.map((step, index) => ({ ...step, order: index })),
      });
    }
  };

  const updateStep = (workflowId: string | null, stepIndex: number, updates: Partial<WorkflowStep> | keyof WorkflowStep, value?: any) => {
    const fields = typeof updates === 'string' ? { [updates]: value } : updates;

    if (workflowId && editingWorkflowId === workflowId) {
      setWorkflows((prev) =>
        prev.map((w) => {
          if (w.workflowId !== workflowId) return w;
          const updatedSteps = w.steps.map((step, index) =>
            index === stepIndex ? { ...step, ...fields } : step
          );
          return { ...w, steps: updatedSteps };
        })
      );
    } else {
      setNewWorkflow((prev) => ({
        ...prev,
        steps: (prev.steps || []).map((step, index) =>
          index === stepIndex ? { ...step, ...fields } : step
        ),
      }));
    }
  };

  const saveWorkflow = async (workflow: Partial<Workflow>) => {
    try {
      setSaving(workflow.workflowId || 'new');

      if (!workflow.triggerAction || !workflow.steps || workflow.steps.length === 0) {
        showToast('Please fill in all required fields', 'error');
        return;
      }

      // Validate steps
      for (const step of workflow.steps) {
        if (!step.templateId || (typeof step.templateId === 'string' && step.templateId.trim() === '')) {
          showToast('All steps must have a template ID', 'error');
          return;
        }
      }

      const url = workflow.workflowId
        ? `${API_BASE_URL}/api/workflows/${workflow.workflowId}`
        : `${API_BASE_URL}/api/workflows`;

      const method = workflow.workflowId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          triggerAction: workflow.triggerAction,
          steps: workflow.steps,
          name: workflow.name || null,
          description: workflow.description || null,
          isActive: workflow.isActive !== undefined ? workflow.isActive : true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showToast(workflow.workflowId ? 'Workflow updated successfully' : 'Workflow created successfully', 'success');
        await fetchWorkflows();
        if (!workflow.workflowId) {
          setNewWorkflow({
            triggerAction: 'no-show',
            steps: [],
            isActive: true,
          });
        }
        setEditingWorkflowId(null);
      } else {
        showToast(data.message || 'Failed to save workflow', 'error');
      }
    } catch (error) {
      console.error('Error saving workflow:', error);
      showToast('Error saving workflow', 'error');
    } finally {
      setSaving(null);
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      setSaving(workflowId);
      const response = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        showToast('Workflow deleted successfully', 'success');
        await fetchWorkflows();
      } else {
        showToast(data.message || 'Failed to delete workflow', 'error');
      }
    } catch (error) {
      console.error('Error deleting workflow:', error);
      showToast('Error deleting workflow', 'error');
    } finally {
      setSaving(null);
    }
  };

  const toggleWorkflowActive = async (workflowId: string, currentStatus: boolean) => {
    try {
      setSaving(workflowId);
      const workflow = workflows.find((w) => w.workflowId === workflowId);
      if (!workflow) return;

      const response = await fetch(`${API_BASE_URL}/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: !currentStatus,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showToast(`Workflow ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        await fetchWorkflows();
      } else {
        showToast(data.message || 'Failed to update workflow', 'error');
      }
    } catch (error) {
      console.error('Error updating workflow:', error);
      showToast('Error updating workflow', 'error');
    } finally {
      setSaving(null);
    }
  };

  const startEditing = (workflowId: string) => {
    setEditingWorkflowId(workflowId);
  };

  const cancelEditing = () => {
    setEditingWorkflowId(null);
    fetchWorkflows();
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'no-show': 'No Show',
      'complete': 'Complete',
      'cancel': 'Cancel',
      're-schedule': 'Re-schedule',
    };
    return labels[action] || action;
  };

  // Logs functions
  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const status = logStatusTab === 'all' ? undefined : logStatusTab;
      const response = await fetch(
        `${API_BASE_URL}/api/workflow-logs?page=${logPage}&limit=20${status ? `&status=${status}` : ''}`
      );
      const data = await response.json();

      if (data.success) {
        setLogs(data.data || []);
        setTotalLogPages(data.pagination?.pages || 1);
        setTotalLogs(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Error fetching workflow logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchLogStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/workflow-logs/stats`);
      const data = await response.json();

      if (data.success) {
        setLogStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching workflow log stats:', error);
    }
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      'no-show': 'bg-rose-100 text-rose-700',
      'complete': 'bg-green-100 text-green-700',
      'cancel': 'bg-red-100 text-red-700',
      're-schedule': 'bg-amber-100 text-amber-700',
    };
    return colors[action] || 'bg-slate-100 text-slate-700';
  };

  const fetchBookingsByStatus = async () => {
    if (!selectedStatus) return;
    
    try {
      setLoadingBookings(true);
      const response = await fetch(`${API_BASE_URL}/api/workflows/bulk/bookings-by-status?status=${selectedStatus}`);
      const data = await response.json();

      if (data.success) {
        setBookingsData(data.data);
      } else {
        showToast(data.message || 'Failed to fetch bookings', 'error');
      }
    } catch (error) {
      console.error('Error fetching bookings by status:', error);
      showToast('Error fetching bookings', 'error');
    } finally {
      setLoadingBookings(false);
    }
  };

  const handleTriggerBulkWorkflows = async () => {
    if (!selectedStatus) {
      showToast('Please select a status first', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to trigger workflows for all bookings with status "${selectedStatus}"? This will send workflows to ${bookingsData?.summary?.withoutScheduledWorkflows || 0} bookings that don't already have workflows scheduled.`)) {
      return;
    }

    try {
      setTriggeringBulk(true);
      setBulkResult(null);
      
      const response = await fetch(`${API_BASE_URL}/api/workflows/bulk/trigger-by-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: selectedStatus,
          skipExisting: true
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBulkResult(data.data);
        showToast(`Successfully processed ${data.data.processed} bookings`, 'success');
        // Refresh bookings data
        await fetchBookingsByStatus();
        // Refresh logs
        if (activeTab === 'logs') {
          fetchLogs();
          fetchLogStats();
        }
      } else {
        showToast(data.message || 'Failed to trigger workflows', 'error');
      }
    } catch (error) {
      console.error('Error triggering bulk workflows:', error);
      showToast('Error triggering workflows', 'error');
    } finally {
      setTriggeringBulk(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-700">
            <Clock size={12} />
            Scheduled
          </span>
        );
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700">
            <CheckCircle2 size={12} />
            Executed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700">
            <XCircle size={12} />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white min-w-[300px] animate-in slide-in-from-right ${toast.type === 'success'
                ? 'bg-green-500'
                : toast.type === 'error'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={20} />}
            {toast.type === 'error' && <AlertCircle size={20} />}
            {toast.type === 'info' && <AlertCircle size={20} />}
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

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Workflow className="text-orange-500" size={32} />
            <h1 className="text-3xl font-bold text-slate-900">Workflows</h1>
          </div>
          <p className="text-slate-600">
            Automate actions when bookings are marked as no-show, complete, cancel, or re-schedule
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="border-b border-slate-200">
            <div className="flex items-center gap-1 px-4">
              <button
                onClick={() => setActiveTab('workflows')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'workflows'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Workflow size={16} className="inline mr-2" />
                Workflows
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'logs'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
              >
                <FileText size={16} className="inline mr-2" />
                Logs
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${activeTab === 'bulk'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Users size={16} className="inline mr-2" />
                Send to All
              </button>
            </div>
          </div>
        </div>

        {/* Workflows Tab Content */}
        {activeTab === 'workflows' && (
          <>
            {/* Create New Workflow */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Create New Workflow</h2>

              <div className="space-y-4">
                {/* Action Selector */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Trigger Action <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newWorkflow.triggerAction || 'no-show'}
                    onChange={(e) =>
                      setNewWorkflow({
                        ...newWorkflow,
                        triggerAction: e.target.value as any,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 bg-white"
                  >
                    <option value="no-show">No Show</option>
                    <option value="complete">Complete</option>
                    <option value="cancel">Cancel</option>
                    <option value="re-schedule">Re-schedule</option>
                  </select>
                </div>

                {/* Workflow Steps */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-slate-700">Workflow Steps</label>
                    <button
                      onClick={() => addStepToWorkflow(null)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add Step
                    </button>
                  </div>

                  {newWorkflow.steps && newWorkflow.steps.length > 0 ? (
                    <div className="space-y-3">
                      {newWorkflow.steps.map((step, index) => (
                        <div
                          key={index}
                          className="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-700">Step {index + 1}</span>
                            <button
                              onClick={() => removeStepFromWorkflow(null, index)}
                              className="text-red-500 hover:text-red-600 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0">
                            <div className="min-w-0">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Channel <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={step.channel}
                                onChange={(e) =>
                                  updateStep(null, index, 'channel', e.target.value as 'email' | 'whatsapp')
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                              >
                                <option value="email">Email</option>
                                <option value="whatsapp">WhatsApp</option>
                              </select>
                            </div>

                            <div className="min-w-0">
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Days After <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={step.daysAfter}
                                onChange={(e) =>
                                  updateStep(null, index, 'daysAfter', parseInt(e.target.value) || 0)
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                placeholder="0"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <label className="block text-xs font-medium text-slate-600 flex-shrink-0">
                                  {step.channel === 'email' ? 'Template Name' : 'Template Name'} <span className="text-red-500">*</span>
                                </label>
                                {step.channel === 'email' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const key = `new_${index}`;
                                      setUseManualEmailInput(prev => ({
                                        ...prev,
                                        [key]: !prev[key]
                                      }));
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors font-medium"
                                    title={useManualEmailInput[`new_${index}`] ? 'Switch to saved templates' : 'Enter template ID manually'}
                                  >
                                    {useManualEmailInput[`new_${index}`] ? (
                                      <>
                                        <List size={12} />
                                        <span>Use Templates</span>
                                      </>
                                    ) : (
                                      <>
                                        <Type size={12} />
                                        <span>Manual Entry</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              {step.channel === 'whatsapp' ? (
                                loadingTemplates ? (
                                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                                    <Loader className="animate-spin" size={14} />
                                    <span>Loading templates...</span>
                                  </div>
                                ) : (
                                  <>
                                    <select
                                      value={step.templateName || step.templateId || ''}
                                      onChange={(e) => {
                                        const template = watiTemplates.find(t => t.name === e.target.value);
                                        const templateName = e.target.value;
                                        
                                        updateStep(null, index, {
                                          templateId: template?.id || e.target.value,
                                          templateName: templateName
                                        });

                                        // If finalkk template is selected, show plan configuration modal
                                        if (templateName === 'finalkk') {
                                          setPlanConfigStepIndex(index);
                                          setPlanConfigWorkflowId(null);
                                          // Pre-fill with existing config or defaults
                                          const existingConfig = step.templateConfig;
                                          if (existingConfig) {
                                            setPlanConfig({
                                              planName: existingConfig.planName || 'PRIME',
                                              planAmount: existingConfig.planAmount || PLAN_OPTIONS.find(p => p.key === existingConfig.planName)?.price || 119,
                                              days: existingConfig.days || 7,
                                            });
                                          } else {
                                            setPlanConfig({
                                              planName: 'PRIME',
                                              planAmount: 119,
                                              days: 7,
                                            });
                                          }
                                          setShowPlanConfigModal(true);
                                        }
                                      }}
                                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                      required
                                    >
                                      {!step.templateName && !step.templateId ? (
                                        <option value="">Select WhatsApp Template</option>
                                      ) : null}
                                      {watiTemplates.map((template) => (
                                        <option key={template.id} value={template.name}>
                                          {template.name}
                                        </option>
                                      ))}
                                    </select>
                                    {step.templateName && (
                                      <TemplatePreview 
                                        templateName={step.templateName} 
                                        variables={getTemplateVariables(step.templateName)} 
                                      />
                                    )}
                                  </>
                                )
                              ) : useManualEmailInput[`new_${index}`] ? (
                                <input
                                  type="text"
                                  value={step.templateId || ''}
                                  onChange={(e) =>
                                    updateStep(null, index, 'templateId', e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                  placeholder="SendGrid Template ID"
                                  required
                                />
                              ) : (
                                loadingEmailTemplates ? (
                                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                                    <Loader className="animate-spin" size={14} />
                                    <span>Loading templates...</span>
                                  </div>
                                ) : (
                                  <div className="flex gap-1.5 min-w-0">
                                    <select
                                      value={step.templateName || ''}
                                      onChange={(e) => {
                                        if (e.target.value === '') {
                                          updateStep(null, index, {
                                            templateId: '',
                                            templateName: '',
                                            domainName: 'flashfiremails.com'
                                          });
                                          return;
                                        }
                                        const template = emailTemplates.find(t => t.name === e.target.value);
                                        if (template) {
                                          const domain = template.domainName?.includes('@')
                                            ? template.domainName.split('@')[1]
                                            : (template.domainName || 'flashfiremails.com');

                                          updateStep(null, index, {
                                            templateId: template.templateId,
                                            templateName: template.name,
                                            domainName: domain,
                                            senderEmail: template.senderEmail || '',
                                            senderName: template.senderName || ''
                                          });
                                        } else {
                                          updateStep(null, index, {
                                            templateId: e.target.value,
                                            templateName: e.target.value,
                                            domainName: 'flashfiremails.com'
                                          });
                                        }
                                      }}
                                      className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                      required
                                    >
                                      <option value="">Select Email Template</option>
                                      {emailTemplates.length === 0 ? (
                                        <option value="" disabled>No templates saved. Use manual input.</option>
                                      ) : (
                                        emailTemplates.map((template) => (
                                          <option key={template.id} value={template.name}>
                                            {template.name}
                                          </option>
                                        ))
                                      )}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const key = `new_${index}`;
                                        setUseManualEmailInput(prev => ({
                                          ...prev,
                                          [key]: !prev[key]
                                        }));
                                      }}
                                      className="flex-shrink-0 px-2.5 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
                                      title={useManualEmailInput[`new_${index}`] ? 'Switch to saved templates' : 'Enter template ID manually'}
                                    >
                                      {useManualEmailInput[`new_${index}`] ? (
                                        <List size={16} />
                                      ) : (
                                        <Type size={16} />
                                      )}
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                          {step.channel === 'email' && (
                            <div className="mt-2 space-y-2">
                              {step.templateName && (
                                <div className="text-xs text-slate-600 font-semibold px-2 py-1 bg-slate-50 rounded border border-slate-200">
                                  Template: {step.templateName}
                                </div>
                              )}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  Domain Name
                                </label>
                                <input
                                  type="text"
                                  value={step.domainName || 'flashfiremails.com'}
                                  onChange={(e) =>
                                    updateStep(null, index, 'domainName', e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                  placeholder="flashfiremails.com"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  Sender Email
                                  <span className="text-slate-400 text-xs ml-1">(e.g., elizabeth@flashfirehq.com or adit.jain@flashfirehq.com)</span>
                                </label>
                                <input
                                  type="email"
                                  value={step.senderEmail || ''}
                                  onChange={(e) =>
                                    updateStep(null, index, 'senderEmail', e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                  placeholder="elizabeth@flashfirehq.com"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  Sender Name
                                </label>
                                <input
                                  type="text"
                                  value={step.senderName || ''}
                                  onChange={(e) =>
                                    updateStep(null, index, 'senderName', e.target.value)
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 text-sm"
                                  placeholder="Sender Name (optional)"
                                />
                              </div>
                              {step.templateName && step.domainName && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveTemplate('new', index, step)}
                                  disabled={savingTemplate[`new_${index}`] || !step.templateId}
                                  className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                                >
                                  {savingTemplate[`new_${index}`] ? (
                                    <>
                                      <Loader className="animate-spin" size={14} />
                                      Saving...
                                    </>
                                  ) : (
                                    <>
                                      <Save size={14} />
                                      Save Template
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-slate-300 rounded-lg">
                      <p className="text-slate-500 text-sm">No steps added yet. Click "Add Step" to get started.</p>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => saveWorkflow(newWorkflow)}
                    disabled={saving === 'new' || !newWorkflow.steps || newWorkflow.steps.length === 0}
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                  >
                    {saving === 'new' ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save Workflow
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Existing Workflows */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Existing Workflows</h2>

              {loading ? (
                <div className="text-center py-12">
                  <Loader2 className="animate-spin mx-auto text-orange-500" size={32} />
                  <p className="text-slate-600 mt-2">Loading workflows...</p>
                </div>
              ) : workflows.length === 0 ? (
                <div className="text-center py-12">
                  <Workflow className="mx-auto text-slate-400 mb-3" size={48} />
                  <p className="text-slate-600">No workflows created yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workflows.map((workflow) => (
                    <div
                      key={workflow.workflowId}
                      className={`p-5 border rounded-lg ${workflow.isActive
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-300 bg-slate-50 opacity-75'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span
                              className={`px-3 py-1 rounded-lg text-xs font-semibold ${workflow.triggerAction === 'no-show'
                                  ? 'bg-rose-100 text-rose-700'
                                  : workflow.triggerAction === 'complete'
                                    ? 'bg-green-100 text-green-700'
                                    : workflow.triggerAction === 'cancel'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                                }`}
                            >
                              {getActionLabel(workflow.triggerAction)}
                            </span>
                            {workflow.name && (
                              <span className="text-sm font-semibold text-slate-900">{workflow.name}</span>
                            )}
                            {!workflow.isActive && (
                              <span className="text-xs text-slate-500">(Inactive)</span>
                            )}
                          </div>
                          {workflow.description && (
                            <p className="text-sm text-slate-600">{workflow.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleWorkflowActive(workflow.workflowId, workflow.isActive)}
                            disabled={saving === workflow.workflowId}
                            className={`p-2 rounded-lg transition ${workflow.isActive
                                ? 'text-green-600 hover:bg-green-50'
                                : 'text-slate-400 hover:bg-slate-100'
                              }`}
                            title={workflow.isActive ? 'Deactivate workflow' : 'Activate workflow'}
                          >
                            {workflow.isActive ? <Power size={18} /> : <PowerOff size={18} />}
                          </button>
                          {editingWorkflowId === workflow.workflowId ? (
                            <>
                              <button
                                onClick={() => saveWorkflow(workflow)}
                                disabled={saving === workflow.workflowId}
                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                title="Save changes"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                title="Cancel editing"
                              >
                                <X size={18} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditing(workflow.workflowId)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Edit workflow"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => deleteWorkflow(workflow.workflowId)}
                                disabled={saving === workflow.workflowId}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Delete workflow"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Workflow Steps */}
                      <div className="space-y-2">
                        {editingWorkflowId === workflow.workflowId ? (
                          <>
                            {workflow.steps.map((step, index) => (
                              <div
                                key={index}
                                className="p-3 border border-slate-200 rounded-lg bg-slate-50 overflow-hidden"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-700">Step {index + 1}</span>
                                  <button
                                    onClick={() => removeStepFromWorkflow(workflow.workflowId, index)}
                                    className="text-red-500 hover:text-red-600 transition"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <div className="space-y-2">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <select
                                      value={step.channel}
                                      onChange={(e) =>
                                        updateStep(workflow.workflowId, index, 'channel', e.target.value)
                                      }
                                      className="px-2 py-1.5 border border-slate-300 rounded text-sm min-w-0"
                                    >
                                      <option value="email">Email</option>
                                      <option value="whatsapp">WhatsApp</option>
                                    </select>
                                    <input
                                      type="number"
                                      min="0"
                                      value={step.daysAfter}
                                      onChange={(e) =>
                                        updateStep(workflow.workflowId, index, 'daysAfter', parseInt(e.target.value) || 0)
                                      }
                                      className="px-2 py-1.5 border border-slate-300 rounded text-sm min-w-0"
                                      placeholder="Days after"
                                    />
                                    <div className="min-w-0">
                                    {step.channel === 'whatsapp' ? (
                                      loadingTemplates ? (
                                        <div className="flex items-center gap-1 text-slate-500 text-xs px-2 py-1.5">
                                          <Loader className="animate-spin" size={12} />
                                          <span>Loading...</span>
                                        </div>
                                      ) : (
                                        <>
                                          <select
                                            value={step.templateName || step.templateId || ''}
                                            onChange={(e) => {
                                              const template = watiTemplates.find(t => t.name === e.target.value);
                                              const templateName = e.target.value;
                                              
                                              updateStep(workflow.workflowId, index, {
                                                templateId: template?.id || e.target.value,
                                                templateName: templateName
                                              });

                                              // If finalkk template is selected, show plan configuration modal
                                              if (templateName === 'finalkk') {
                                                setPlanConfigStepIndex(index);
                                                setPlanConfigWorkflowId(workflow.workflowId);
                                                // Pre-fill with existing config or defaults
                                                const existingConfig = step.templateConfig;
                                                if (existingConfig) {
                                                  setPlanConfig({
                                                    planName: existingConfig.planName || 'PRIME',
                                                    planAmount: existingConfig.planAmount || PLAN_OPTIONS.find(p => p.key === existingConfig.planName)?.price || 119,
                                                    days: existingConfig.days || 7,
                                                  });
                                                } else {
                                                  setPlanConfig({
                                                    planName: 'PRIME',
                                                    planAmount: 119,
                                                    days: 7,
                                                  });
                                                }
                                                setShowPlanConfigModal(true);
                                              }
                                            }}
                                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                            required
                                          >
                                            {!step.templateName && !step.templateId ? (
                                              <option value="">Select Template</option>
                                            ) : null}
                                            {watiTemplates.map((template) => (
                                              <option key={template.id} value={template.name}>
                                                {template.name}
                                              </option>
                                            ))}
                                          </select>
                                        </>
                                      )
                                    ) : useManualEmailInput[`edit_${workflow.workflowId}_${index}`] ? (
                                      <input
                                        type="text"
                                        value={step.templateId || ''}
                                        onChange={(e) =>
                                          updateStep(workflow.workflowId, index, 'templateId', e.target.value)
                                        }
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                        placeholder="Template ID"
                                        required
                                      />
                                    ) : (
                                      loadingEmailTemplates ? (
                                        <div className="flex items-center gap-1 text-slate-500 text-xs px-2 py-1.5">
                                          <Loader className="animate-spin" size={12} />
                                          <span>Loading...</span>
                                        </div>
                                      ) : (
                                        <div className="flex gap-1.5 min-w-0">
                                          <select
                                            value={step.templateName || ''}
                                            onChange={(e) => {
                                              if (e.target.value === '') {
                                                updateStep(workflow.workflowId, index, {
                                                  templateId: '',
                                                  templateName: '',
                                                  domainName: 'flashfiremails.com'
                                                });
                                                return;
                                              }
                                              const template = emailTemplates.find(t => t.name === e.target.value);
                                              if (template) {
                                                const domain = template.domainName?.includes('@')
                                                  ? template.domainName.split('@')[1]
                                                  : (template.domainName || 'flashfiremails.com');

                                                updateStep(workflow.workflowId, index, {
                                                  templateId: template.templateId,
                                                  templateName: template.name,
                                                  domainName: domain,
                                                  senderEmail: template.senderEmail || '',
                                                  senderName: template.senderName || ''
                                                });
                                              } else {
                                                updateStep(workflow.workflowId, index, {
                                                  templateId: e.target.value,
                                                  templateName: e.target.value,
                                                  domainName: 'flashfiremails.com'
                                                });
                                              }
                                            }}
                                            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-300 rounded text-sm"
                                            required
                                          >
                                            <option value="">Select Email Template</option>
                                            {emailTemplates.length === 0 ? (
                                              <option value="" disabled>No templates saved</option>
                                            ) : (
                                              emailTemplates.map((template) => (
                                                <option key={template.id} value={template.name}>
                                                  {template.name}
                                                </option>
                                              ))
                                            )}
                                          </select>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const key = `edit_${workflow.workflowId}_${index}`;
                                              setUseManualEmailInput(prev => ({
                                                ...prev,
                                                [key]: !prev[key]
                                              }));
                                            }}
                                            className="flex-shrink-0 px-2 py-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-300 rounded text-sm transition-colors"
                                            title={useManualEmailInput[`edit_${workflow.workflowId}_${index}`] ? 'Switch to saved templates' : 'Enter template ID manually'}
                                          >
                                            {useManualEmailInput[`edit_${workflow.workflowId}_${index}`] ? (
                                              <List size={14} />
                                            ) : (
                                              <Type size={14} />
                                            )}
                                          </button>
                                        </div>
                                      )
                                    )}
                                  </div>
                                  </div>
                                  {step.channel === 'whatsapp' && step.templateName && (
                                    <TemplatePreview 
                                      templateName={step.templateName} 
                                      variables={getTemplateVariables(step.templateName)} 
                                    />
                                  )}
                                </div>
                                {step.channel === 'email' && (
                                  <div className="mt-2 space-y-2">
                                    {step.templateName && (
                                      <div className="text-xs text-slate-600 font-semibold px-2 py-1 bg-slate-50 rounded border border-slate-200">
                                        Template: {step.templateName}
                                      </div>
                                    )}
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Domain Name
                                      </label>
                                      <input
                                        type="text"
                                        value={step.domainName || 'flashfiremails.com'}
                                        onChange={(e) =>
                                          updateStep(workflow.workflowId, index, 'domainName', e.target.value)
                                        }
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                        placeholder="flashfiremails.com"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Sender Email
                                        <span className="text-slate-400 text-xs ml-1">(e.g., elizabeth@flashfirehq.com or adit.jain@flashfirehq.com)</span>
                                      </label>
                                      <input
                                        type="email"
                                        value={step.senderEmail || ''}
                                        onChange={(e) =>
                                          updateStep(workflow.workflowId, index, 'senderEmail', e.target.value)
                                        }
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                        placeholder="elizabeth@flashfirehq.com"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">
                                        Sender Name
                                      </label>
                                      <input
                                        type="text"
                                        value={step.senderName || ''}
                                        onChange={(e) =>
                                          updateStep(workflow.workflowId, index, 'senderName', e.target.value)
                                        }
                                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                                        placeholder="Sender Name (optional)"
                                      />
                                    </div>
                                    {step.templateName && step.domainName && (
                                      <button
                                        type="button"
                                        onClick={() => handleSaveTemplate(workflow.workflowId, index, step)}
                                        disabled={savingTemplate[`${workflow.workflowId}_${index}`] || !step.templateId}
                                        className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                                      >
                                        {savingTemplate[`${workflow.workflowId}_${index}`] ? (
                                          <>
                                            <Loader className="animate-spin" size={14} />
                                            Saving...
                                          </>
                                        ) : (
                                          <>
                                            <Save size={14} />
                                            Save Template
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => addStepToWorkflow(workflow.workflowId)}
                              className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-orange-500 hover:text-orange-500 transition text-sm font-medium"
                            >
                              <Plus size={16} className="inline mr-1" />
                              Add Step
                            </button>
                          </>
                        ) : (
                          workflow.steps.map((step, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                            >
                              <div className="flex items-center gap-2 text-slate-600">
                                {step.channel === 'email' ? (
                                  <Mail size={16} className="text-blue-500" />
                                ) : (
                                  <MessageCircle size={16} className="text-green-500" />
                                )}
                                <span className="text-sm font-medium">
                                  {step.channel === 'email' ? 'Email' : 'WhatsApp'}
                                </span>
                              </div>
                              <span className="text-sm text-slate-600">
                                {step.daysAfter === 0 ? 'Immediately' : `After ${step.daysAfter} day${step.daysAfter !== 1 ? 's' : ''}`}
                              </span>
                              <span className="text-sm text-slate-500 flex-1 truncate">
                                Template: {step.templateName || step.templateId}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Logs Tab Content */}
        {activeTab === 'logs' && (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Total Logs</p>
                    <p className="text-2xl font-bold text-slate-900">{logStats.total}</p>
                  </div>
                  <FileText className="text-slate-400" size={24} />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Scheduled</p>
                    <p className="text-2xl font-bold text-blue-600">{logStats.scheduled}</p>
                  </div>
                  <Clock className="text-blue-400" size={24} />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Executed</p>
                    <p className="text-2xl font-bold text-green-600">{logStats.executed}</p>
                  </div>
                  <CheckCircle2 className="text-green-400" size={24} />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 mb-1">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{logStats.failed}</p>
                  </div>
                  <XCircle className="text-red-400" size={24} />
                </div>
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="border-b border-slate-200">
                <div className="flex items-center gap-1 px-4">
                  <button
                    onClick={() => {
                      setLogStatusTab('all');
                      setLogPage(1);
                    }}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${logStatusTab === 'all'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    All Logs ({totalLogs})
                  </button>
                  <button
                    onClick={() => {
                      setLogStatusTab('scheduled');
                      setLogPage(1);
                    }}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${logStatusTab === 'scheduled'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Scheduled ({logStats.scheduled})
                  </button>
                  <button
                    onClick={() => {
                      setLogStatusTab('executed');
                      setLogPage(1);
                    }}
                    className={`px-4 py-3 text-sm font-semibold border-b-2 transition ${logStatusTab === 'executed'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    Completed ({logStats.executed})
                  </button>
                </div>
              </div>

              <div className="p-6">
                {logsLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="animate-spin mx-auto text-orange-500" size={32} />
                    <p className="text-slate-600 mt-2">Loading logs...</p>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="mx-auto text-slate-400 mb-3" size={48} />
                    <p className="text-slate-600">No logs found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Action</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Client</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Channel</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Template</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Scheduled For</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Executed At</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Workflow</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {logs.map((log) => (
                            <tr key={log.logId} className="hover:bg-slate-50 transition">
                              <td className="py-4 px-4">
                                {getStatusBadge(log.status)}
                              </td>
                              <td className="py-4 px-4">
                                <span
                                  className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${getActionColor(
                                    log.triggerAction
                                  )}`}
                                >
                                  {getActionLabel(log.triggerAction)}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {log.clientName || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-slate-500">{log.clientEmail}</p>
                                  {log.clientPhone && (
                                    <p className="text-xs text-slate-500">{log.clientPhone}</p>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                  {log.step.channel === 'email' ? (
                                    <>
                                      <Mail size={16} className="text-blue-500" />
                                      <span className="text-sm text-slate-700">Email</span>
                                    </>
                                  ) : (
                                    <>
                                      <MessageCircle size={16} className="text-green-500" />
                                      <span className="text-sm text-slate-700">WhatsApp</span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div>
                                  <p className="text-sm text-slate-900 font-mono">
                                    {log.step.templateId}
                                  </p>
                                  {log.step.daysAfter > 0 && (
                                    <p className="text-xs text-slate-500">
                                      After {log.step.daysAfter} day{log.step.daysAfter !== 1 ? 's' : ''}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-1 text-sm text-slate-700">
                                  <Calendar size={14} />
                                  {format(new Date(log.scheduledFor), 'MMM d, yyyy • h:mm a')}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                {log.executedAt ? (
                                  <div className="flex items-center gap-1 text-sm text-slate-700">
                                    <CheckCircle2 size={14} className="text-green-500" />
                                    {format(new Date(log.executedAt), 'MMM d, yyyy • h:mm a')}
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <div>
                                  <p className="text-sm text-slate-900">
                                    {log.workflowName || 'Unnamed Workflow'}
                                  </p>
                                  <p className="text-xs text-slate-500 font-mono">
                                    {log.workflowId.slice(0, 8)}...
                                  </p>
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                {log.step.channel === 'email' && log.status !== 'executed' && (
                                  <button
                                    onClick={async () => {
                                      if (sendingLogId === log.logId) return;

                                      try {
                                        setSendingLogId(log.logId);
                                        const response = await fetch(
                                          `${API_BASE_URL}/api/workflow-logs/${log.logId}/send-now`,
                                          {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                          }
                                        );

                                        const data = await response.json();

                                        if (data.success) {
                                          showToast('Email sent successfully!', 'success');
                                          // Refresh logs
                                          fetchLogs();
                                          fetchLogStats();
                                        } else {
                                          showToast(data.message || 'Failed to send email', 'error');
                                        }
                                      } catch (error) {
                                        console.error('Error sending email:', error);
                                        showToast('Failed to send email', 'error');
                                      } finally {
                                        setSendingLogId(null);
                                      }
                                    }}
                                    disabled={sendingLogId === log.logId}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Send email now"
                                  >
                                    {sendingLogId === log.logId ? (
                                      <>
                                        <Loader2 className="animate-spin" size={14} />
                                        <span>Sending...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Send size={14} />
                                        <span>Send Now</span>
                                      </>
                                    )}
                                  </button>
                                )}
                                {log.status === 'executed' && (
                                  <span className="text-xs text-green-600 font-medium">Sent</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Error Details */}
                    {logs.some((log) => log.error) && (
                      <div className="mt-4 space-y-2">
                        {logs
                          .filter((log) => log.error)
                          .map((log) => (
                            <div
                              key={log.logId}
                              className="p-3 bg-red-50 border border-red-200 rounded-lg"
                            >
                              <div className="flex items-start gap-2">
                                <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-red-900">
                                    {log.clientEmail} - {log.step.channel}
                                  </p>
                                  <p className="text-xs text-red-700 mt-1">{log.error}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Pagination */}
                    {totalLogPages > 1 && (
                      <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200">
                        <div className="text-sm text-slate-600">
                          Showing {((logPage - 1) * 20) + 1} to {Math.min(logPage * 20, totalLogs)} of {totalLogs} logs
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                            disabled={logPage === 1}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronLeft size={16} className="inline" />
                            Previous
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalLogPages) }, (_, i) => {
                              let pageNum;
                              if (totalLogPages <= 5) {
                                pageNum = i + 1;
                              } else if (logPage <= 3) {
                                pageNum = i + 1;
                              } else if (logPage >= totalLogPages - 2) {
                                pageNum = totalLogPages - 4 + i;
                              } else {
                                pageNum = logPage - 2 + i;
                              }
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setLogPage(pageNum)}
                                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${logPage === pageNum
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
                            onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                            disabled={logPage === totalLogPages}
                            className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                            <ChevronRight size={16} className="inline" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Refresh Button */}
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={() => {
                          fetchLogs();
                          fetchLogStats();
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition text-sm font-semibold"
                      >
                        <RefreshCw size={16} />
                        Refresh
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Bulk Actions Tab Content */}
        {activeTab === 'bulk' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Send Workflows to All</h2>
              <p className="text-slate-600 mb-6">
                Manually trigger workflows for all bookings with a specific status. The system will automatically skip bookings that already have workflows scheduled.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setBookingsData(null);
                      setBulkResult(null);
                    }}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 bg-white"
                  >
                    <option value="">Select a status...</option>
                    <option value="no-show">No Show</option>
                    <option value="completed">Completed</option>
                    <option value="canceled">Canceled</option>
                    <option value="rescheduled">Rescheduled</option>
                  </select>
                </div>

                {selectedStatus && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchBookingsByStatus}
                      disabled={loadingBookings}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition text-sm font-semibold disabled:opacity-60"
                    >
                      {loadingBookings ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          Check Bookings
                        </>
                      )}
                    </button>
                  </div>
                )}

                {bookingsData && (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                        <div className="text-sm text-slate-600 mb-1">Total Bookings</div>
                        <div className="text-2xl font-bold text-slate-900">{bookingsData.summary.total}</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                        <div className="text-sm text-blue-600 mb-1">With Scheduled Workflows</div>
                        <div className="text-2xl font-bold text-blue-700">{bookingsData.summary.withScheduledWorkflows}</div>
                      </div>
                      <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                        <div className="text-sm text-green-600 mb-1">Without Workflows</div>
                        <div className="text-2xl font-bold text-green-700">{bookingsData.summary.withoutScheduledWorkflows}</div>
                      </div>
                    </div>

                    {bookingsData.summary.withoutScheduledWorkflows > 0 && (
                      <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
                        <button
                          onClick={handleTriggerBulkWorkflows}
                          disabled={triggeringBulk || bookingsData.summary.withoutScheduledWorkflows === 0}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {triggeringBulk ? (
                            <>
                              <Loader2 className="animate-spin" size={18} />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Play size={18} />
                              Trigger Workflows for {bookingsData.summary.withoutScheduledWorkflows} Bookings
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {bulkResult && (
                      <div className={`mt-4 p-4 rounded-lg border ${
                        bulkResult.errors && bulkResult.errors.length > 0
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-start gap-3">
                          {bulkResult.errors && bulkResult.errors.length > 0 ? (
                            <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
                          ) : (
                            <CheckCircle2 className="text-green-600 mt-0.5" size={20} />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold text-slate-900 mb-2">Bulk Action Results</div>
                            <div className="space-y-1 text-sm text-slate-700">
                              <div>Total: {bulkResult.total}</div>
                              <div className="text-green-700">Processed: {bulkResult.processed}</div>
                              <div className="text-slate-600">Skipped: {bulkResult.skipped}</div>
                              {bulkResult.errors && bulkResult.errors.length > 0 && (
                                <div className="text-red-700 mt-2">
                                  Errors: {bulkResult.errors.length}
                                  <div className="mt-2 space-y-1">
                                    {bulkResult.errors.slice(0, 5).map((error: any, idx: number) => (
                                      <div key={idx} className="text-xs">
                                        {error.clientEmail}: {error.error}
                                      </div>
                                    ))}
                                    {bulkResult.errors.length > 5 && (
                                      <div className="text-xs text-slate-500">
                                        ... and {bulkResult.errors.length - 5} more errors
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {bookingsData.summary.withoutScheduledWorkflows === 0 && bookingsData.summary.total > 0 && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <Info className="text-blue-600 mt-0.5" size={20} />
                          <div className="text-sm text-blue-800">
                            All bookings with this status already have workflows scheduled. No action needed.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bookings List */}
            {bookingsData && bookingsData.bookings && bookingsData.bookings.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900">Bookings List</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Showing {bookingsData.bookings.length} booking{bookingsData.bookings.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Client</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Email</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Phone</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Workflows</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bookingsData.bookings.slice(0, 50).map((booking: any) => (
                        <tr key={booking.bookingId} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4">
                            <div className="text-sm font-medium text-slate-900">
                              {booking.clientName || 'Unknown'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm text-slate-700">{booking.clientEmail}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-sm text-slate-700">{booking.clientPhone || '—'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${getActionColor(booking.bookingStatus)}`}>
                              {getActionLabel(booking.bookingStatus === 'completed' ? 'complete' : 
                                               booking.bookingStatus === 'canceled' ? 'cancel' :
                                               booking.bookingStatus === 'rescheduled' ? 're-schedule' : 'no-show')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {booking.hasScheduledWorkflows ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-green-600" />
                                <span className="text-sm text-green-700">
                                  {booking.scheduledWorkflowsCount} scheduled
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-slate-400">None</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bookingsData.bookings.length > 50 && (
                    <div className="p-4 text-center text-sm text-slate-600 border-t border-slate-200">
                      Showing first 50 of {bookingsData.bookings.length} bookings
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Plan Configuration Modal for finalkk template */}
      {showPlanConfigModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={() => setShowPlanConfigModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Configure Plan Details</h3>
                <p className="text-sm text-slate-500">Set plan information for finalkk template</p>
              </div>
              <button
                onClick={() => setShowPlanConfigModal(false)}
                className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Plan Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <DollarSign size={16} className="inline mr-2" />
                  Plan <span className="text-red-500">*</span>
                </label>
                <select
                  value={planConfig.planName}
                  onChange={(e) => {
                    const selectedPlan = PLAN_OPTIONS.find(p => p.key === e.target.value);
                    if (selectedPlan) {
                      setPlanConfig({
                        ...planConfig,
                        planName: selectedPlan.key,
                        planAmount: selectedPlan.price,
                      });
                    }
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan.key} value={plan.key}>
                      {plan.label} - {plan.displayPrice}
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan Amount (Customizable) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Plan Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={planConfig.planAmount}
                  onChange={(e) => {
                    const amount = parseFloat(e.target.value) || 0;
                    setPlanConfig({
                      ...planConfig,
                      planAmount: amount,
                    });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                  placeholder="Enter amount"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Default amount from plan: {PLAN_OPTIONS.find(p => p.key === planConfig.planName)?.displayPrice || '$0'}
                </p>
              </div>

              {/* Days */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  <CalendarIcon size={16} className="inline mr-2" />
                  Days from Execution <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={planConfig.days}
                  onChange={(e) => {
                    const days = parseInt(e.target.value) || 0;
                    setPlanConfig({
                      ...planConfig,
                      days: days,
                    });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                  placeholder="7"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Default: 7 days. This will be used to calculate the date for {'{{3}}'} variable.
                </p>
              </div>

              {/* Info Box */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <p className="font-semibold mb-1">Template Variables:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>{'{{1}}'}</strong> = Client Name</li>
                  <li><strong>{'{{2}}'}</strong> = Plan Name ({planConfig.planName})</li>
                  <li><strong>{'{{3}}'}</strong> = Date ({planConfig.days} days from execution)</li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowPlanConfigModal(false)}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (planConfigStepIndex !== null) {
                    if (planConfigWorkflowId) {
                      // Update existing workflow step
                      updateStep(planConfigWorkflowId, planConfigStepIndex, {
                        templateConfig: {
                          planName: planConfig.planName,
                          planAmount: planConfig.planAmount,
                          days: planConfig.days,
                        },
                      });
                    } else {
                      // Update new workflow step
                      updateStep(null, planConfigStepIndex, {
                        templateConfig: {
                          planName: planConfig.planName,
                          planAmount: planConfig.planAmount,
                          days: planConfig.days,
                        },
                      });
                    }
                  }
                  setShowPlanConfigModal(false);
                  showToast('Plan configuration saved', 'success');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold"
              >
                <Save size={18} />
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

