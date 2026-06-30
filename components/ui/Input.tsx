'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Input({ label, error, icon, iconRight, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-slate-500 pointer-events-none">{icon}</span>
        )}
        <input
          {...props}
          className={`
            w-full h-10 rounded-lg border bg-white/5 text-slate-200 text-sm
            border-white/10 placeholder-slate-600
            focus:outline-none focus:border-blue-500/50 focus:bg-white/8
            transition-all duration-150
            ${icon ? 'pl-10' : 'pl-3'}
            ${iconRight ? 'pr-10' : 'pr-3'}
            ${error ? 'border-red-500/50' : ''}
            ${className}
          `}
        />
        {iconRight && (
          <span className="absolute right-3 text-slate-500">{iconRight}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className = '', children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        {...props}
        className={`
          w-full h-10 rounded-lg border bg-surface-2 text-slate-200 text-sm
          border-white/10 px-3
          focus:outline-none focus:border-blue-500/50
          transition-all duration-150
          ${error ? 'border-red-500/50' : ''}
          ${className}
        `}
        style={{ backgroundColor: '#141929' }}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        {...props}
        className={`
          w-full rounded-lg border bg-white/5 text-slate-200 text-sm
          border-white/10 placeholder-slate-600 p-3
          focus:outline-none focus:border-blue-500/50 focus:bg-white/8
          transition-all duration-150 resize-none
          ${error ? 'border-red-500/50' : ''}
          ${className}
        `}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
