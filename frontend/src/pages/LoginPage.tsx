import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, ShieldCheck, Mail } from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';

export const LoginPage: React.FC = () => {
  const [emailInput, setEmailInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { sendOtp } = useAuth();
  const navigate = useNavigate();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailInput(e.target.value);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = emailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await sendOtp(trimmedEmail);
      if (success) {
        navigate('/otp');
      } else {
        setError('Failed to send verification code. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch verification code. Please check your email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 max-w-md mx-auto select-none">
      <div className="pt-10">
        <div className="flex justify-start mb-6">
          <AppLogo size="md" showSubtitle={true} />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Welcome</h1>
        <p className="text-chat-textMuted text-sm leading-relaxed mb-6">
          Chat privately with friends and family. Enter your email address to get started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-2">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                value={emailInput}
                onChange={handleEmailChange}
                placeholder="name@example.com"
                disabled={isSubmitting}
                className="w-full bg-chat-input text-chat-textPrimary placeholder:text-chat-textMuted px-4 py-3.5 pl-11 rounded-xl border border-white/5 focus:border-brand-500 focus:outline-none transition-colors text-sm"
                autoComplete="email"
                autoFocus
              />
              <Mail className="w-5 h-5 text-chat-textMuted absolute left-3.5 top-1/2 -translate-y-1/2" />
            </div>
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20 text-sm"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="pt-6 pb-2 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span>Secured with OTP email authentication</span>
        </div>
      </div>
    </div>
  );
};
