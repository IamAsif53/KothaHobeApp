import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, ArrowRight, ShieldCheck } from 'lucide-react';

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

    const cleanEmail = emailInput.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setError('Please enter a valid Gmail / Email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await sendOtp(cleanEmail);
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
      <div className="pt-8">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
          <Mail className="w-7 h-7 text-brand-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Welcome to Kotha Hobe</h1>
        <p className="text-chat-textMuted text-sm leading-relaxed mb-8">
          Private, real-time messaging with your friends. Enter your Gmail / Email to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-2">
              Email Address
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-chat-textMuted">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                value={emailInput}
                onChange={handleEmailChange}
                placeholder="yourname@gmail.com"
                autoFocus
                required
                className="w-full bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl pl-11 pr-4 py-3.5 text-base font-medium tracking-wide focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-chat-textMuted leading-normal">
            📬 We will send a secure <strong className="text-white">6-digit verification code</strong> directly to your Gmail inbox.
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !emailInput}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20 mt-4"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Send Verification Code</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-chat-textMuted py-4">
        <ShieldCheck className="w-4 h-4 text-brand-400" />
        <span>Your email is used securely for account login and verification.</span>
      </div>
    </div>
  );
};
