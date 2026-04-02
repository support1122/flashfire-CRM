import LeadsView from './LeadsView';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';

interface MetaLeadsViewProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
  onOpenWhatsAppCampaign?: (payload: WhatsAppPrefillPayload) => void;
  onNavigateToWorkflows?: () => void;
}

/**
 * MetaLeadsView - Dedicated view for Meta Lead Ads
 * This component wraps LeadsView and filters to show only Meta leads (meta_lead_ad)
 */
export default function MetaLeadsView({ 
  onOpenEmailCampaign, 
  onOpenWhatsAppCampaign, 
  onNavigateToWorkflows 
}: MetaLeadsViewProps) {
  // This component will be a wrapper that filters for Meta leads
  // For now, we'll use LeadsView with a filter prop
  // In the future, we can customize this view specifically for Meta leads
  
  return (
    <div className="w-full h-full">
      <div className="mb-4 px-4 pt-4">
        <h1 className="text-2xl font-bold text-gray-900">Meta Leads</h1>
        <p className="text-sm text-gray-600 mt-1">
          View and manage all leads from Meta (Facebook & Instagram) Lead Ads campaigns.
          You can attach custom workflows to leads here (per lead or in bulk) just like on the main Leads tab — use the workflow icon on each row or select leads and click &quot;Attach Workflows&quot;.
        </p>
      </div>
      <MetaLeadsViewContent 
        onOpenEmailCampaign={onOpenEmailCampaign}
        onOpenWhatsAppCampaign={onOpenWhatsAppCampaign}
        onNavigateToWorkflows={onNavigateToWorkflows}
      />
    </div>
  );
}

/**
 * Internal component that renders LeadsView with Meta leads filter
 */
function MetaLeadsViewContent({ 
  onOpenEmailCampaign, 
  onOpenWhatsAppCampaign, 
  onNavigateToWorkflows 
}: MetaLeadsViewProps) {
  return (
    <LeadsView 
      variant="all"
      onOpenEmailCampaign={onOpenEmailCampaign}
      onOpenWhatsAppCampaign={onOpenWhatsAppCampaign}
      onNavigateToWorkflows={onNavigateToWorkflows}
      defaultUtmSource="meta_lead_ad"
      hideSourceFilter={true}
      dateRangeOnBookingCreatedAt
    />
  );
}
