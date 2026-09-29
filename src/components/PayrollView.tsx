import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PayrollRecord {
  id: string;
  month: string; // "YYYY-MM"
  employeeName: string;
  teamName: string;
  startDate: string;
  endDate: string;
  monthlySalary: number;
  incentive?: number;
  deduction?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'flashfire_payroll_records';
const TEAMS_KEY = 'flashfire_payroll_teams';

const DEFAULT_TEAMS = [
  'Technical',
  'Operations',
  'Design',
  'Email Marketing',
  'SEO',
  'Reels',
  'HR',
  'BDA',
  'Content Writer',
];

const INCENTIVE_TEAMS = new Set(['Operations', 'BDA']);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadRecords(): PayrollRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PayrollRecord[];
    // Backfill month for old records that don't have it
    return parsed.map((r) =>
      r.month ? r : { ...r, month: r.startDate ? r.startDate.slice(0, 7) : currentYearMonth() }
    );
  } catch {
    return [];
  }
}

function saveRecords(records: PayrollRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function loadTeams(): string[] {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveTeams(teams: string[]) {
  localStorage.setItem(TEAMS_KEY, JSON.stringify(teams));
}

function allTeams(custom: string[]): string[] {
  const merged = [...DEFAULT_TEAMS];
  for (const t of custom) {
    if (!merged.includes(t)) merged.push(t);
  }
  return merged;
}

function diffDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

function dailyRate(monthly: number): number {
  return monthly / 30;
}

function finalSalary(monthly: number, start: string, end: string, incentive?: number, deduction?: number): number {
  const days = diffDays(start, end);
  return dailyRate(monthly) * days + (incentive || 0) - (deduction || 0);
}

function fmtINR(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Modal form state
// ---------------------------------------------------------------------------

interface FormState {
  employeeName: string;
  teamName: string;
  startDate: string;
  endDate: string;
  monthlySalary: string;
  incentive: string;
  deduction: string;
}

const EMPTY_FORM: FormState = {
  employeeName: '',
  teamName: '',
  startDate: '',
  endDate: '',
  monthlySalary: '',
  incentive: '',
  deduction: '',
};

function recordToForm(r: PayrollRecord): FormState {
  return {
    employeeName: r.employeeName,
    teamName: r.teamName,
    startDate: r.startDate,
    endDate: r.endDate,
    monthlySalary: String(r.monthlySalary),
    incentive: r.incentive != null ? String(r.incentive) : '',
    deduction: r.deduction != null ? String(r.deduction) : '',
  };
}

// ---------------------------------------------------------------------------
// Modal component
// ---------------------------------------------------------------------------

interface ModalProps {
  editRecord: PayrollRecord | null;
  activeMonth: string;
  customTeams: string[];
  onSave: (record: PayrollRecord, newCustomTeams: string[]) => void;
  onClose: () => void;
}

function PayrollModal({ editRecord, activeMonth, customTeams, onSave, onClose }: ModalProps) {
  const [form, setForm] = useState<FormState>(editRecord ? recordToForm(editRecord) : EMPTY_FORM);
  const [addingTeam, setAddingTeam] = useState(false);
  const [newTeamInput, setNewTeamInput] = useState('');
  const [localCustomTeams, setLocalCustomTeams] = useState<string[]>(customTeams);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const teams = allTeams(localCustomTeams);
  const showIncentive = INCENTIVE_TEAMS.has(form.teamName);

  const monthly = parseFloat(form.monthlySalary) || 0;
  const incentiveVal = showIncentive ? (parseFloat(form.incentive) || 0) : 0;
  const deductionVal = parseFloat(form.deduction) || 0;
  const rate = dailyRate(monthly);
  const days = diffDays(form.startDate, form.endDate);
  const total = finalSalary(monthly, form.startDate, form.endDate, showIncentive ? incentiveVal : undefined, deductionVal || undefined);

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleAddTeam() {
    const trimmed = newTeamInput.trim();
    if (!trimmed) return;
    if (teams.includes(trimmed)) {
      setForm((prev) => ({ ...prev, teamName: trimmed }));
      setAddingTeam(false);
      setNewTeamInput('');
      return;
    }
    const updated = [...localCustomTeams, trimmed];
    setLocalCustomTeams(updated);
    setForm((prev) => ({ ...prev, teamName: trimmed }));
    setAddingTeam(false);
    setNewTeamInput('');
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.employeeName.trim()) errs.employeeName = 'Required';
    if (!form.teamName) errs.teamName = 'Required';
    if (!form.startDate) errs.startDate = 'Required';
    if (!form.endDate) errs.endDate = 'Required';
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errs.endDate = 'End date must be after start date';
    }
    if (!form.monthlySalary || parseFloat(form.monthlySalary) <= 0) {
      errs.monthlySalary = 'Must be > 0';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const record: PayrollRecord = {
      id: editRecord?.id ?? genId(),
      month: editRecord?.month ?? activeMonth,
      employeeName: form.employeeName.trim(),
      teamName: form.teamName,
      startDate: form.startDate,
      endDate: form.endDate,
      monthlySalary: parseFloat(form.monthlySalary),
      incentive: showIncentive && form.incentive ? parseFloat(form.incentive) : undefined,
      deduction: form.deduction ? parseFloat(form.deduction) : undefined,
    };
    onSave(record, localCustomTeams);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {editRecord ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{formatMonthLabel(activeMonth)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Employee Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Employee Name</label>
            <input
              type="text"
              value={form.employeeName}
              onChange={(e) => set('employeeName', e.target.value)}
              placeholder="e.g. Riya Sharma"
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.employeeName ? 'border-red-400' : 'border-gray-200'}`}
            />
            {errors.employeeName && <p className="text-xs text-red-500 mt-1">{errors.employeeName}</p>}
          </div>

          {/* Team Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Team</label>
            <div className="relative">
              <select
                value={form.teamName}
                onChange={(e) => {
                  if (e.target.value === '__add_custom__') {
                    setAddingTeam(true);
                  } else {
                    set('teamName', e.target.value);
                  }
                }}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white ${errors.teamName ? 'border-red-400' : 'border-gray-200'}`}
              >
                <option value="">Select a team…</option>
                {teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__add_custom__">+ Add custom team…</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {errors.teamName && <p className="text-xs text-red-500 mt-1">{errors.teamName}</p>}

            {addingTeam && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newTeamInput}
                  onChange={(e) => setNewTeamInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTeam(); } }}
                  placeholder="New team name"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button type="button" onClick={handleAddTeam} className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors font-semibold">Add</button>
                <button type="button" onClick={() => { setAddingTeam(false); setNewTeamInput(''); }} className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition-colors">Cancel</button>
              </div>
            )}
          </div>

          {/* Date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.startDate ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.endDate ? 'border-red-400' : 'border-gray-200'}`}
              />
              {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
            </div>
          </div>

          {/* Monthly Salary */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Monthly Salary (₹)</label>
            <input
              type="number" min="0" step="any"
              value={form.monthlySalary}
              onChange={(e) => set('monthlySalary', e.target.value)}
              placeholder="e.g. 30000"
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${errors.monthlySalary ? 'border-red-400' : 'border-gray-200'}`}
            />
            {errors.monthlySalary && <p className="text-xs text-red-500 mt-1">{errors.monthlySalary}</p>}
          </div>

          {/* Incentive — only for Operations / BDA */}
          {showIncentive && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Incentive (₹)</label>
              <input
                type="number" min="0" step="any"
                value={form.incentive}
                onChange={(e) => set('incentive', e.target.value)}
                placeholder="e.g. 5000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Deduction */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Deduction (₹)</label>
            <input
              type="number" min="0" step="any"
              value={form.deduction}
              onChange={(e) => set('deduction', e.target.value)}
              placeholder="e.g. 0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Computed preview */}
          {monthly > 0 && form.startDate && form.endDate && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preview</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Daily Rate</span>
                <span className="font-semibold text-gray-800">₹{fmtINR(rate)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Days Worked</span>
                <span className="font-semibold text-gray-800">{days} {days === 1 ? 'day' : 'days'}</span>
              </div>
              {showIncentive && incentiveVal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Incentive</span>
                  <span className="font-semibold text-orange-500">+ ₹{fmtINR(incentiveVal)}</span>
                </div>
              )}
              {deductionVal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Deduction</span>
                  <span className="font-semibold text-red-500">- ₹{fmtINR(deductionVal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-1">
                <span className="font-bold text-gray-800">Final Salary</span>
                <span className="font-bold text-green-600 text-base">₹{fmtINR(total)}</span>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button
            type="submit" form=""
            onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            {editRecord ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function PayrollView() {
  const [records, setRecords] = useState<PayrollRecord[]>(() => loadRecords());
  const [customTeams, setCustomTeams] = useState<string[]>(() => loadTeams());
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<PayrollRecord | null>(null);
  const [activeMonth, setActiveMonth] = useState<string>(currentYearMonth);

  useEffect(() => { saveRecords(records); }, [records]);
  useEffect(() => { saveTeams(customTeams); }, [customTeams]);

  // All months that have at least one record — for the dropdown
  const monthsWithData = Array.from(new Set(records.map((r) => r.month))).sort().reverse();

  const filtered = records
    .filter((r) => r.month === activeMonth)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const isCurrentMonth = activeMonth === currentYearMonth();

  function openAdd() { setEditRecord(null); setModalOpen(true); }
  function openEdit(record: PayrollRecord) { setEditRecord(record); setModalOpen(true); }

  function handleSave(record: PayrollRecord, newCustomTeams: string[]) {
    setCustomTeams(newCustomTeams);
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === record.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = record;
        return updated;
      }
      return [...prev, record];
    });
    setModalOpen(false);
  }

  function handleDelete(id: string) {
    if (!window.confirm('Delete this payroll record?')) return;
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="p-6 min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Employee salary, incentives and deductions</p>
        </div>
        <button
          type="button" onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <Plus size={16} />
          Add Employee
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={() => setActiveMonth(prevMonth(activeMonth))}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors"
          title="Previous month"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="relative">
          <select
            value={activeMonth}
            onChange={(e) => setActiveMonth(e.target.value)}
            className="appearance-none border border-gray-200 rounded-xl px-4 py-2 pr-8 text-sm font-semibold text-gray-800 bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {/* Always show current month even if no records */}
            {!monthsWithData.includes(currentYearMonth()) && (
              <option value={currentYearMonth()}>{formatMonthLabel(currentYearMonth())}</option>
            )}
            {/* Show active month if not in list */}
            {!monthsWithData.includes(activeMonth) && activeMonth !== currentYearMonth() && (
              <option value={activeMonth}>{formatMonthLabel(activeMonth)}</option>
            )}
            {monthsWithData.map((m) => (
              <option key={m} value={m}>{formatMonthLabel(m)}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>

        <button
          type="button"
          onClick={() => setActiveMonth(nextMonth(activeMonth))}
          disabled={activeMonth >= currentYearMonth()}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next month"
        >
          <ChevronRight size={16} />
        </button>

        {!isCurrentMonth && (
          <button
            type="button"
            onClick={() => setActiveMonth(currentYearMonth())}
            className="text-xs font-semibold text-blue-500 hover:text-blue-700 underline underline-offset-2"
          >
            Back to current month
          </button>
        )}

        {filtered.length > 0 && (
          <span className="ml-auto text-xs text-gray-400 font-medium">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-2xl">₹</span>
            </div>
            <p className="text-gray-600 font-semibold">No records for {formatMonthLabel(activeMonth)}.</p>
            <p className="text-gray-400 text-sm mt-1">Add employees for this month to get started.</p>
            <button
              type="button" onClick={openAdd}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus size={15} />
              Add Employee
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Employee Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Team</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Start Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">End Date</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Monthly Salary (₹)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Daily Rate (₹)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Days Worked</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Incentive (₹)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Deduction (₹)</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Final Salary (₹)</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record, idx) => {
                  const rate = dailyRate(record.monthlySalary);
                  const days = diffDays(record.startDate, record.endDate);
                  const hasIncentive = INCENTIVE_TEAMS.has(record.teamName);
                  const total = finalSalary(
                    record.monthlySalary, record.startDate, record.endDate,
                    hasIncentive ? record.incentive : undefined, record.deduction
                  );
                  return (
                    <tr key={record.id} className={`border-b border-gray-50 last:border-b-0 hover:bg-slate-50/60 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{record.employeeName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">{record.teamName}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {record.startDate ? new Date(record.startDate + 'T00:00:00').toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {record.endDate ? new Date(record.endDate + 'T00:00:00').toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">₹{fmtINR(record.monthlySalary)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">₹{fmtINR(rate)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">{days}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {hasIncentive && record.incentive
                          ? <span className="text-orange-500 font-medium">₹{fmtINR(record.incentive)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {record.deduction
                          ? <span className="text-red-500">₹{fmtINR(record.deduction)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className="font-bold text-green-600">₹{fmtINR(total)}</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => openEdit(record)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => handleDelete(record.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Employees</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{filtered.length}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Payroll</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">
              ₹{fmtINR(filtered.reduce((sum, r) => {
                const hasInc = INCENTIVE_TEAMS.has(r.teamName);
                return sum + finalSalary(r.monthlySalary, r.startDate, r.endDate, hasInc ? r.incentive : undefined, r.deduction);
              }, 0))}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Incentives</p>
            <p className="text-2xl font-bold text-orange-500 mt-0.5">
              ₹{fmtINR(filtered.reduce((sum, r) => sum + (INCENTIVE_TEAMS.has(r.teamName) && r.incentive ? r.incentive : 0), 0))}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Total Deductions</p>
            <p className="text-2xl font-bold text-red-500 mt-0.5">
              ₹{fmtINR(filtered.reduce((sum, r) => sum + (r.deduction || 0), 0))}
            </p>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <PayrollModal
          editRecord={editRecord}
          activeMonth={activeMonth}
          customTeams={customTeams}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
