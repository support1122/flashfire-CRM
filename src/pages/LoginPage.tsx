import { useEffect, useMemo, useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCrmAuth } from '../auth/CrmAuthContext';

export default function LoginPage() {
  const { requestOtp, verifyOtp, status } = useCrmAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const emailTrimmed = useMemo(() => email.trim(), [email]);

  useEffect(() => {
    if (status === 'authenticated') navigate('/', { replace: true });
  }, [navigate, status]);

  async function onSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await requestOtp(emailTrimmed);
      setStep('otp');
      setInfo('If your email is authorized, you will receive an OTP.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await verifyOtp(emailTrimmed, otp.trim(), rememberMe);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-slate-900 px-7 py-7">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 rounded-xl p-3">
                <ShieldCheck className="text-white" size={22} />
              </div>
              <div>
                <h1 className="text-white text-2xl font-bold leading-tight">FlashFire CRM</h1>
                <p className="text-slate-300 text-sm">Secure access for Sales & Ops (OTP)</p>
              </div>
            </div>
          </div>

          <div className="px-7 py-7">
            {error && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-700 text-sm font-semibold">{error}</p>
              </div>
            )}
            {info && (
              <div className="mb-5 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <p className="text-orange-800 text-sm font-semibold">{info}</p>
              </div>
            )}

            {step === 'email' ? (
              <form onSubmit={onSendOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="crm-email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      id="crm-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-11 pr-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white"
                      autoComplete="email"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !emailTrimmed}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending OTP…' : 'Send OTP'}
                </button>

                <div className="pt-3 text-center text-xs text-slate-500">
                  Admin? Go to <span className="font-semibold text-slate-700">dashboard</span>
                </div>
              </form>
            ) : (
              <form onSubmit={onVerifyOtp} className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">OTP sent to</p>
                    <p className="text-base font-bold text-slate-900 break-all">{emailTrimmed}</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                    onClick={() => {
                      setOtp('');
                      setStep('email');
                    }}
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="crm-otp">
                    OTP Code
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      id="crm-otp"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="6-digit code"
                      className="w-full pl-11 pr-4 py-3.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all bg-white tracking-widest font-extrabold text-slate-900"
                      maxLength={6}
                      required
                      autoFocus
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Code expires quickly. If needed, go back and resend.</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="remember-me"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500 focus:ring-2"
                  />
                  <label htmlFor="remember-me" className="text-sm text-slate-700 cursor-pointer">
                    Remember for 30 days
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.trim().length !== 6}
                  className="w-full py-3.5 px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Verifying…' : 'Log in'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


