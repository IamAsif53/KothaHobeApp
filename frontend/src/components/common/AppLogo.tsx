import React from 'react';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const sizeMap = {
    sm: { box: 'w-10 h-10', icon: 'w-6 h-6', text: 'text-base', sub: 'text-[10px]' },
    md: { box: 'w-14 h-14', icon: 'w-8 h-8', text: 'text-xl', sub: 'text-xs' },
    lg: { box: 'w-20 h-20', icon: 'w-12 h-12', text: 'text-2xl', sub: 'text-sm' },
    xl: { box: 'w-28 h-28', icon: 'w-16 h-16', text: 'text-3xl', sub: 'text-base' },
  };

  const current = sizeMap[size];

  return (
    <div className="flex flex-col items-center select-none">
      <div
        className={`${current.box} rounded-3xl bg-gradient-to-br from-[#10B981] to-[#064E3B] p-0.5 shadow-2xl shadow-emerald-950/60 flex items-center justify-center relative overflow-hidden group`}
      >
        <img
          src="/logo.png"
          alt="Kotha Hobe Logo"
          className="w-full h-full object-cover rounded-3xl transition-transform group-hover:scale-105"
        />
      </div>

      {showSubtitle && (
        <div className="mt-3 text-center">
          <h1 className={`${current.text} font-extrabold tracking-tight text-white flex items-center justify-center gap-1.5`}>
            <span>Kotha Hobe</span>
          </h1>
          <p className={`${current.sub} text-emerald-400 font-bold tracking-wide mt-0.5`}>
            কথা হবে
          </p>
        </div>
      )}
    </div>
  );
};
