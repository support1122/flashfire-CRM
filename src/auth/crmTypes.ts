export type CrmPermission =
  | 'email_campaign'
  | 'campaign_manager'
  | 'whatsapp_campaign'
  | 'analytics'
  | 'all_data'
  | 'workflows'
  | 'leads'
  | 'meta_leads'
  | 'claim_leads'
  | 'meeting_links'
  | 'bda_admin'
  | 'activity_logs';

export interface CrmUser {
  email: string;
  name: string;
  permissions: CrmPermission[];
}


