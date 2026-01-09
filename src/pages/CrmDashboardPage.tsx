import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  UserRound,
  Workflow,
  Users,
  UserCheck,
} from 'lucide-react';
import type { EmailPrefillPayload } from '../types/emailPrefill';
import type { WhatsAppPrefillPayload } from '../types/whatsappPrefill';
import { useCrmAuth } from '../auth/CrmAuthContext';
import type { CrmPermission } from '../auth/crmTypes';
import CampaignManager from '../components/CampaignManager';
import EmailCampaign from '../components/EmailCampaign';
import WhatsAppCampaign from '../components/WhatsAppCampaign';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import UnifiedDataView from '../components/UnifiedDataView';
import Workflows from '../components/Workflows';
import LeadsView from '../components/LeadsView';
import ClaimLeadsView from '../components/ClaimLeadsView';

type Tab = 'campaigns' | 'emails' | 'whatsapp' | 'analytics' | 'data' | 'workflows' | 'leads' | 'claim_leads';

const TAB_CONFIG: Array<{
  tab: Tab;
  permission: CrmPermission;
  label: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { tab: 'campaigns', permission: 'campaign_manager', label: 'Campaign Manager', icon: LayoutDashboard },
  { tab: 'emails', permission: 'email_campaign', label: 'Email Campaigns', icon: Mail },
  { tab: 'whatsapp', permission: 'whatsapp_campaign', label: 'WhatsApp Campaigns', icon: MessageCircle },
  { tab: 'analytics', permission: 'analytics', label: 'Analytics', icon: BarChart3 },
  { tab: 'data', permission: 'all_data', label: 'All Data', icon: Database },
  { tab: 'workflows', permission: 'workflows', label: 'Workflows', icon: Workflow },
  { tab: 'leads', permission: 'leads', label: 'Leads', icon: Users },
  { tab: 'claim_leads', permission: 'claim_leads', label: 'Claim Your Leads', icon: UserCheck },
];

