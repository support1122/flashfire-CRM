import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, Users, CheckCircle2, BarChart3, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';
const ADMIN_TOKEN_KEY = 'flashfire_crm_admin_token';

interface BdaPerformance {
  _id: string;
  name: string;
  totalClaimed: number;
  paid: number;
  scheduled: number;
  completed: number;
  totalRevenue: number;
}

interface AnalysisData {
  overview: {
    totalLeads: number;
    claimedLeads: number;
    unclaimedLeads: number;
  };
  statusBreakdown: {
    paid: number;
    scheduled: number;
    completed: number;
  };
  bdaPerformance: BdaPerformance[];
}

export default function BdaAnalysisPage() {
  const navigate = useNavigate();
  const [adminToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    if (!adminToken) {
      navigate('/admin/dashboard');
      return;
    }
    fetchAnalysis();
  }, [adminToken, navigate]);

  const fetchAnalysis = async () => {
    if (!adminToken) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/bda/analysis`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch analysis');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const topBda = data.bdaPerformance.length > 0 ? data.bdaPerformance[0] : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 mb-4 bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition font-semibold shadow-sm"
        >
          <ArrowLeft size={18} />
          Back to Admin Dashboard
        </button>
        <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-1">BDA PERFORMANCE</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Lead Analysis</h1>
        <p className="text-slate-600">Comprehensive statistics on leads and BDA performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.totalLeads}</div>
          <div className="text-sm text-slate-600">Total Available Leads</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <CheckCircle2 className="text-emerald-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.claimedLeads}</div>
          <div className="text-sm text-slate-600">Claimed Leads</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <TrendingUp className="text-orange-600" size={24} />
            </div>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{data.overview.unclaimedLeads}</div>
          <div className="text-sm text-slate-600">Unclaimed Leads</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-sm text-slate-600 font-semibold mb-2">Status Breakdown</div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Paid</span>
              <span className="text-lg font-bold text-emerald-600">{data.statusBreakdown.paid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Scheduled</span>
              <span className="text-lg font-bold text-blue-600">{data.statusBreakdown.scheduled}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-700">Completed</span>
              <span className="text-lg font-bold text-green-600">{data.statusBreakdown.completed}</span>
            </div>
          </div>
        </div>

        {topBda && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="text-orange-600" size={24} />
              <h3 className="text-lg font-bold text-slate-900">Top Performer</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-600 mb-1">BDA Name</div>
                <div className="text-xl font-bold text-slate-900">{topBda.name}</div>
                <div className="text-sm text-slate-500">{topBda._id}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-600 mb-1">Total Claimed</div>
                  <div className="text-2xl font-bold text-slate-900">{topBda.totalClaimed}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 mb-1">Total Revenue</div>
                  <div className="text-2xl font-bold text-emerald-600">${topBda.totalRevenue.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-4">BDA Performance Rankings</h3>
        {data.bdaPerformance.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No BDA has claimed any leads yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">BDA Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Total Claimed</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Scheduled</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Completed</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.bdaPerformance.map((bda, index) => (
                  <tr key={bda._id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                        index === 0 ? 'bg-yellow-100 text-yellow-800' :
                        index === 1 ? 'bg-slate-100 text-slate-800' :
                        index === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-slate-50 text-slate-600'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{bda.name}</td>
                    <td className="px-4 py-3 text-slate-600">{bda._id}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{bda.totalClaimed}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">{bda.paid}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{bda.scheduled}</td>
                    <td className="px-4 py-3 text-right text-green-600">{bda.completed}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      ${bda.totalRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

