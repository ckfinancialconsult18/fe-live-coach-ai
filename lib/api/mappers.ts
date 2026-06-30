import type { Lead, Appointment, Task, Commission } from '@/lib/types';

export function leadFromRow(row: any): Lead {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    status: row.status,
    source: row.source ?? '',
    tags: row.tags ?? [],
    notes: row.notes ?? '',
    assignedTo: row.assigned_to ?? '',
    createdAt: row.created_at?.split?.('T')[0] ?? row.created_at,
    updatedAt: row.updated_at?.split?.('T')[0] ?? row.updated_at,
    age: row.age ?? undefined,
    state: row.state ?? undefined,
    city: row.city ?? undefined,
  };
}

export function leadToRow(lead: Partial<Lead>): Record<string, any> {
  const row: Record<string, any> = {};
  if (lead.firstName !== undefined) row.first_name = lead.firstName;
  if (lead.lastName !== undefined) row.last_name = lead.lastName;
  if (lead.email !== undefined) row.email = lead.email;
  if (lead.phone !== undefined) row.phone = lead.phone;
  if (lead.status !== undefined) row.status = lead.status;
  if (lead.source !== undefined) row.source = lead.source;
  if (lead.tags !== undefined) row.tags = lead.tags;
  if (lead.notes !== undefined) row.notes = lead.notes;
  if (lead.age !== undefined) row.age = lead.age;
  if (lead.state !== undefined) row.state = lead.state;
  if (lead.city !== undefined) row.city = lead.city;
  return row;
}

export function appointmentFromRow(row: any): Appointment {
  return {
    id: row.id,
    clientId: row.contact_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    title: row.title,
    description: row.description ?? '',
    startTime: row.start_time,
    endTime: row.end_time,
    type: row.type,
    status: row.status,
    location: row.location ?? undefined,
  };
}

export function appointmentToRow(a: Partial<Appointment>): Record<string, any> {
  const row: Record<string, any> = {};
  if (a.clientId !== undefined) row.contact_id = a.clientId;
  if (a.leadId !== undefined) row.lead_id = a.leadId;
  if (a.title !== undefined) row.title = a.title;
  if (a.description !== undefined) row.description = a.description;
  if (a.startTime !== undefined) row.start_time = a.startTime;
  if (a.endTime !== undefined) row.end_time = a.endTime;
  if (a.type !== undefined) row.type = a.type;
  if (a.status !== undefined) row.status = a.status;
  if (a.location !== undefined) row.location = a.location;
  return row;
}

export function taskFromRow(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    dueDate: row.due_date,
    priority: row.priority,
    completed: row.completed,
    relatedTo: row.related_to ?? undefined,
    relatedType: row.related_type ?? undefined,
    createdAt: row.created_at?.split?.('T')[0] ?? row.created_at,
  };
}

export function taskToRow(t: Partial<Task>): Record<string, any> {
  const row: Record<string, any> = {};
  if (t.title !== undefined) row.title = t.title;
  if (t.description !== undefined) row.description = t.description;
  if (t.dueDate !== undefined) row.due_date = t.dueDate;
  if (t.priority !== undefined) row.priority = t.priority;
  if (t.completed !== undefined) row.completed = t.completed;
  if (t.relatedTo !== undefined) row.related_to = t.relatedTo;
  if (t.relatedType !== undefined) row.related_type = t.relatedType;
  return row;
}

export function commissionFromRow(row: any): Commission {
  return {
    id: row.id,
    policyId: row.id,
    policyNumber: row.policy_number ?? '',
    clientName: row.client_name ?? '',
    carrier: row.carrier ?? '',
    type: row.policy_type,
    amount: Number(row.amount),
    status: row.status,
    paidDate: row.paid_date ?? undefined,
    month: row.month,
  };
}

export function commissionToRow(c: Partial<Commission>): Record<string, any> {
  const row: Record<string, any> = {};
  if (c.policyNumber !== undefined) row.policy_number = c.policyNumber;
  if (c.clientName !== undefined) row.client_name = c.clientName;
  if (c.carrier !== undefined) row.carrier = c.carrier;
  if (c.type !== undefined) row.policy_type = c.type;
  if (c.amount !== undefined) row.amount = c.amount;
  if (c.status !== undefined) row.status = c.status;
  if (c.paidDate !== undefined) row.paid_date = c.paidDate;
  if (c.month !== undefined) row.month = c.month;
  return row;
}
