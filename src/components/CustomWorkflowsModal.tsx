import { useState, useEffect, useCallback, type ReactElement } from 'react';
import {
  X,
  Loader2,
  Plus,
  Trash2,
  Play,
  Workflow,
  ChevronRight,
  Info,
  Link2,
} from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

const TEMPLATE_VARIABLES: Record<string, { variables: string[]; exampleContent?: string }> = {
  'plan_followup_utility_01dd': {
    variables: ['{{1}}', '{{2}}'],
    exampleContent: 'Hi {{1}},\n\nThis is a reminder regarding your recent plan with Flashfire. The payment of {{2}} is still pending.\n\nPlease let us know if you\'d like us to resend the payment link or if you need assistance.\n\nNeed help ?'
  },
  'finalkk': {
    variables: ['{{1}}', '{{2}}', '{{3}}'],
    exampleContent: 'Hi {{1}},\n\nThis is a payment reminder for your Flashfire {{2}} plan dated {{3}}.\n\nOur records show that the payment is still pending in the system.\n\nIf the payment has already been made, please disregard this message.'
  },
  'cancelled1': {
    variables: ['{{1}}', '{{2}}', '{{3}}', '{{4}}'],
    exampleContent: 'Hi {{1}},\n\nThe Flashfire consultation scheduled for {{2}} at {{3}} could not take place.\n\nYou can use the link below to choose a new time:\n{{4}}.\n\nIf you need any assistance, feel free to reply to this message.'
  },
  'flashfire_appointment_reminder': {
    variables: ['{{1}}', '{{2}}', '{{3}}', '{{4}}', '{{5}}'],
    exampleContent: 'Hi {{1}}, your Flashfire consultation is confirmed for {{2}} at {{3}}.\n\n👉 Join the call here: {{4}}\n\nNeed to reschedule? You can select another time here: {{5}}\n\nLooking forward to speaking with you!'
  },
  'meta_1': {
    variables: ['{{1}}', '{{2}}'],
    exampleContent: 'Hi {{1}},\n\nThank you for submitting your request to Flashfire. To continue with the next step, you can schedule your consultation here: {{2}}'
  },
};

const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  '{{1}}': 'Client Name',
  '{{2}}': 'Plan Cost / Payment Amount / Date',
  '{{3}}': 'Plan Name / Time with Timezone',
  '{{4}}': 'Meeting Date / Reschedule Link',
  '{{5}}': 'Meeting Time / Reschedule Link',
  '{{6}}': 'Reschedule Link',
  '{{7}}': 'Meeting Link',
};

function getVariableDescriptionCustom(templateName: string | undefined, variable: string): string {
  if (templateName === 'cancelled1') {
    switch (variable) {
      case '{{1}}': return 'Client Name';
      case '{{2}}': return 'Date (e.g., Jan 05)';
      case '{{3}}': return 'Time with Timezone (e.g., 4pm – 4:15pm ET)';
      case '{{4}}': return 'Reschedule Link';
      default: return VARIABLE_DESCRIPTIONS[variable] || 'Variable';
    }
  }
  if (templateName === 'flashfire_appointment_reminder') {
    switch (variable) {
      case '{{1}}': return 'Client Name';
      case '{{2}}': return 'Date';
      case '{{3}}': return 'Time with Timezone';
      case '{{4}}': return 'Meeting Link';
      case '{{5}}': return 'Reschedule Link';
      default: return VARIABLE_DESCRIPTIONS[variable] || 'Variable';
    }
  }
  if (templateName === 'meta_1') {
    switch (variable) {
      case '{{1}}': return 'Client Name';
      case '{{2}}': return 'Scheduling Link';
      default: return VARIABLE_DESCRIPTIONS[variable] || 'Variable';
    }
  }
  return VARIABLE_DESCRIPTIONS[variable] || 'Variable';
}

function getTemplateVariablesCustom(templateName: string | undefined): string[] {
  if (!templateName) return [];
  const template = TEMPLATE_VARIABLES[templateName];
  return template?.variables || [];
}