export default function CrmDashboardPage() {
  const { user, hasPermission, logout } = useCrmAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [emailPrefill, setEmailPrefill] = useState<EmailPrefillPayload | null>(null);
  const [whatsappPrefill, setWhatsappPrefill] = useState<WhatsAppPrefillPayload | null>(null);

  const allowedTabs = useMemo(() => {
    return TAB_CONFIG.filter((t) => {
      if (t.permission === 'claim_leads') {
        return true;
      }
      return hasPermission(t.permission);
    });
  }, [hasPermission]);

  const [activeTab, setActiveTab] = useState<Tab>('campaigns');

  const safeSetActiveTab = (tab: Tab) => {
    const cfg = TAB_CONFIG.find((t) => t.tab === tab);
    if (!cfg) return;
    if (cfg.permission !== 'claim_leads' && !hasPermission(cfg.permission)) return;
    setActiveTab(tab);
  };

  const handleOpenEmailCampaign = (payload: EmailPrefillPayload) => {
    setEmailPrefill(payload);
    safeSetActiveTab('emails');
  };

  const handleOpenWhatsAppCampaign = (payload: WhatsAppPrefillPayload) => {
    setWhatsappPrefill(payload);
    safeSetActiveTab('whatsapp');
  };

  const topActions = useMemo(() => {
    // Keep top actions minimal and only for tabs that exist.
    const items: Array<{ tab: Tab; label: string; icon: ComponentType<{ size?: number }>; accent?: boolean }> = [
      { tab: 'campaigns', label: 'Campaign Manager', icon: Megaphone },
      { tab: 'emails', label: 'Email Campaigns', icon: Mail },
      { tab: 'analytics', label: 'Analytics', icon: BarChart3 },
      { tab: 'data', label: 'All Data', icon: Database },
    ];
    return items.filter((i) => allowedTabs.some((t) => t.tab === i.tab));
  }, [allowedTabs]);

  const hasAnyAccess = allowedTabs.length > 0;

  useEffect(() => {
    if (!hasAnyAccess) return;
    const isAllowed = allowedTabs.some((t) => t.tab === activeTab);
    if (!isAllowed) {
      const claimLeadsTab = TAB_CONFIG.find((t) => t.tab === 'claim_leads');
      if (claimLeadsTab) {
        setActiveTab('claim_leads');
      } else {
        setActiveTab(allowedTabs[0].tab);
      }
    }
  }, [activeTab, allowedTabs, hasAnyAccess]);

  return (
    <div className="h-screen flex bg-slate-100 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed md:relative z-50 bg-slate-900 text-white flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0 w-64 lg:w-72' : '-translate-x-full md:translate-x-0 md:w-12'
        } h-screen flex`}
      >
        <div className="px-6 py-8 border-b border-white/10 md:px-3 md:py-4">
          <div className="flex items-center justify-between mb-4 md:justify-center">
            <div className={`flex-1 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 md:hidden'}`}>
              <h1 className="text-2xl font-bold">FlashFire CRM</h1>
              <p className="text-sm text-slate-200 mt-1">Marketing Automation</p>
              {user && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
                  <UserRound size={14} />
                  <span className="truncate">{user.name}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-300 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              aria-label="Toggle sidebar"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              type="button"
            >
              {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>
        </div>

        <nav className={`flex-1 px-4 py-6 space-y-1 overflow-y-auto ${sidebarOpen ? '' : 'md:hidden'}`}>
          {allowedTabs.map(({ icon: Icon, label, tab }) => (
            <button
              key={label}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-white/15 text-white shadow-sm' : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
              type="button"
              onClick={() => safeSetActiveTab(tab)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>

        <div className={`px-6 py-5 border-t border-white/10 ${sidebarOpen ? '' : 'md:hidden'}`}>
          <button
            type="button"
            onClick={logout}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-semibold transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
          <div className="mt-3 text-xs text-slate-300">© {new Date().getFullYear()} FlashFire</div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 flex-shrink-0">
          <div className="w-full px-4 sm:px-6 lg:px-10 py-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-1">Secure OTP access</p>
                  <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {topActions.map(({ tab, label, icon: Icon }) => (
                  <button
                    key={tab}
                    onClick={() => safeSetActiveTab(tab)}
                    className={`inline-flex items-center gap-2 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
                      activeTab === tab
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    type="button"
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto w-full">
          <div className="w-full h-full">
            {allowedTabs.length === 0 ? (
              <div className="min-h-[70vh] flex items-center justify-center px-4">
                <div className="max-w-xl w-full bg-white border border-slate-200 rounded-2xl shadow-xl p-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-slate-900 text-white rounded-xl p-3">
                      <UserRound size={18} />
                    </div>
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900">No modules assigned</h3>
                      <p className="text-slate-600 text-sm mt-1">
                        Your user is active but has no permissions yet. Ask an admin to grant access.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Keep behavior close to the original CRM: render by active tab */}
                {activeTab === 'campaigns' && <CampaignManager />}
                {activeTab === 'emails' && (
                  <EmailCampaign prefill={emailPrefill} onPrefillConsumed={() => setEmailPrefill(null)} />
                )}
                {activeTab === 'whatsapp' && (
                  <WhatsAppCampaign prefill={whatsappPrefill} onPrefillConsumed={() => setWhatsappPrefill(null)} />
                )}
                {activeTab === 'analytics' && <AnalyticsDashboard onOpenEmailCampaign={handleOpenEmailCampaign} />}
                {activeTab === 'data' && (
                  <UnifiedDataView
                    onOpenEmailCampaign={handleOpenEmailCampaign}
                    onOpenWhatsAppCampaign={handleOpenWhatsAppCampaign}
                  />
                )}
                {activeTab === 'workflows' && <Workflows />}
                {activeTab === 'leads' && (
                  <LeadsView
                    onOpenEmailCampaign={handleOpenEmailCampaign}
                    onOpenWhatsAppCampaign={handleOpenWhatsAppCampaign}
                  />
                )}
                {activeTab === 'claim_leads' && <ClaimLeadsView />}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}


