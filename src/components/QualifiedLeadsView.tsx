import type { EmailPrefillPayload } from '../types/emailPrefill';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';
import LeadsView from './LeadsView';

interface QualifiedLeadsViewProps {
  onOpenEmailCampaign: (payload: EmailPrefillPayload) => void;
  onOpenWhatsAppCampaign?: (payload: WhatsAppPrefillPayload) => void;
}

export default function QualifiedLeadsView({ onOpenEmailCampaign, onOpenWhatsAppCampaign }: QualifiedLeadsViewProps) {
  return (
    <LeadsView
      variant="qualified"
      onOpenEmailCampaign={onOpenEmailCampaign}
      onOpenWhatsAppCampaign={onOpenWhatsAppCampaign}
    />
  );
}
