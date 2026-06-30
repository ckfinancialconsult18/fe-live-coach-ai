'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Client, Policy } from '@/lib/types';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((d) => { setClients(d.clients ?? []); setPolicies(d.policies ?? []); });
  }, []);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return !q || `${c.firstName} ${c.lastName} ${c.email} ${c.city} ${c.state}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-500">{filtered.length} clients</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <Button icon={<PlusIcon />}>New Client</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((client) => {
          const clientPolicies = policies.filter((p) => p.clientId === client.id);
          const totalPremium = clientPolicies.reduce((sum, p) => sum + p.premium, 0);
          const age = client.dob ? new Date().getFullYear() - new Date(client.dob).getFullYear() : null;

          return (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <div className="glass-card rounded-2xl p-5 hover:bg-white/9 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-200 cursor-pointer group">
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-violet-600/30 border border-white/15 flex items-center justify-center text-base font-bold text-slate-200 shrink-0">
                    {client.firstName[0]}{client.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-100 group-hover:text-blue-300 transition-colors truncate">
                      {client.firstName} {client.lastName}
                    </h3>
                    <p className="text-xs text-slate-500">{client.email}</p>
                    <p className="text-xs text-slate-500">{client.phone}</p>
                  </div>
                  <Badge variant={clientPolicies.length > 0 ? 'success' : 'default'}>
                    {clientPolicies.length} {clientPolicies.length === 1 ? 'policy' : 'policies'}
                  </Badge>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    ['Age', age !== null ? `${age} yrs` : '—'],
                    ['Location', `${client.city}, ${client.state}`],
                    ['DOB', client.dob],
                    ['Monthly Premium', `$${totalPremium.toFixed(0)}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-white/4 px-3 py-2">
                      <p className="text-[10px] text-slate-600 uppercase tracking-wide">{label}</p>
                      <p className="text-sm text-slate-300 font-medium">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Beneficiaries */}
                {client.beneficiaries.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>👨‍👩‍👧 Beneficiaries:</span>
                    <span className="text-slate-400">{client.beneficiaries.map((b) => b.name).join(', ')}</span>
                  </div>
                )}

                {/* Policies preview */}
                {clientPolicies.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/6 flex gap-2 flex-wrap">
                    {clientPolicies.map((p) => (
                      <span key={p.id} className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {p.carrier} · {p.type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-slate-600">
          <p className="text-4xl mb-3">👥</p>
          <p>No clients found</p>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
