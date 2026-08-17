import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const sizeMap = {
    sm: { box: 'w-10 h-10', text: 'text-base', sub: 'text-[10px]' },
    md: { box: 'w-16 h-16', text: 'text-xl', sub: 'text-xs' },
    lg: { box: 'w-24 h-24', text: 'text-2xl', sub: 'text-sm' },
    xl: { box: 'w-32 h-32', text: 'text-3xl', sub: 'text-base' },
  };

  const current = sizeMap[size];

  return (
    <div className="flex flex-col items-center select-none">
      <div
        className={`${current.box} rounded-3xl p-1 bg-[#EDEAD9] shadow-2xl shadow-black/40 flex items-center justify-center relative overflow-hidden group border border-emerald-900/10`}
      >
        <img
          src="/logo.png"
          alt="কথা হবে Logo"
          className="w-full h-full object-contain rounded-2xl transition-transform group-hover:scale-105"
        />
      </div>

      {showSubtitle && (
        <div className="mt-3 text-center">
          <h1 className={`${current.text} font-extrabold tracking-tight text-white flex items-center justify-center gap-1.5`}>
            <span>Kotha Hobe</span>
          </h1>
          <p className={`${current.sub} text-emerald-400 font-bold tracking-wide mt-0.5 font-sans`}>
            কথা হবে
          </p>
        </div>
      )}
    </div>
  );
};
