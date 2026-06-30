'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import type { Task, TaskPriority } from '@/lib/types';

const priorityConfig: Record<TaskPriority, { label: string; color: string; variant: 'danger' | 'warning' | 'info' | 'default'; dot: string }> = {
  urgent: { label: 'Urgent', color: 'text-red-400',   variant: 'danger',  dot: 'bg-red-500' },
  high:   { label: 'High',   color: 'text-amber-400', variant: 'warning', dot: 'bg-amber-500' },
  medium: { label: 'Medium', color: 'text-cyan-400',  variant: 'info',    dot: 'bg-cyan-500' },
  low:    { label: 'Low',    color: 'text-slate-400', variant: 'default', dot: 'bg-slate-600' },
};

const priorityOrder: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [newTask, setNewTask] = useState<Partial<Task>>({ priority: 'medium', title: '', description: '', dueDate: '' });

  useEffect(() => {
    fetch('/api/tasks').then((r) => r.json()).then((d) => setTasks(d.tasks ?? []));
  }, []);

  const filtered = tasks.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || (filter === 'open' ? !t.completed : t.completed);
    const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
    return matchSearch && matchFilter && matchPriority;
  });

  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  async function toggleTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t));
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  }

  async function saveTask() {
    if (!newTask.title) return;
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTask.title,
        description: newTask.description ?? '',
        dueDate: newTask.dueDate ?? '',
        priority: (newTask.priority as TaskPriority) ?? 'medium',
        completed: false,
      }),
    });
    const { task } = await res.json();
    setTasks((prev) => [task, ...prev]);
    setModalOpen(false);
    setNewTask({ priority: 'medium', title: '', description: '', dueDate: '' });
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks', value: tasks.length, color: 'text-slate-300' },
          { label: 'Open', value: openTasks.length, color: 'text-blue-400' },
          { label: 'Completed', value: doneTasks.length, color: 'text-green-400' },
          { label: 'Urgent', value: tasks.filter((t) => t.priority === 'urgent' && !t.completed).length, color: 'text-red-400' },
        ].map((s) => (
          <div key={s.label} className="glass-card rounded-2xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56 rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(['all', 'open', 'done'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as TaskPriority | 'all')}
            className="h-9 rounded-lg border border-white/10 px-3 text-sm text-slate-300 focus:outline-none"
            style={{ backgroundColor: '#141929' }}
          >
            <option value="all">All Priorities</option>
            {priorityOrder.map((p) => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
          </select>
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<PlusIcon />}>New Task</Button>
      </div>

      {/* Task list by priority */}
      {filter !== 'done' && (
        <div className="space-y-2">
          {filtered.filter((t) => !t.completed).length === 0 && (
            <div className="glass-card rounded-2xl p-12 text-center text-slate-600">
              <p className="text-3xl mb-2">✅</p>
              <p>No open tasks</p>
            </div>
          )}
          {priorityOrder.map((priority) => {
            const pTasks = filtered.filter((t) => !t.completed && (filterPriority === 'all' ? t.priority === priority : true) && t.priority === priority);
            if (pTasks.length === 0) return null;
            return (
              <div key={priority}>
                <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
                  <div className={`w-2 h-2 rounded-full ${priorityConfig[priority].dot}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${priorityConfig[priority].color}`}>
                    {priorityConfig[priority].label}
                  </span>
                  <span className="text-xs text-slate-600">{pTasks.length}</span>
                </div>
                {pTasks.map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed tasks */}
      {(filter === 'all' || filter === 'done') && (
        <div className="space-y-2">
          {filtered.filter((t) => t.completed).length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2 mt-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">Completed</span>
                <span className="text-xs text-slate-700">{filtered.filter((t) => t.completed).length}</span>
              </div>
              {filtered.filter((t) => t.completed).map((task) => (
                <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </>
          )}
        </div>
      )}

      {/* New Task Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create New Task"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveTask}>Create Task</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Task Title"
            value={newTask.title ?? ''}
            onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Follow up with Robert Johnson"
          />
          <Textarea
            label="Description"
            value={newTask.description ?? ''}
            onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
            rows={2}
            placeholder="Additional details..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Due Date"
              type="date"
              value={newTask.dueDate ?? ''}
              onChange={(e) => setNewTask((p) => ({ ...p, dueDate: e.target.value }))}
            />
            <Select
              label="Priority"
              value={newTask.priority ?? 'medium'}
              onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value as TaskPriority }))}
            >
              {priorityOrder.map((p) => <option key={p} value={p}>{priorityConfig[p].label}</option>)}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: (id: string) => void; onDelete: (id: string) => void }) {
  const pc = priorityConfig[task.priority];
  const isOverdue = !task.completed && task.dueDate && task.dueDate < '2026-06-29';
  return (
    <div className={`
      flex items-start gap-3 p-4 rounded-xl border transition-all duration-150
      ${task.completed
        ? 'bg-white/2 border-white/5 opacity-50'
        : 'glass-card hover:bg-white/8'
      }
    `}>
      <button
        onClick={() => onToggle(task.id)}
        className={`
          mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
          ${task.completed
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-white/20 hover:border-blue-400'
          }
        `}
      >
        {task.completed && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-medium ${task.completed ? 'line-through text-slate-600' : 'text-slate-200'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {task.dueDate && (
            <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
              {isOverdue ? '⚠️ ' : '📅 '}Due {task.dueDate}
            </span>
          )}
          <Badge variant={pc.variant} size="sm">{pc.label}</Badge>
        </div>
      </div>
      <button onClick={() => onDelete(task.id)} className="text-slate-700 hover:text-red-400 transition-colors p-1">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
