export type CrmPermission =
  | 'email_campaign'
  | 'campaign_manager'
  | 'whatsapp_campaign'
  | 'analytics'
  | 'all_data'
  | 'workflows'
  | 'leads'
  | 'claim_leads'
  | 'meeting_links'
  | 'bda_admin';

export interface CrmUser {
  email: string;
  name: string;
  permissions: CrmPermission[];
}


