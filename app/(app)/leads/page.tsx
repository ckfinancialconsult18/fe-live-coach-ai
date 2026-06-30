'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { Lead, LeadStatus } from '@/lib/types';

const statusConfig: Record<LeadStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' }> = {
  new:          { label: 'New',          variant: 'info' },
  contacted:    { label: 'Contacted',    variant: 'purple' },
  qualified:    { label: 'Qualified',    variant: 'warning' },
  proposal:     { label: 'Proposal',     variant: 'warning' },
  negotiation:  { label: 'Negotiation',  variant: 'warning' },
  closed_won:   { label: 'Closed Won',   variant: 'success' },
  closed_lost:  { label: 'Closed Lost',  variant: 'danger' },
};

const pipelineStages: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

const sourceOptions = ['Facebook Ad', 'Google Ad', 'Referral', 'Direct Mail', 'Cold Call', 'Website', 'Other'];

const emptyLead: Partial<Lead> = {
  firstName: '', lastName: '', email: '', phone: '',
  status: 'new', source: '', tags: [], notes: '', state: '', city: '',
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [filterSource, setFilterSource] = useState('all');
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Partial<Lead>>(emptyLead);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => r.json())
      .then((d) => setLeads(d.leads ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${l.firstName} ${l.lastName} ${l.email} ${l.phone} ${l.city}`.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || l.status === filterStatus;
    const matchSource = filterSource === 'all' || l.source === filterSource;
    return matchSearch && matchStatus && matchSource;
  });

  function openCreate() {
    setEditingLead({ ...emptyLead });
    setIsEdit(false);
    setModalOpen(true);
  }

  function openEdit(lead: Lead) {
    setEditingLead({ ...lead });
    setIsEdit(true);
    setModalOpen(true);
  }

  async function saveLead() {
    if (!editingLead.firstName || !editingLead.lastName) return;
    if (isEdit) {
      const res = await fetch(`/api/leads/${editingLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingLead),
      });
      const { lead } = await res.json();
      setLeads((prev) => prev.map((l) => l.id === lead.id ? lead : l));
    } else {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editingLead.firstName,
          lastName: editingLead.lastName,
          email: editingLead.email ?? '',
          phone: editingLead.phone ?? '',
          status: (editingLead.status as LeadStatus) ?? 'new',
          source: editingLead.source ?? '',
          tags: editingLead.tags ?? [],
          notes: editingLead.notes ?? '',
          city: editingLead.city,
          state: editingLead.state,
          age: editingLead.age,
        }),
      });
      const { lead } = await res.json();
      setLeads((prev) => [lead, ...prev]);
    }
    setModalOpen(false);
  }

  async function deleteLead(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setSelectedLead(null);
    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{filtered.length} leads found</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(['table', 'kanban'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  view === v ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {v === 'table' ? '☰ Table' : '⬛ Kanban'}
              </button>
            ))}
          </div>
          <Button onClick={openCreate} icon={<PlusIcon />}>New Lead</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as LeadStatus | 'all')}
          className="h-9 rounded-lg border border-white/10 px-3 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50"
          style={{ backgroundColor: '#141929' }}
        >
          <option value="all">All Statuses</option>
          {pipelineStages.map((s) => (
            <option key={s} value={s}>{statusConfig[s].label}</option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="h-9 rounded-lg border border-white/10 px-3 text-sm text-slate-300 focus:outline-none focus:border-blue-500/50"
          style={{ backgroundColor: '#141929' }}
        >
          <option value="all">All Sources</option>
          {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table View */}
      {view === 'table' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {['Name', 'Phone', 'Status', 'Source', 'Location', 'Tags', 'Updated', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead, i) => (
                  <tr
                    key={lead.id}
                    className={`border-b border-white/4 hover:bg-white/4 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-slate-500">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{lead.phone}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusConfig[lead.status].variant}>
                        {statusConfig[lead.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{lead.source}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{lead.city}, {lead.state}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {lead.tags.map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{lead.updatedAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(lead)}
                          className="text-slate-500 hover:text-blue-400 transition-colors p-1"
                          title="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                          title="View notes"
                        >
                          <EyeIcon />
                        </button>
                        <button
                          onClick={() => deleteLead(lead.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-600">
                      {loading ? 'Loading leads...' : 'No leads match your search'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipelineStages.map((stage) => {
            const stageLeads = filtered.filter((l) => l.status === stage);
            return (
              <div key={stage} className="shrink-0 w-72">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={statusConfig[stage].variant}>{statusConfig[stage].label}</Badge>
                  <span className="text-xs text-slate-600">{stageLeads.length}</span>
                </div>
                <div className="space-y-3">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="glass-card rounded-xl p-4 hover:bg-white/9 transition-all cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-300">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{lead.firstName} {lead.lastName}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{lead.phone}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">{lead.source}</span>
                        {lead.age && <span className="text-xs text-slate-600">Age {lead.age}</span>}
                      </div>
                      {lead.tags.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {lead.tags.map((tag) => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-white/8 p-6 text-center text-xs text-slate-700">
                      No leads
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isEdit ? 'Edit Lead' : 'Create New Lead'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveLead}>{isEdit ? 'Save Changes' : 'Create Lead'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={editingLead.firstName ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, firstName: e.target.value }))}
            placeholder="John"
          />
          <Input
            label="Last Name"
            value={editingLead.lastName ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, lastName: e.target.value }))}
            placeholder="Doe"
          />
          <Input
            label="Email"
            type="email"
            value={editingLead.email ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, email: e.target.value }))}
            placeholder="john@email.com"
          />
          <Input
            label="Phone"
            value={editingLead.phone ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, phone: e.target.value }))}
            placeholder="(555) 123-4567"
          />
          <Input
            label="City"
            value={editingLead.city ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, city: e.target.value }))}
            placeholder="Dallas"
          />
          <Input
            label="State"
            value={editingLead.state ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, state: e.target.value }))}
            placeholder="TX"
          />
          <Input
            label="Age"
            type="number"
            value={editingLead.age ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, age: Number(e.target.value) }))}
            placeholder="65"
          />
          <Select
            label="Source"
            value={editingLead.source ?? ''}
            onChange={(e) => setEditingLead((p) => ({ ...p, source: e.target.value }))}
          >
            <option value="">Select source...</option>
            {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select
            label="Status"
            value={editingLead.status ?? 'new'}
            onChange={(e) => setEditingLead((p) => ({ ...p, status: e.target.value as LeadStatus }))}
            className="col-span-2"
          >
            {pipelineStages.map((s) => <option key={s} value={s}>{statusConfig[s].label}</option>)}
          </Select>
          <div className="col-span-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide block mb-1.5">Notes</label>
            <textarea
              value={editingLead.notes ?? ''}
              onChange={(e) => setEditingLead((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 text-slate-200 text-sm p-3 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 resize-none"
              placeholder="Any notes about this lead..."
            />
          </div>
        </div>
      </Modal>

      {/* View Lead Modal */}
      {selectedLead && (
        <Modal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          title={`${selectedLead.firstName} ${selectedLead.lastName}`}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSelectedLead(null)}>Close</Button>
              <Button onClick={() => { openEdit(selectedLead); setSelectedLead(null); }}>Edit</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/30 to-violet-600/30 border border-white/15 flex items-center justify-center text-lg font-bold text-slate-200">
                {selectedLead.firstName[0]}{selectedLead.lastName[0]}
              </div>
              <div>
                <p className="font-semibold text-slate-100">{selectedLead.firstName} {selectedLead.lastName}</p>
                <p className="text-sm text-slate-500">{selectedLead.email}</p>
              </div>
              <div className="ml-auto">
                <Badge variant={statusConfig[selectedLead.status].variant}>
                  {statusConfig[selectedLead.status].label}
                </Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Phone', selectedLead.phone],
                ['Source', selectedLead.source],
                ['Location', `${selectedLead.city ?? ''}, ${selectedLead.state ?? ''}`],
                ['Age', selectedLead.age ? `${selectedLead.age} years` : '—'],
                ['Created', selectedLead.createdAt],
                ['Updated', selectedLead.updatedAt],
              ].map(([label, value]) => (
                <div key={label} className="p-3 rounded-lg bg-white/4">
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className="text-slate-200">{value}</p>
                </div>
              ))}
            </div>
            {selectedLead.notes && (
              <div className="p-3 rounded-lg bg-white/4">
                <p className="text-xs text-slate-500 mb-1">Notes</p>
                <p className="text-sm text-slate-300">{selectedLead.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function EditIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function EyeIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function TrashIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
}
