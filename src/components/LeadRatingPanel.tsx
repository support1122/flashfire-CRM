import { useEffect, useState } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { TEMPERATURE_OPTIONS, type LeadTemperature } from '../utils/leadTemperature';

interface LeadRatingPanelProps {
  isOpen: boolean;
  clientName: string;
  /** Existing rating, so re-opening the panel shows what was picked before. */
  currentValue?: LeadTemperature | null;
  onSelect: (value: LeadTemperature) => Promise<void>;
  onClose: () => void;
}

/**
 * Post-meeting lead rating, docked to the right edge.
 *
 * Deliberately NOT a full-screen modal: it has no backdrop and does not block the
 * page, so the BDA can still read the lead row behind it while rating. One tap
 * saves and closes — there is no separate submit button to forget.
 */
export default function LeadRatingPanel({
  isOpen,
  clientName,
  currentValue,
  onSelect,
  onClose,
}: LeadRatingPanelProps) {
  const [saving, setSaving] = useState<LeadTemperature | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSaving(null);
      setError('');
    }
  }, [isOpen]);

  // Escape closes, matching every other dismissible surface in the CRM.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePick = async (value: LeadTemperature) => {
    if (saving) return;
    setSaving(value);
    setError('');
    try {
      await onSelect(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating');
      setSaving(null);
    }
  };

  return (
    <div className="fixed top-1/2 right-4 -translate-y-1/2 z-[65] w-[19rem] max-w-[calc(100vw-2rem)]">
      <style>{`@keyframes leadRatingIn{from{opacity:0;transform:translateX(1rem)}to{opacity:1;transform:translateX(0)}}`}</style>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ animation: 'leadRatingIn .18s ease-out' }}
      >
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Rate this lead</h3>
            <p className="text-xs text-slate-500 truncate" title={clientName}>
              {clientName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-lg transition text-slate-500 flex-shrink-0"
            title="Skip rating"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3 space-y-2">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{error}</div>
          )}

          {TEMPERATURE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isCurrent = currentValue === opt.value;
            const isSaving = saving === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handlePick(opt.value)}
                disabled={!!saving}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition text-left disabled:opacity-60 ${
                  isCurrent ? opt.active : opt.idle
                }`}
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin flex-shrink-0" />
                ) : (
                  <Icon size={18} className="flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight">{opt.label}</span>
                  <span className="block text-[11px] text-slate-500 leading-tight">{opt.hint}</span>
                </span>
                {isCurrent && !isSaving && <Check size={16} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            disabled={!!saving}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium disabled:opacity-60"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
