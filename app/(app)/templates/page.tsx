'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';

type TemplateType = 'email' | 'sms';

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject?: string;
  body: string;
  tags: string[];
}

const T = String.raw;

const mockTemplates: Template[] = [
  {
    id: 'tmpl1',
    name: 'Initial FE Lead Follow-Up',
    type: 'email',
    subject: T`Your Final Expense Quote is Ready, {{first_name}}!`,
    body: T`Hi {{first_name}},

Thank you for reaching out about Final Expense coverage! I've put together some options tailored to your needs.

Based on what you shared, I've found carriers that can provide coverage starting as low as {{monthly_premium}}/month — no medical exam required.

I'd love to walk you through your options. Are you available for a quick 15-minute call this week?

Best regards,
{{agent_name}}
CK Financial`,
    tags: ['final_expense', 'follow_up', 'new_lead'],
  },
  {
    id: 'tmpl2',
    name: 'Appointment Reminder',
    type: 'sms',
    body: T`Hi {{first_name}}! Just a reminder about our appointment tomorrow at {{time}}. We'll be reviewing your life insurance options. Reply STOP to unsubscribe. - {{agent_name}}, CK Financial`,
    tags: ['appointment', 'reminder'],
  },
  {
    id: 'tmpl3',
    name: 'Policy Delivery Follow-Up',
    type: 'email',
    subject: T`Your Policy is Official, {{first_name}}!`,
    body: T`Congratulations, {{first_name}}!

Your {{policy_type}} policy from {{carrier}} is now officially in force as of {{effective_date}}.

Policy Number: {{policy_number}}
Face Amount: {{face_amount}}
Monthly Premium: {{premium}}

Your beneficiary {{beneficiary_name}} has been listed as primary beneficiary.

Please keep your policy documents in a safe place and share the details with your beneficiary. If you have any questions or need to make changes, I'm always here to help.

Thank you for trusting CK Financial with your coverage.

Warmly,
{{agent_name}}`,
    tags: ['policy', 'delivery', 'welcome'],
  },
  {
    id: 'tmpl4',
    name: 'Mortgage Protection Quote',
    type: 'email',
    subject: T`Protect Your Home, {{first_name}} — Your MP Quote`,
    body: T`Hi {{first_name}},

Congratulations on your new home purchase! This is such an exciting time, and I want to make sure your family is protected.

I've prepared a Mortgage Protection quote that would cover your {{loan_amount}} mortgage if something unexpected happens to you:

Your family keeps the home.
No out-of-pocket mortgage payments.
Return of premium option available.

Can we schedule 20 minutes to review the options?

{{agent_name}}
CK Financial`,
    tags: ['mortgage_protection', 'quote'],
  },
  {
    id: 'tmpl5',
    name: 'Birthday Message',
    type: 'sms',
    body: T`Happy Birthday, {{first_name}}! Wishing you a wonderful day. It's also a great time to review your coverage — reply or call me anytime. - {{agent_name}}, CK Financial`,
    tags: ['birthday', 'client_care'],
  },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>(mockTemplates);
  const [filterType, setFilterType] = useState<'all' | TemplateType>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [newTemplate, setNewTemplate] = useState<Partial<Template>>({ type: 'email', body: '', name: '' });

  const filtered = templates.filter((t) => filterType === 'all' || t.type === filterType);

  function saveTemplate() {
    if (!newTemplate.name || !newTemplate.body) return;
    const tmpl: Template = {
      id: `tmpl${Date.now()}`,
      name: newTemplate.name!,
      type: newTemplate.type as TemplateType ?? 'email',
      subject: newTemplate.subject,
      body: newTemplate.body!,
      tags: [],
    };
    setTemplates((prev) => [...prev, tmpl]);
    setModalOpen(false);
    setNewTemplate({ type: 'email', body: '', name: '' });
  }

  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['all', 'email', 'sms'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors capitalize ${
                filterType === f ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
              }`}
            >
              {f === 'email' ? '📧 Email' : f === 'sms' ? '💬 SMS' : 'All Templates'}
            </button>
          ))}
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<PlusIcon />}>New Template</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filtered.map((template) => (
          <div key={template.id} className="glass-card rounded-2xl p-5 hover:bg-white/9 transition-all">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{template.type === 'email' ? '📧' : '💬'}</span>
                  <h3 className="font-semibold text-slate-200 truncate">{template.name}</h3>
                </div>
                {template.subject && (
                  <p className="text-xs text-slate-500 ml-7 truncate">Subject: {template.subject}</p>
                )}
              </div>
              <Badge variant={template.type === 'email' ? 'info' : 'success'}>
                {template.type.toUpperCase()}
              </Badge>
            </div>

            {/* Body preview */}
            <div className="bg-white/3 rounded-xl p-3 mb-3">
              <p className="text-xs text-slate-400 leading-relaxed line-clamp-4 font-mono whitespace-pre-wrap">
                {template.body}
              </p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {template.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPreviewTemplate(template)}>
                Preview
              </Button>
              <Button size="sm" variant="ghost">Copy</Button>
              <Button size="sm" variant="ghost">
                {template.type === 'email' ? '📧 Send Email' : '💬 Send SMS'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* New Template Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Template"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}>Save Template</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={newTemplate.name ?? ''}
            onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Initial Follow-Up"
          />
          <Select
            label="Type"
            value={newTemplate.type ?? 'email'}
            onChange={(e) => setNewTemplate((p) => ({ ...p, type: e.target.value as TemplateType }))}
          >
            <option value="email">📧 Email</option>
            <option value="sms">💬 SMS</option>
          </Select>
          {newTemplate.type === 'email' && (
            <Input
              label="Subject Line"
              value={newTemplate.subject ?? ''}
              onChange={(e) => setNewTemplate((p) => ({ ...p, subject: e.target.value }))}
              placeholder="Use {{first_name}} for personalization"
            />
          )}
          <Textarea
            label="Body"
            value={newTemplate.body ?? ''}
            onChange={(e) => setNewTemplate((p) => ({ ...p, body: e.target.value }))}
            rows={8}
            placeholder="Use {{first_name}}, {{agent_name}}, {{carrier}}, etc. for merge fields"
          />
          <div className="p-3 rounded-lg bg-blue-500/8 border border-blue-500/15">
            <p className="text-xs text-blue-400 font-medium mb-1">Available merge fields:</p>
            <p className="text-xs text-slate-500 font-mono">
              {'{{first_name}} {{last_name}} {{agent_name}} {{carrier}} {{policy_number}} {{premium}} {{face_amount}} {{effective_date}} {{time}}'}
            </p>
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      {previewTemplate && (
        <Modal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          title={previewTemplate.name}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={previewTemplate.type === 'email' ? 'info' : 'success'}>
                {previewTemplate.type.toUpperCase()}
              </Badge>
            </div>
            {previewTemplate.subject && (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-xs text-slate-500 mb-1">Subject</p>
                <p className="text-sm text-slate-200">{previewTemplate.subject}</p>
              </div>
            )}
            <div className="p-4 rounded-xl bg-[#0f1422] border border-white/8">
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                {previewTemplate.body}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
