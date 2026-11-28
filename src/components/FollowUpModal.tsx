import { useState, useEffect } from 'react';
import { Calendar, Loader2, Package } from 'lucide-react';
import { usePlanConfig, type PlanName } from '../context/PlanConfigContext';

interface FollowUpModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSchedule: (data: FollowUpData) => Promise<void>;
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    /** Pre-selects the package when the lead already has one. */
    initialPlan?: PlanName | null;
}

export interface FollowUpData {
    followUpDateTime: string; // ISO string
    /** The package the lead leans towards; omitted when the BDA leaves it undecided. */
    plan?: PlanName;
}

/**
 * Scheduling the follow-up is mandatory once a meeting is marked completed, so this
 * modal has no cancel, no close button and no backdrop dismissal — the only way out
 * is to schedule. The parent closes it after the schedule call succeeds.
 */
export default function FollowUpModal({
    isOpen,
    onClose,
    onSchedule,
    clientName,
    initialPlan,
}: FollowUpModalProps) {
    const { planOptions } = usePlanConfig();
    const [followUpDateTime, setFollowUpDateTime] = useState('');
    const [plan, setPlan] = useState<PlanName | ''>('');
    const [isScheduling, setIsScheduling] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Reset form when modal opens
            setFollowUpDateTime('');
            setPlan(initialPlan ?? '');
            setError('');
            
            // Set default follow-up time to tomorrow at 10 AM
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);
            const localDateTime = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16);
            setFollowUpDateTime(localDateTime);
        }
    }, [isOpen, initialPlan]);

    if (!isOpen) return null;

    const handleSchedule = async () => {
        // Validation
        if (!followUpDateTime) {
            setError('Please select a follow-up date and time');
            return;
        }

        if (!plan) {
            setError('Please choose the package the lead is interested in');
            return;
        }

        setIsScheduling(true);
        setError('');

        try {
            // Convert local datetime to ISO string
            const followUpDate = new Date(followUpDateTime);
            const followUpISO = followUpDate.toISOString();

            await onSchedule({
                followUpDateTime: followUpISO,
                plan,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to schedule follow-up');
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-900">Schedule Follow-Up</h3>
                    <p className="text-sm text-slate-500">For {clientName}</p>
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Follow-up Date & Time */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            <Calendar size={16} className="inline mr-2" />
                            Follow-Up Date & Time <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={followUpDateTime}
                            onChange={(e) => setFollowUpDateTime(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                            disabled={isScheduling}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Call will be scheduled 10 min before, WhatsApp 5 min before
                        </p>
                    </div>

                    {/* Package the lead leans towards. Required, it feeds the sales sheet and the leads table. */}
                    <div>
                        <label htmlFor="follow-up-package" className="block text-sm font-semibold text-slate-700 mb-2">
                            <Package size={16} className="inline mr-2" />
                            Package <span className="text-red-500">*</span>
                        </label>
                        <select
                            id="follow-up-package"
                            required
                            aria-required="true"
                            value={plan}
                            onChange={(e) => setPlan(e.target.value as PlanName | '')}
                            disabled={isScheduling}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        >
                            <option value="">Choose a package</option>
                            {planOptions.map((p) => (
                                <option key={p.key} value={p.key}>{p.label} ({p.displayPrice})</option>
                            ))}
                        </select>
                    </div>

                    {/* Info Box */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                        <p className="font-semibold mb-1">What will be scheduled:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                            <li>Follow-up email at the selected time (from elizabeth@flashfirehq.com)</li>
                            <li>Call reminder 10 minutes before follow-up</li>
                            <li>WhatsApp message 5 minutes before follow-up</li>
                        </ul>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
                    <button
                        onClick={handleSchedule}
                        disabled={isScheduling || !plan}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-70"
                    >
                        {isScheduling ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Scheduling...
                            </>
                        ) : (
                            <>
                                <Calendar size={18} />
                                Schedule Follow-Up
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

