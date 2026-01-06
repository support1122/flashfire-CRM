import { useState, useEffect } from 'react';
import { X, DollarSign, Calendar as CalendarIcon, Save } from 'lucide-react';

export interface PlanDetailsData {
  planName: string;
  planAmount: number;
  days: number;
}

interface PlanDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PlanDetailsData) => Promise<void>;
  clientName: string;
  currentPlan?: {
    name?: string;
    price?: number;
    displayPrice?: string;
  };
  defaultDays?: number;
}

const PLAN_OPTIONS = [
  { key: 'PRIME', label: 'PRIME', price: 119, displayPrice: '$119', currency: 'USD' },
  { key: 'IGNITE', label: 'IGNITE', price: 199, displayPrice: '$199', currency: 'USD' },
  { key: 'PROFESSIONAL', label: 'PROFESSIONAL', price: 349, displayPrice: '$349', currency: 'USD' },
  { key: 'EXECUTIVE', label: 'EXECUTIVE', price: 599, displayPrice: '$599', currency: 'USD' },
];

export default function PlanDetailsModal({
  isOpen,
  onClose,
  onSave,
  clientName,
  currentPlan,
  defaultDays = 7,
}: PlanDetailsModalProps) {
  const [planDetails, setPlanDetails] = useState<PlanDetailsData>({
    planName: currentPlan?.name || 'PRIME',
    planAmount: currentPlan?.price || PLAN_OPTIONS.find(p => p.key === (currentPlan?.name || 'PRIME'))?.price || 119,
    days: defaultDays,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      const initialPlanName = currentPlan?.name || 'PRIME';
      const initialPlan = PLAN_OPTIONS.find(p => p.key === initialPlanName) || PLAN_OPTIONS[0];
      
      setPlanDetails({
        planName: initialPlanName,
        planAmount: currentPlan?.price || initialPlan.price,
        days: defaultDays,
      });
      setError('');
    }
  }, [isOpen, currentPlan, defaultDays]);

  if (!isOpen) return null;

  const handleSave = async () => {
    // Validation
    if (!planDetails.planName) {
      setError('Please select a plan');
      return;
    }
    if (!planDetails.planAmount || planDetails.planAmount <= 0) {
      setError('Please enter a valid plan amount');
      return;
    }
    if (!planDetails.days || planDetails.days < 0) {
      setError('Please enter a valid number of days');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await onSave(planDetails);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Plan Details Required</h3>
            <p className="text-sm text-slate-500">For {clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500"
            disabled={isSaving}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Plan Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <DollarSign size={16} className="inline mr-2" />
              Plan <span className="text-red-500">*</span>
            </label>
            <select
              value={planDetails.planName}
              onChange={(e) => {
                const selectedPlan = PLAN_OPTIONS.find(p => p.key === e.target.value);
                if (selectedPlan) {
                  setPlanDetails({
                    ...planDetails,
                    planName: selectedPlan.key,
                    planAmount: selectedPlan.price,
                  });
                }
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
              disabled={isSaving}
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
              value={planDetails.planAmount}
              onChange={(e) => {
                const amount = parseFloat(e.target.value) || 0;
                setPlanDetails({
                  ...planDetails,
                  planAmount: amount,
                });
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
              placeholder="Enter amount"
              disabled={isSaving}
            />
            <p className="text-xs text-slate-500 mt-1">
              Default amount from plan: {PLAN_OPTIONS.find(p => p.key === planDetails.planName)?.displayPrice || '$0'}
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
              value={planDetails.days}
              onChange={(e) => {
                const days = parseInt(e.target.value) || 0;
                setPlanDetails({
                  ...planDetails,
                  days: days,
                });
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
              placeholder="7"
              disabled={isSaving}
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
                  <li><strong>{'{{2}}'}</strong> = Plan Amount ({planDetails.planName} - ${planDetails.planAmount})</li>
                  {planDetails.days > 0 && (
                    <li><strong>{'{{3}}'}</strong> = Date ({planDetails.days} days from execution) - for finalkk template</li>
                  )}
                </ul>
                <p className="text-xs mt-2 text-blue-600">
                  <strong>Note:</strong> Plan details will be used for WhatsApp templates (finalkk, plan_followup_utility_01dd)
                </p>
              </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-lg transition"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-70"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save & Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

