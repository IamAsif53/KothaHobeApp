import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowLeft, RotateCw } from 'lucide-react';

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart}***@${domain}`;
  }
  const start = localPart.slice(0, 1);
  const end = localPart.slice(-1);
  return `${start}***${end}@${domain}`;
}

export const OtpPage: React.FC = () => {
  const { email, verifyOtp, sendOtp } = useAuth();
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(60);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  // Redirect if no email in session
  useEffect(() => {
    const activeEmail = email || localStorage.getItem('kotha_hobe_pending_email');
    if (!activeEmail) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  // Resend countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^\d]/g, '');
    if (!cleaned) {
      const copy = [...otpDigits];
      copy[index] = '';
      setOtpDigits(copy);
      return;
    }

    // Single digit input
    const char = cleaned.slice(-1);
    const copy = [...otpDigits];
    copy[index] = char;
    setOtpDigits(copy);
    setError('');

    // Advance to next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^\d]/g, '').slice(0, 6);
    if (!pasted) return;

    const copy = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      copy[i] = pasted[i] || '';
    }
    setOtpDigits(copy);
    setError('');

    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const result = await verifyOtp(fullOtp);
      if (result.success) {
        if (result.hasProfile) {
          navigate('/chats', { replace: true });
        } else {
          navigate('/profile-setup', { replace: true });
        }
      } else {
        setError(result.error || 'Invalid verification code');
      }
    } catch (err: any) {
      setError(err?.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isResending) return;
    const targetEmail = email || localStorage.getItem('kotha_hobe_pending_email') || '';
    if (!targetEmail) return;

    setIsResending(true);
    setError('');

    try {
      await sendOtp(targetEmail);
      setCountdown(60);
      setOtpDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err?.message || 'Failed to resend code');
    } finally {
      setIsResending(false);
    }
  };

  const targetEmail = email || localStorage.getItem('kotha_hobe_pending_email') || '';

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 max-w-md mx-auto">
      <div className="pt-4">
        <button
          onClick={() => navigate('/login')}
          className="inline-flex items-center gap-2 text-xs font-medium text-chat-textMuted hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Email</span>
        </button>

        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
          <ShieldCheck className="w-7 h-7 text-brand-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Enter Verification Code</h1>
        <p className="text-chat-textMuted text-sm leading-relaxed mb-8">
          Verification code sent to <strong className="text-white">{maskEmail(targetEmail)}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-between gap-2" onPaste={handlePaste}>
            {otpDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="tel"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                autoFocus={idx === 0}
                className="w-12 h-14 bg-chat-card border border-white/10 text-white rounded-xl text-center text-xl font-bold font-mono focus:outline-none focus:border-brand-500 transition-colors"
              />
            ))}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying || otpDigits.join('').length !== 6}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20"
          >
            {isVerifying ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Verify & Continue</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          {countdown > 0 ? (
            <p className="text-xs text-chat-textMuted">
              Resend code in <strong className="text-white font-mono">{countdown}s</strong>
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="inline-flex items-center gap-1.5 text-xs text-brand-400 font-semibold hover:text-brand-300 transition-colors"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
              <span>Resend code</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
