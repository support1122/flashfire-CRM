import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Filter,
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
import { PlanConfigProvider } from '../context/PlanConfigContext';
import CampaignManager from '../components/CampaignManager';
import EmailCampaign from '../components/EmailCampaign';
import WhatsAppCampaign from '../components/WhatsAppCampaign';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import UnifiedDataView from '../components/UnifiedDataView';
import Workflows from '../components/Workflows';
import LeadsView from '../components/LeadsView';
import QualifiedLeadsView from '../components/QualifiedLeadsView';
import ClaimLeadsView from '../components/ClaimLeadsView';
import '../index.css';


type Tab = 'campaigns' | 'emails' | 'whatsapp' | 'analytics' | 'data' | 'workflows' | 'leads' | 'qualified_leads' | 'claim_leads';

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
  { tab: 'qualified_leads', permission: 'leads', label: 'Qualified Leads', icon: Filter },
  { tab: 'claim_leads', permission: 'claim_leads', label: 'Claim Your Leads', icon: UserCheck },
];

export default function CrmDashboardPage() {
  const { user, hasPermission, logout } = useCrmAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [emailPrefill, setEmailPrefill] = useState<EmailPrefillPayload | null>(null);
  const [whatsappPrefill, setWhatsappPrefill] = useState<WhatsAppPrefillPayload | null>(null);

  const allowedTabs = useMemo(() => TAB_CONFIG.filter((t) => hasPermission(t.permission)), [hasPermission]);

  const [activeTab, setActiveTab] = useState<Tab>('campaigns');

  const safeSetActiveTab = (tab: Tab) => {
    const cfg = TAB_CONFIG.find((t) => t.tab === tab);
    if (!cfg || !hasPermission(cfg.permission)) return;
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
    if (!isAllowed) setActiveTab(allowedTabs[0].tab);
  }, [activeTab, allowedTabs, hasAnyAccess]);

  const userInitial = user?.name?.[0]?.toUpperCase() || 'F';

  return (
    <PlanConfigProvider>
    <div className="h-screen flex bg-gray-100 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-gray-100 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed md:relative z-50 bg-gray-100 text-white flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0 w-52 lg:w-64' : '-translate-x-full md:translate-x-0 md:w-12'
        } h-screen flex`}
      >
        <div className="px-6 py-8 border-b border-gray-200 md:px-3 md:py-4">
          {sidebarOpen ? (
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-gray-900">FLASHFIRE CRM</h1>
                <p className="text-sm text-gray-800 mt-1">Marketing Automation</p>
                {user && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-blue-800">
                    <UserRound size={14} />
                    <span className="truncate text-gray-800 font-semibold">{user.name}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-500 hover:text-white p-2  hover:bg-blue-500 transition-colors"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                type="button"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-gray-500 hover:text-white p-2 hover:bg-blue-500 transition-colors"
                aria-label="Expand sidebar"
                title="Expand sidebar"
                type="button"
              >
                <ChevronRight size={20} />
              </button>
              <div className="hidden md:flex items-center justify-center w-8 h-8  bg-blue-500 rounded-full text-white font-semibold">
                {userInitial}
              </div>
            </div>
          )}
        </div>

        <nav
          className={`flex-1 px-4 py-6 space-y-1 overflow-y-auto hide-scrollbar transition-all duration-300 ${
            sidebarOpen ? '' : 'md:px-2 md:py-4 md:space-y-2'
          }`}
        >
          {allowedTabs.map(({ icon: Icon, label, tab }) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={label}
                className={`w-full flex items-center  text-sm font-medium transition-all ${
                  sidebarOpen ? 'px-4 py-3 gap-3 justify-start' : 'px-2 py-3 gap-0 justify-center'
                } ${isActive ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-white hover:bg-blue-500'}`}
                type="button"
                onClick={() => safeSetActiveTab(tab)}
                aria-label={label}
              >
                <Icon size={18} />
                <span
                  className={`whitespace-nowrap transition-opacity duration-200 ${
                    sidebarOpen ? 'opacity-100' : 'opacity-0 md:hidden'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="px-6 py-5 border-t border-gray-200 flex items-center justify-center">
          {sidebarOpen ? (
            <div className="w-full">
              <button
                type="button"
                onClick={logout}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3  bg-blue-500 hover:bg-blue-500 text-sm font-semibold transition-colors"
              >
                <LogOut size={16} />
                Logout
              </button>
              <div className="mt-3 text-xs text-gray-500 text-center">© {new Date().getFullYear()} FlashFire</div>
            </div>
          ) : (
            <button
              type="button"
              onClick={logout}
              className="hidden md:inline-flex items-center justify-center w-10 h-10  bg-blue-500 hover:bg-blue-500 text-white transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-gray-100 border-b border-gray-200 flex-shrink-0">
          <div className="w-full px-4 sm:px-6 lg:px-10 py-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex items-center gap-4">
                <div>
                    <p className="text-sm uppercase tracking-wider text-gray-500 font-semibold mb-1">Secure OTP access</p>
                  <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {topActions.map(({ tab, label, icon: Icon }) => (
                  <button
                    key={tab}
                    onClick={() => safeSetActiveTab(tab)}
                    className={`inline-flex items-center gap-2 px-4 py-3 font-semibold text-sm transition-all ${
                      activeTab === tab
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                        : 'bg-blue-500 text-white hover:bg-blue-500'
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
                <div className="max-w-xl w-full bg-white border border-gray-200 rounded-2xl shadow-xl p-8">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-900 text-white rounded-xl p-3">
                      <UserRound size={18} />
                    </div>
                    <div>
                        <h3 className="text-xl font-extrabold text-gray-900">No modules assigned</h3>
                      <p className="text-gray-600 text-sm mt-1">
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
                {activeTab === 'qualified_leads' && (
                  <QualifiedLeadsView
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
    </PlanConfigProvider>
  );
}


