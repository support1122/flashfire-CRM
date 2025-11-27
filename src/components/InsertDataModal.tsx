import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

interface InsertDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: InsertDataFormData) => Promise<void>;
}

export interface InsertDataFormData {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  scheduledEventStartTime: string;
  utmSource: string;
  utmMedium?: string;
  utmCampaign?: string;
  bookingStatus: 'scheduled' | 'completed' | 'canceled' | 'rescheduled' | 'no-show';
  calendlyMeetLink?: string;
  anythingToKnow?: string;
  meetingNotes?: string;
}

export default function InsertDataModal({ isOpen, onClose, onSave }: InsertDataModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<InsertDataFormData>({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    scheduledEventStartTime: '',
    utmSource: 'MANUAL',
    utmMedium: '',
    utmCampaign: '',
    bookingStatus: 'scheduled',
    calendlyMeetLink: '',
    anythingToKnow: '',
    meetingNotes: '',
  });

  if (!isOpen) return null;

  const handleChange = (field: keyof InsertDataFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.clientName.trim()) {
      alert('Client name is required');
      return;
    }
    if (!formData.clientEmail.trim()) {
      alert('Client email is required');
      return;
    }
    if (!formData.clientPhone.trim()) {
      alert('Client phone is required');
      return;
    }
    if (!formData.scheduledEventStartTime) {
      alert('Meeting date & time is required');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      // Reset form
      setFormData({
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        scheduledEventStartTime: '',
        utmSource: 'MANUAL',
        utmMedium: '',
        utmCampaign: '',
        bookingStatus: 'scheduled',
        calendlyMeetLink: '',
        anythingToKnow: '',
        meetingNotes: '',
      });
      onClose();
    } catch (error) {
      console.error('Failed to insert data:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 sticky top-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Insert Booking Data Manually</h3>
            <p className="text-sm text-slate-500">Add booking from different sources</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-lg transition text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Client Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) => handleChange('clientName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="John Doe"
                required
              />
            </div>

            {/* Client Email */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Client Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.clientEmail}
                onChange={(e) => handleChange('clientEmail', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="john@example.com"
                required
              />
            </div>

            {/* Client Phone */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Client Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.clientPhone}
                onChange={(e) => handleChange('clientPhone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="+1 234 567 8900"
                required
              />
            </div>

            {/* Meeting Date & Time */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Meeting Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.scheduledEventStartTime}
                onChange={(e) => handleChange('scheduledEventStartTime', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                required
              />
            </div>

            {/* UTM Source */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                UTM Source <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.utmSource}
                onChange={(e) => handleChange('utmSource', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
              >
                <option value="MANUAL">Manual Entry</option>
                <option value="WEBSITE">Website</option>
                <option value="LINKEDIN">LinkedIn</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="REFERRAL">Referral</option>
                <option value="DIRECT">Direct</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Booking Status */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Booking Status <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.bookingStatus}
                onChange={(e) => handleChange('bookingStatus', e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="no-show">No Show</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>

            {/* UTM Medium */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                UTM Medium (Optional)
              </label>
              <input
                type="text"
                value={formData.utmMedium}
                onChange={(e) => handleChange('utmMedium', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="email, social, ads"
              />
            </div>

            {/* UTM Campaign */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                UTM Campaign (Optional)
              </label>
              <input
                type="text"
                value={formData.utmCampaign}
                onChange={(e) => handleChange('utmCampaign', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="summer_sale_2024"
              />
            </div>

            {/* Meeting Link */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Meeting Link (Optional)
              </label>
              <input
                type="url"
                value={formData.calendlyMeetLink}
                onChange={(e) => handleChange('calendlyMeetLink', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700"
                placeholder="https://meet.google.com/..."
              />
            </div>

            {/* Client Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Client Notes / Concerns (Optional)
              </label>
              <textarea
                value={formData.anythingToKnow}
                onChange={(e) => handleChange('anythingToKnow', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 resize-none"
                placeholder="Any special requirements or concerns..."
                rows={3}
              />
            </div>

            {/* Meeting Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Meeting Notes (Optional)
              </label>
              <textarea
                value={formData.meetingNotes}
                onChange={(e) => handleChange('meetingNotes', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-700 resize-none"
                placeholder="Notes from the meeting discussion..."
                rows={3}
              />
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition font-semibold disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Booking
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

