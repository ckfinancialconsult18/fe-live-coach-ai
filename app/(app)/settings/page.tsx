'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

type SettingsTab = 'profile' | 'agency' | 'notifications' | 'integrations' | 'users' | 'billing';

const tabs: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'profile',       label: 'Profile',        icon: '👤' },
  { id: 'agency',        label: 'Agency',          icon: '🏢' },
  { id: 'notifications', label: 'Notifications',   icon: '🔔' },
  { id: 'integrations',  label: 'Integrations',    icon: '🔗' },
  { id: 'users',         label: 'Users & Roles',   icon: '👥' },
  { id: 'billing',       label: 'Billing',         icon: '💳' },
];

const mockUsers: { id: string; name: string; email: string; role: string; status: string }[] = [];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }


  return (
    <div className="max-w-5xl space-y-6">
      {/* Tab nav */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-100">Profile Settings</h2>
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shrink-0">
              ?
            </div>
            <div>
              <p className="font-semibold text-slate-200">Your Profile</p>
              <p className="text-sm text-slate-500">Update your information below</p>
              <button disabled className="mt-2 text-xs text-slate-600 cursor-not-allowed">Change photo (coming soon)</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" defaultValue="" placeholder="First name" />
            <Input label="Last Name" defaultValue="" placeholder="Last name" />
            <Input label="Email" type="email" defaultValue="" placeholder="you@agency.com" />
            <Input label="Phone" defaultValue="" placeholder="(555) 000-0000" />
            <Input label="License Number" defaultValue="" placeholder="State license number" />
            <Select label="Default State">
              <option>Texas</option>
              <option>Florida</option>
              <option>Georgia</option>
            </Select>
          </div>
          <div>
            <Textarea label="Bio" rows={3} defaultValue="Life insurance agent specializing in Final Expense and Mortgage Protection coverage." />
          </div>
          <div className="flex justify-end gap-3">
            {saved && <p className="text-sm text-amber-400 self-center">Saved locally — server sync coming soon</p>}
            <Button onClick={handleSave}>{saved ? 'Saved' : 'Save Changes'}</Button>
          </div>
        </div>
      )}

      {/* Agency Tab */}
      {activeTab === 'agency' && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <h2 className="text-lg font-semibold text-slate-100">Agency Settings</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Agency Name" defaultValue="" placeholder="Agency name" className="col-span-2" />
            <Input label="Agency Phone" defaultValue="" placeholder="(555) 000-0000" />
            <Input label="Agency Email" defaultValue="" placeholder="info@agency.com" />
            <Input label="Website" defaultValue="" placeholder="agency.com" />
            <Input label="Tax ID / EIN" defaultValue="" placeholder="XX-XXXXXXX" />
            <Input label="Address" defaultValue="" placeholder="Street address" className="col-span-2" />
            <Input label="City" defaultValue="" placeholder="City" />
            <Input label="State" defaultValue="" placeholder="State" />
          </div>
          <div className="flex justify-end gap-3">
            {saved && <p className="text-sm text-amber-400 self-center">Saved locally — server sync coming soon</p>}
            <Button onClick={handleSave}>{saved ? 'Saved' : 'Save Changes'}</Button>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-100">Notification Preferences</h2>
          {[
            { label: 'New Lead Assigned', desc: 'When a new lead is added to your pipeline', default: true },
            { label: 'Appointment Reminder', desc: '30 minutes before each scheduled appointment', default: true },
            { label: 'Task Due Date', desc: 'When a task is due today', default: true },
            { label: 'Commission Paid', desc: 'When a commission payment is received', default: true },
            { label: 'Policy Issued', desc: 'When a policy is confirmed as issued', default: true },
            { label: 'Lead Status Change', desc: 'When a lead moves through the pipeline', default: false },
            { label: 'Weekly Summary', desc: 'Weekly digest of activity and metrics', default: true },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-3 border-b border-white/6 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-200">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <Toggle defaultChecked={item.default} />
            </div>
          ))}
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Integrations</h2>
          {[
            { name: 'Google Calendar', desc: 'Sync appointments with Google Calendar', icon: '📅', connected: false },
            { name: 'Gmail',           desc: 'Send emails directly from CRM',          icon: '📧', connected: false },
            { name: 'Twilio SMS',      desc: 'Send SMS messages to clients and leads', icon: '💬', connected: false },
            { name: 'Zapier',          desc: 'Connect with 5000+ apps via Zapier',     icon: '⚡', connected: false },
            { name: 'DocuSign',        desc: 'E-signature for policy documents',       icon: '✍️', connected: false },
            { name: 'Dropbox',         desc: 'Cloud document storage',                icon: '📦', connected: false },
          ].map((integration) => (
            <div key={integration.name} className="flex items-center gap-4 p-4 rounded-xl border border-white/8 hover:bg-white/5 transition-colors">
              <span className="text-2xl">{integration.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-slate-200">{integration.name}</p>
                <p className="text-xs text-slate-500">{integration.desc}</p>
              </div>
              {integration.connected
                ? <Badge variant="success">Connected</Badge>
                : <Button size="sm" variant="secondary" disabled>Connect</Button>
              }
            </div>
          ))}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Users & Roles</h2>
            <Button size="sm" icon={<PlusIcon />} disabled>Invite User</Button>
          </div>
          <div className="space-y-3">
            {mockUsers.map((user) => (
              <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl border border-white/8">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-violet-600/30 border border-white/15 flex items-center justify-center text-sm font-bold text-slate-200 shrink-0">
                  {user.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-200">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <Badge variant={user.role === 'admin' ? 'danger' : user.role === 'agent' ? 'info' : 'default'}>
                  {user.role}
                </Badge>
                <Badge variant={user.status === 'active' ? 'success' : 'default'}>
                  {user.status}
                </Badge>
                <button disabled className="text-slate-700 cursor-not-allowed text-xs">Edit</button>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-white/3 border border-white/8">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Role Permissions</h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {(['Admin', 'Agent', 'Viewer'] as const).map((role) => (
                <div key={role} className="p-3 rounded-lg bg-white/4">
                  <p className="font-semibold text-slate-300 mb-2">{role}</p>
                  {role === 'Admin' && <p className="text-slate-500">Full access to all features, users, and settings</p>}
                  {role === 'Agent' && <p className="text-slate-500">Manage own leads, clients, policies, and tasks</p>}
                  {role === 'Viewer' && <p className="text-slate-500">Read-only access to assigned records</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-5">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-4">Current Plan</h2>
            <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex-1">
                <p className="font-bold text-blue-300 text-xl">Pro Plan</p>
                <p className="text-sm text-slate-400 mt-1">Unlimited leads, clients, policies · 5 users · All integrations</p>
                <p className="text-xs text-slate-600 mt-2">Renews July 29, 2026</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-200">$99</p>
                <p className="text-xs text-slate-500">/month</p>
              </div>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Payment Method</h2>
            <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10">
              <span className="text-2xl">💳</span>
              <p className="text-slate-300">Visa ending in 4242</p>
              <p className="text-slate-500 text-sm ml-auto">Expires 09/27</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ defaultChecked }: { defaultChecked: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      onClick={() => setOn(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
