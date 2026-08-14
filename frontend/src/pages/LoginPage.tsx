import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatE164 } from '../utils/phoneFormatter';
import { MessageSquare, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [countryCode, setCountryCode] = useState('+880');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { sendOtp } = useAuth();
  const navigate = useNavigate();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const val = e.target.value.replace(/[^\d]/g, '');
    setPhoneDigits(val);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phoneDigits || phoneDigits.length < 8) {
      setError('Please enter a valid phone number');
      return;
    }

    const fullE164 = formatE164(phoneDigits, countryCode);

    setIsSubmitting(true);
    try {
      const success = await sendOtp(fullE164, 'recaptcha-container');
      if (success) {
        navigate('/otp');
      } else {
        setError('Failed to send verification code. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'An error occurred during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 max-w-md mx-auto">
      {/* Invisible reCAPTCHA container for Firebase */}
      <div id="recaptcha-container"></div>

      <div className="pt-8">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
          <MessageSquare className="w-7 h-7 text-brand-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Welcome</h1>
        <p className="text-chat-textMuted text-sm leading-relaxed mb-8">
          Chat privately with the people who matter. Enter your phone number to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-2">
              Phone Number
            </label>

            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="bg-chat-card border border-white/10 text-white rounded-xl px-3 py-3.5 text-sm font-medium focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="+880">🇧🇩 +880</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
                <option value="+91">🇮🇳 +91</option>
                <option value="+971">🇦🇪 +971</option>
              </select>

              <input
                type="tel"
                value={phoneDigits}
                onChange={handlePhoneChange}
                placeholder="1700 000000"
                autoFocus
                className="flex-1 bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl px-4 py-3.5 text-base font-medium tracking-wide focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Quick test number helper hint */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-chat-textMuted leading-normal">
            💡 <strong className="text-white">Testing Tip:</strong> Use any valid number or Firebase test number e.g.{' '}
            <button
              type="button"
              onClick={() => {
                setCountryCode('+880');
                setPhoneDigits('1700000000');
              }}
              className="text-brand-400 underline font-mono"
            >
              +8801700000000
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !phoneDigits}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20 mt-4"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-chat-textMuted py-4">
        <ShieldCheck className="w-4 h-4 text-brand-400" />
        <span>Your phone number is used exclusively for 1-to-1 account verification.</span>
      </div>
    </div>
  );
};
