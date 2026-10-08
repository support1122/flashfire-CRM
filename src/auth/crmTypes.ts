export const CRM_MODULES = [
  'email_campaign',
  'campaign_manager',
  'whatsapp_campaign',
  'analytics',
  'all_data',
  'workflows',
  'leads',
  'meta_leads',
  'claim_leads',
  'claim_leads_02',
  'call_leads',
  'meeting_links',
  'bda_admin',
  'activity_logs',
  'lead_analytics',
  'graphs03',
  'phone_calls',
  'payment_links',
  'payroll',
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];

// View key = the module name. Edit key = `<module>_edit`.
export type CrmPermission = CrmModule | `${CrmModule}_edit`;

export interface CrmUser {
  email: string;
  name: string;
  permissions: CrmPermission[];
  role?: 'admin' | 'bda';
  /** Some admin accounts have role "bda" with this flag set. The backend treats either as admin. */
  isAdmin?: boolean;
}
