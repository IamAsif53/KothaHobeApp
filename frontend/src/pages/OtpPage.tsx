import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowLeft, RefreshCw, Mail } from 'lucide-react';

export const OtpPage: React.FC = () => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);

  const { email, verifyOtp, sendOtp } = useAuth();
  const navigate = useNavigate();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  // Resend timer countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [resendCooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto submit when 6 digits filled
    if (newCode.every((digit) => digit !== '') && index === 5) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const otpCode = fullCode || code.join('');
    if (otpCode.length < 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    setError('');

    const res = await verifyOtp(otpCode);
    setIsVerifying(false);

    if (res.success) {
      if (res.isNewUser) {
        navigate('/profile-setup', { replace: true });
      } else {
        navigate('/chats', { replace: true });
      }
    } else {
      setError(res.error || 'Invalid verification code. Please check your email.');
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    try {
      const success = await sendOtp(email);
      if (success) {
        setResendCooldown(30);
        setCode(['', '', '', '', '', '']);
      } else {
        setError('Failed to resend code. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to resend code.');
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 max-w-md mx-auto">
      <div>
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-chat-textMuted hover:text-white transition-colors mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change Email</span>
        </button>

        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-6">
          <Mail className="w-7 h-7 text-brand-400" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Check your Gmail Inbox</h1>
        <p className="text-chat-textMuted text-sm leading-relaxed mb-6">
          We sent a 6-digit code to <strong className="text-white font-mono">{email}</strong>
        </p>

        {/* 6 Digit OTP inputs */}
        <div className="flex justify-between gap-2 mb-6">
          {code.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="tel"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="w-12 h-14 bg-chat-card border border-white/10 text-white font-bold text-xl text-center rounded-xl focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
            />
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium mb-4">
            {error}
          </div>
        )}

        <button
          onClick={() => handleVerify()}
          disabled={isVerifying || code.some((d) => !d)}
          className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20"
        >
          {isVerifying ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>Verify & Enter</span>
          )}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 py-4">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0}
          className="flex items-center gap-2 text-sm text-brand-400 disabled:text-chat-textMuted transition-colors font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${resendCooldown > 0 ? '' : 'animate-spin-once'}`} />
          <span>
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
          </span>
        </button>
      </div>
    </div>
  );
};
