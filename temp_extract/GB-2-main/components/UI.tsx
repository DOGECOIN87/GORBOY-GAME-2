
import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'secondary' }> = ({ 
  children, 
  variant = 'default', 
  className = '', 
  ...props 
}) => {
  const base = "px-4 py-2 rounded-xl font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-tighter text-xs md:text-sm";
  const variants = {
    default: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20",
    outline: "border border-slate-700 hover:bg-slate-800 text-slate-200 backdrop-blur-sm",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl ${className}`}>
    {children}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode, variant?: 'default' | 'outline' | 'secondary', className?: string }> = ({ 
  children, 
  variant = 'default', 
  className = '' 
}) => {
  const variants = {
    default: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    outline: "border border-slate-700 text-slate-400",
    secondary: "bg-slate-800 text-slate-300"
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-widest border font-mono ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const Progress: React.FC<{ value: number, className?: string }> = ({ value, className = '' }) => (
  <div className={`w-full bg-slate-800/80 rounded-full overflow-hidden border border-white/5 ${className}`}>
    <div 
      className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-300 ease-out" 
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);
