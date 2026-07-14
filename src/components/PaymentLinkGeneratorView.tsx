import React, { useState, useEffect, useCallback } from 'react';
import { Copy, ExternalLink, Check, Zap, AlertCircle, Loader2 } from 'lucide-react';
import { useCrmAuth } from '../auth/CrmAuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://api.flashfirejobs.com';

type Plan = 'professional' | 'executive';

interface PlanConfig {
  id: Plan;
  name: string;
  description: string;
  originalPrice: number;
}

const PLANS: PlanConfig[] = [
  {
    id: 'professional',
    name: 'Professional Plan',
    description: 'Professional Plan – Mid-Level Professionals',
    originalPrice: 349,
  },
  {
    id: 'executive',
    name: 'Executive Plan',
    description: 'Executive Plan – 1200+ Applications',
    originalPrice: 599,
  },
];

interface GeneratedLink {
  url: string;
  finalPrice: number;
  expiresAt: number;
}

export default function PaymentLinkGeneratorView() {
  const { token } = useCrmAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan>('professional');
  const [discountInput, setDiscountInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const plan = PLANS.find((p) => p.id === selectedPlan)!;
  const discount = parseFloat(discountInput) || 0;
  const finalPrice = plan.originalPrice - discount;

  // Reset generated link when plan or discount changes
  useEffect(() => {
    setGeneratedLink(null);
    setError(null);
  }, [selectedPlan, discountInput]);

  const validateDiscount = (): string | null => {
    if (discountInput === '') return 'Please enter a discount amount (0 for no discount).';
    if (discount < 0) return 'Discount cannot be negative.';
    if (discount >= plan.originalPrice) return 'Discount exceeds original price.';
    // Prevent more than 2 decimal places
    if (!/^\d+(\.\d{0,2})?$/.test(discountInput)) return 'Enter a valid dollar amount.';
    return null;
  };

  const handleGenerate = useCallback(async () => {
    const validationError = validateDiscount();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedLink(null);

    try {
      const res = await fetch(`${API_BASE}/api/crm/generate-payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan: selectedPlan, discount }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Unable to generate payment link. Please try again.');
        return;
      }
      setGeneratedLink({ url: data.url, finalPrice: data.finalPrice, expiresAt: data.expiresAt });
    } catch {
      setError('Unable to connect to Stripe. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, discount, discountInput]);

  const handleCopy = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiryLabel = generatedLink
    ? new Date(generatedLink.expiresAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="min-h-full bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            <Zap size={14} />
            Internal Sales Tool
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">FLASHFIRE</h1>
          <p className="text-lg font-semibold text-gray-600 mt-1">Payment Link Generator</p>
          <p className="text-sm text-gray-400 mt-1">Generate discounted Stripe Checkout links for clients</p>
        </div>

        {/* Plan Selection */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Select Plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANS.map((p) => {
              const isSelected = selectedPlan === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id)}
                  className={`relative text-left p-5 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 text-base">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{p.description}</p>
                      <p className="text-2xl font-extrabold text-gray-900 mt-3">${p.originalPrice}</p>
                      <p className="text-xs text-gray-400">Original Price</p>
                    </div>
                    <div
                      className={`mt-1 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Discount Input */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Discount Amount</h2>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">$</span>
            <input
              type="number"
              min="0"
              max={plan.originalPrice - 1}
              step="1"
              placeholder="0"
              value={discountInput}
              onChange={(e) => {
                // Strip negatives and limit to 2 decimals
                const val = e.target.value;
                if (val === '' || /^\d+(\.\d{0,2})?$/.test(val)) {
                  setDiscountInput(val);
                }
              }}
              className="w-full pl-8 pr-4 py-3 text-lg border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Live Price Summary */}
          <div className="mt-5 bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Original Price</span>
              <span className="font-semibold">${plan.originalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Discount</span>
              <span className="font-semibold text-red-500">- ${discount > 0 ? discount.toFixed(2) : '0.00'}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="font-bold text-gray-900">Final Price</span>
              <span
                className={`text-xl font-extrabold ${
                  finalPrice <= 0 ? 'text-red-500' : 'text-green-600'
                }`}
              >
                ${finalPrice > 0 ? finalPrice.toFixed(2) : '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Generate Button */}
        {!generatedLink && (
          <button
            type="button"
            disabled={loading || finalPrice <= 0}
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-base transition-all shadow-md shadow-blue-500/30"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Payment Link'
            )}
          </button>
        )}

        {/* Success State */}
        {generatedLink && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={18} />
              </div>
              <span className="font-bold text-base">Payment Link Generated Successfully</span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 rounded-xl py-3 px-2">
                <p className="text-xs text-gray-400 mb-1">Plan</p>
                <p className="font-bold text-gray-900 text-sm">{plan.name}</p>
              </div>
              <div className="bg-gray-50 rounded-xl py-3 px-2">
                <p className="text-xs text-gray-400 mb-1">Final Price</p>
                <p className="font-bold text-green-600 text-lg">${generatedLink.finalPrice.toFixed(2)}</p>
              </div>
              <div className="bg-orange-50 rounded-xl py-3 px-2">
                <p className="text-xs text-orange-400 mb-1">Expires At</p>
                <p className="font-bold text-orange-600 text-sm">{expiryLabel}</p>
                <p className="text-[10px] text-orange-400">(5 hours)</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-2 font-semibold">Stripe Checkout URL</p>
              <p className="text-xs text-blue-600 break-all font-mono">{generatedLink.url}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCopy}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                  copied
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied ✓' : 'Copy Link'}
              </button>
              <a
                href={generatedLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-all"
              >
                <ExternalLink size={16} />
                Open in Stripe
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setGeneratedLink(null);
                setDiscountInput('');
                setError(null);
              }}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              Generate another link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
