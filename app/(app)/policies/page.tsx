'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Policy, PolicyType } from '@/lib/types';

const typeLabels: Record<PolicyType, string> = {
  final_expense: 'Final Expense',
  mortgage_protection: 'Mortgage Protection',
  term: 'Term',
  whole_life: 'Whole Life',
  universal_life: 'Universal Life',
};

const typeColors: Record<PolicyType, 'blue' | 'green' | 'purple' | 'amber' | 'cyan'> = {
  final_expense: 'blue',
  mortgage_protection: 'green',
  term: 'cyan',
  whole_life: 'purple',
  universal_life: 'amber',
};

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  issued: 'success',
  pending: 'warning',
  lapsed: 'danger',
  declined: 'danger',
  withdrawn: 'default',
  cancelled: 'default',
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<PolicyType | 'all'>('all');
  const [filterCarrier, setFilterCarrier] = useState('all');

  useEffect(() => {
    fetch('/api/policies').then((r) => r.json()).then((d) => setPolicies(d.policies ?? []));
  }, []);

  const carriers = [...new Set(policies.map((p) => p.carrier))];

  const filtered = policies.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${p.clientName} ${p.policyNumber} ${p.carrier}`.toLowerCase().includes(q);
    const matchType = filterType === 'all' || p.type === filterType;
    const matchCarrier = filterCarrier === 'all' || p.carrier === filterCarrier;
    return matchSearch && matchType && matchCarrier;
  });

  const totalFaceAmount = filtered.reduce((s, p) => s + p.faceAmount, 0);
  const totalPremium = filtered.reduce((s, p) => s + p.premium, 0);
  const totalCommission = filtered.reduce((s, p) => s + p.commission, 0);

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Policies', value: filtered.length.toString(), color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Total Coverage', value: `$${(totalFaceAmount / 1000).toFixed(0)}k`, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Monthly Premium', value: `$${totalPremium.toFixed(0)}`, color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Total Commission', value: `$${totalCommission.toFixed(0)}`, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((card) => (
          <div key={card.label} className={`glass-card rounded-2xl p-4 ${card.bg} border border-white/6`}>
            <p className="text-xs text-slate-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as PolicyType | 'all')}
            className="h-9 rounded-lg border border-white/10 px-3 text-sm text-slate-300 focus:outline-none"
            style={{ backgroundColor: '#141929' }}
          >
            <option value="all">All Types</option>
            {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={filterCarrier}
            onChange={(e) => setFilterCarrier(e.target.value)}
            className="h-9 rounded-lg border border-white/10 px-3 text-sm text-slate-300 focus:outline-none"
            style={{ backgroundColor: '#141929' }}
          >
            <option value="all">All Carriers</option>
            {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Button icon={<PlusIcon />}>New Policy</Button>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {['Client', 'Type', 'Carrier', 'Policy #', 'Face Amount', 'Premium/mo', 'Commission', 'Status', 'Effective'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((policy, i) => {
                const color = typeColors[policy.type];
                const colorClass = {
                  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  green: 'bg-green-500/10 text-green-400 border-green-500/20',
                  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
                  purple: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
                  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                }[color];
                return (
                  <tr key={policy.id} className={`border-b border-white/4 hover:bg-white/4 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">{policy.clientName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${colorClass}`}>
                        {typeLabels[policy.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{policy.carrier}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{policy.policyNumber}</td>
                    <td className="px-4 py-3 text-slate-200 font-medium">${policy.faceAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-300">${policy.premium.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="text-green-400 font-medium">${policy.commission.toFixed(2)}</span>
                      <span className="text-slate-600 text-xs ml-1">({(policy.commissionRate * 100).toFixed(0)}%)</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[policy.status] ?? 'default'}>{policy.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{policy.effectiveDate}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-slate-600">No policies found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Policy Type Breakdown */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">By Product Type</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(typeLabels).map(([type, label]) => {
            const count = policies.filter((p) => p.type === type).length;
            const color = typeColors[type as PolicyType];
            const colorClass = {
              blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
              green: 'bg-green-500/10 text-green-400 border-green-500/20',
              cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
              purple: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
              amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            }[color];
            return (
              <div key={type} className={`rounded-xl border p-3 text-center ${colorClass}`}>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs mt-1 opacity-80">{label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