function highlightVariablesCustom(text: string, variables: string[]): ReactElement[] {
  if (!text) return [];
  const parts: Array<{ text: string; isVariable: boolean }> = [];
  let lastIndex = 0;
  const matches: Array<{ index: number; variable: string }> = [];
  variables.forEach(variable => {
    let index = text.indexOf(variable, lastIndex);
    while (index !== -1) {
      matches.push({ index, variable });
      index = text.indexOf(variable, index + 1);
    }
  });
  matches.sort((a, b) => a.index - b.index);
  matches.forEach((match) => {
    if (match.index > lastIndex) {
      parts.push({ text: text.substring(lastIndex, match.index), isVariable: false });
    }
    parts.push({ text: match.variable, isVariable: true });
    lastIndex = match.index + match.variable.length;
  });
  if (lastIndex < text.length) {
    parts.push({ text: text.substring(lastIndex), isVariable: false });
  }
  if (parts.length === 0) {
    parts.push({ text, isVariable: false });
  }
  return parts.map((part, i) =>
    part.isVariable ? (
      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold text-xs mx-0.5 border border-blue-200">
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

function TemplatePreviewBlock({ templateName, variables }: { templateName?: string; variables: string[] }) {
  if (!templateName || variables.length === 0) return null;
  const template = TEMPLATE_VARIABLES[templateName];
  const exampleContent = template?.exampleContent || '';
  return (
    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Info size={14} className="text-blue-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-blue-900">Template Preview</span>
      </div>
      {exampleContent ? (
        <div className="mb-3 p-2.5 bg-white rounded border border-blue-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
          {highlightVariablesCustom(exampleContent, variables)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs font-semibold text-blue-900">Available Variables:</span>
        {variables.map((variable, idx) => {
          const description = getVariableDescriptionCustom(templateName, variable);
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200"
              title={description}
            >
              <span>{variable}</span>
              {description ? (
                <span className="text-blue-600 text-[10px]">({description})</span>
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-blue-700">
        <strong>Note:</strong> Variables will be automatically replaced with actual values when the workflow runs.
      </div>
    </div>
  );
}

interface WatiTemplate {
  name: string;
  id: string;
  status: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  domainName: string;
  templateId: string;
  senderEmail?: string;
}

interface WorkflowStep {
  channel: 'email' | 'whatsapp';
  daysAfter: number;
  hoursAfter: number;
  templateId: string;
  templateName?: string;
  domainName?: string;
  senderEmail?: string;
  order: number;
}

interface CustomWorkflow {
  workflowId: string;
  name?: string;
  steps: WorkflowStep[];
  isActive: boolean;
}

interface CustomWorkflowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  clientName: string;
  onSuccess?: () => void;
}

export default function CustomWorkflowsModal({
  isOpen,
  onClose,
  bookingId,
  clientName,
  onSuccess,
}: CustomWorkflowsModalProps) {
  const { token } = useCrmAuth();
  const [workflows, setWorkflows] = useState<CustomWorkflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createStep, setCreateStep] = useState<0 | 1>(0);
  const [templateName, setTemplateName] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [detachingId, setDetachingId] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [allCustomWorkflows, setAllCustomWorkflows] = useState<Array<{ workflowId: string; name?: string }>>([]);
  const [watiTemplates, setWatiTemplates] = useState<WatiTemplate[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const headers = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const fetchWorkflows = useCallback(async () => {
    if (!bookingId || !isOpen) return;
    setLoading(true);
    try {
      const [attachedRes, allRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows`, { headers: headers() }),
        fetch(`${API_BASE_URL}/api/workflows?isCustom=true`, { headers: headers() }),
      ]);
      const attachedData = await attachedRes.json();
      const allData = await allRes.json();
      if (attachedData.success && attachedData.data?.workflows) {
        setWorkflows(attachedData.data.workflows);
      }
      if (allData.success && Array.isArray(allData.data)) {
        setAllCustomWorkflows(allData.data.map((w: { workflowId: string; name?: string }) => ({ workflowId: w.workflowId, name: w.name })));
      } else {
        setAllCustomWorkflows([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [bookingId, isOpen, token]);

  useEffect(() => {
    if (isOpen) {
      fetchWorkflows();
      setCreateStep(0);
      setTemplateName('');
      setSteps([]);
    }
  }, [isOpen, fetchWorkflows]);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const [watiRes, emailRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/whatsapp-campaigns/templates`),
        fetch(`${API_BASE_URL}/api/email-templates`),
      ]);
      const watiData = await watiRes.json();
      const emailData = await emailRes.json();
      if (watiData.success && watiData.templates) setWatiTemplates(watiData.templates);
      if (emailData.success && emailData.templates) setEmailTemplates(emailData.templates);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (createStep === 1 && steps.length === 0) {
      fetchTemplates();
    }
  }, [createStep, steps.length, fetchTemplates]);

  const handleTrigger = async (workflowId: string) => {
    setTriggeringId(workflowId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/trigger`,
        { method: 'POST', headers: headers() }
      );
      const data = await res.json();
      if (data.success) {
        onSuccess?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDetach = async (workflowId: string) => {
    setDetachingId(workflowId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/detach`,
        { method: 'DELETE', headers: headers() }
      );
      const data = await res.json();
      if (data.success) {
        await fetchWorkflows();
        onSuccess?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetachingId(null);
    }
  };

  const handleAttach = async (workflowId: string) => {
    setAttachingId(workflowId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/attach`,
        { method: 'POST', headers: headers() }
      );
      const data = await res.json();
      if (data.success) {
        await fetchWorkflows();
        onSuccess?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAttachingId(null);
    }
  };

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        channel: 'email',
        daysAfter: 0,
        hoursAfter: 0,
        templateId: '',
        domainName: 'flashfiremails.com',
        order: prev.length,
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  };

  const updateStep = (index: number, updates: Partial<WorkflowStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  const handleCreateSave = async () => {
    if (!templateName.trim()) return;
    if (steps.length === 0) return;
    for (const s of steps) {
      if (!s.templateId || (typeof s.templateId === 'string' && s.templateId.trim() === '')) return;
    }
    setSaving(true);
    try {
      const createRes = await fetch(`${API_BASE_URL}/api/workflows`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          triggerAction: 'custom',
          name: templateName.trim(),
          steps: steps.map((s, i) => ({
            ...s,
            order: i,
            templateName: s.templateName || s.templateId,
          })),
        }),
      });
      const createData = await createRes.json();
      if (!createData.success || !createData.data?.workflowId) {
        return;
      }
      const workflowId = createData.data.workflowId;
      const attachRes = await fetch(
        `${API_BASE_URL}/api/campaign-bookings/${bookingId}/custom-workflows/${workflowId}/attach`,
        { method: 'POST', headers: headers() }
      );
      const attachData = await attachRes.json();
      if (attachData.success) {
        setCreateStep(0);
        setTemplateName('');
        setSteps([]);
        await fetchWorkflows();
        onSuccess?.();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const isCreating = createStep === 1 || (createStep === 0 && templateName.length > 0);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
      onClick={() => {
        if (!saving) {
          setCreateStep(0);
          setTemplateName('');
          setSteps([]);
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Workflow size={20} className="text-orange-500" />
              Custom Workflows
            </h3>
            <p className="text-sm text-slate-500">For {clientName}</p>
          </div>
          <button
            onClick={() => {
              if (!saving) {
                setCreateStep(0);
                setTemplateName('');
                setSteps([]);
                onClose();
              }
            }}
            disabled={saving}
            className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {createStep === 0 && !isCreating && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
              ) : (
                <>
                  {allCustomWorkflows.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No custom workflows found. Create one below to use on this lead and others.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {allCustomWorkflows.map((w) => {
                        const isAttached = workflows.some((aw) => aw.workflowId === w.workflowId);
                        return (
                          <li
                            key={w.workflowId}
                            className={`flex items-center justify-between gap-2 p-3 rounded-xl border transition ${isAttached ? 'border-violet-200 bg-violet-50/50 hover:bg-violet-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                          >
                            <span className="font-semibold text-slate-800 truncate flex-1">
                              {w.name || w.workflowId}
                              {isAttached && (
                                <span className="ml-2 text-[10px] font-normal text-violet-600">(attached)</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isAttached ? (
                                <>
                                  <button
                                    onClick={() => handleTrigger(w.workflowId)}
                                    disabled={triggeringId !== null}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                                  >
                                    {triggeringId === w.workflowId ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <Play size={12} />
                                    )}
                                    Run
                                  </button>
                                  <button
                                    onClick={() => handleDetach(w.workflowId)}
                                    disabled={detachingId !== null}
                                    className="inline-flex items-center p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                                    title="Detach"
                                  >
                                    {detachingId === w.workflowId ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={14} />
                                    )}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleAttach(w.workflowId)}
                                  disabled={attachingId !== null}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-semibold hover:bg-violet-600 transition disabled:opacity-50"
                                  title="Attach to this lead"
                                >
                                  {attachingId === w.workflowId ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Link2 size={12} />
                                  )}
                                  Attach
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button
                    onClick={() => {
                      setCreateStep(1);
                      setTemplateName('');
                      setSteps([]);
                    }}
                    className="mt-4 w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 font-semibold hover:bg-orange-50 transition flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Create a new one
                  </button>
                </>
              )}
            </>
          )}

          {createStep === 1 && (
            <>
              {createStep === 1 && steps.length === 0 ? (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-slate-700">
                    Enter the name of template
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. Follow-up sequence"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-800"
                  />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setCreateStep(0)}
                      className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        if (templateName.trim()) {
                          addStep();
                        }
                      }}
                      disabled={!templateName.trim()}
                      className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Next
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Template: {templateName}</span>
                    <button
                      onClick={addStep}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
                    >
                      <Plus size={14} />
                      Add Step
                    </button>
                  </div>
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <div
                        key={index}
                        className="p-4 border border-slate-200 rounded-xl bg-white shadow-sm space-y-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-700">Step {index + 1}</span>
                          <button
                            onClick={() => removeStep(index)}
                            className="text-red-500 hover:text-red-600 p-0.5"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Channel</label>
                            <select
                              value={step.channel}
                              onChange={(e) => updateStep(index, { channel: e.target.value as 'email' | 'whatsapp' })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                            >
                              <option value="email">Email</option>
                              <option value="whatsapp">WhatsApp</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Days After</label>
                            <input
                              type="number"
                              min={0}
                              value={step.daysAfter === 0 ? '' : step.daysAfter}
                              onChange={(e) => updateStep(index, { daysAfter: parseInt(e.target.value, 10) || 0 })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Hours After</label>
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={step.hoursAfter || 0}
                              onChange={(e) => updateStep(index, { hoursAfter: Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Template</label>
                            {step.channel === 'whatsapp' ? (
                              loadingTemplates ? (
                                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                                  <Loader2 size={14} className="animate-spin" />
                                  Loading...
                                </div>
                              ) : (
                                <select
                                  value={step.templateName || step.templateId || ''}
                                  onChange={(e) => {
                                    const t = watiTemplates.find((x) => x.name === e.target.value);
                                    updateStep(index, {
                                      templateId: t?.id ?? e.target.value,
                                      templateName: e.target.value,
                                    });
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                                >
                                  <option value="">Select WhatsApp template</option>
                                  {watiTemplates.map((t) => (
                                    <option key={t.id} value={t.name}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : (
                              loadingTemplates ? (
                                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                                  <Loader2 size={14} className="animate-spin" />
                                  Loading...
                                </div>
                              ) : (
                                <select
                                  value={step.templateName || step.templateId || ''}
                                  onChange={(e) => {
                                    const t = emailTemplates.find((x) => x.name === e.target.value);
                                    if (t) {
                                      const domain = t.domainName?.includes('@')
                                        ? t.domainName.split('@')[1]
                                        : t.domainName || 'flashfiremails.com';
                                      updateStep(index, {
                                        templateId: t.templateId,
                                        templateName: t.name,
                                        domainName: domain,
                                        senderEmail: t.senderEmail,
                                      });
                                    } else {
                                      updateStep(index, { templateId: e.target.value, templateName: e.target.value });
                                    }
                                  }}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm"
                                >
                                  <option value="">Select email template</option>
                                  {emailTemplates.map((t) => (
                                    <option key={t.id} value={t.name}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              )
                            )}
                          </div>
                        </div>
                        {(step.templateName || step.templateId) && (
                          <TemplatePreviewBlock
                            templateName={step.templateName || step.templateId}
                            variables={getTemplateVariablesCustom(step.templateName || step.templateId)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => {
                        setSteps([]);
                        setCreateStep(0);
                      }}
                      disabled={saving}
                      className="flex-1 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateSave}
                      disabled={saving || steps.some((s) => !s.templateId?.trim())}
                      className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        'Save'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
