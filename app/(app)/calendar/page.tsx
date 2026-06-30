'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { mockAppointments } from '@/lib/mock-data';
import type { Appointment } from '@/lib/types';

type View = 'month' | 'week' | 'day';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const typeIcon: Record<string, string> = {
  phone: '📞',
  video: '🎥',
  in_person: '🤝',
};

const typeColor: Record<string, string> = {
  phone: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  video: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  in_person: 'bg-green-500/20 text-green-300 border-green-500/30',
};

export default function CalendarPage() {
  const today = new Date('2026-06-29');
  const [view, setView] = useState<View>('month');
  const [currentDate, setCurrentDate] = useState(today);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [newAppt, setNewAppt] = useState<Partial<Appointment>>({
    type: 'phone', status: 'scheduled', title: '', description: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getApptsForDay(dayStr: string) {
    return appointments.filter((a) => a.startTime.startsWith(dayStr));
  }

  function formatDayStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function openNewAppt(dayStr: string) {
    setSelectedDate(dayStr);
    setNewAppt({ type: 'phone', status: 'scheduled', title: '', description: '', startTime: `${dayStr}T09:00:00`, endTime: `${dayStr}T10:00:00` });
    setModalOpen(true);
  }

  function saveAppt() {
    if (!newAppt.title) return;
    const appt: Appointment = {
      id: `a${Date.now()}`,
      title: newAppt.title!,
      description: newAppt.description ?? '',
      startTime: newAppt.startTime ?? `${selectedDate}T09:00:00`,
      endTime: newAppt.endTime ?? `${selectedDate}T10:00:00`,
      type: newAppt.type as 'phone' | 'video' | 'in_person' ?? 'phone',
      status: 'scheduled',
    };
    setAppointments((prev) => [...prev, appt]);
    setModalOpen(false);
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayAppts = getApptsForDay(todayStr);

  return (
    <div className="space-y-5 max-w-[1600px]">
      {/* Header controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h2 className="text-xl font-bold text-slate-100 min-w-[200px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={nextMonth} className="w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/8 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button
            onClick={() => setCurrentDate(today)}
            className="h-8 px-3 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/8 transition-colors"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(['month', 'week', 'day'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-2 text-xs font-medium transition-colors capitalize ${view === v ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button onClick={() => openNewAppt(todayStr)} icon={<PlusIcon />}>New Appointment</Button>
        </div>
      </div>

      {/* Today's agenda strip */}
      {todayAppts.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Today's Schedule</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {todayAppts.map((a) => (
              <div key={a.id} className={`shrink-0 rounded-xl border px-4 py-3 min-w-[200px] ${typeColor[a.type]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{typeIcon[a.type]}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{a.type.replace('_', ' ')}</span>
                </div>
                <p className="font-medium text-sm">{a.title}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(a.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' – '}
                  {new Date(a.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month Calendar */}
      {view === 'month' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-white/8">
            {DAYS.map((d) => (
              <div key={d} className="text-center py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-white/4 bg-white/1" />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayStr = formatDayStr(day);
              const dayAppts = getApptsForDay(dayStr);
              const isToday = dayStr === todayStr;
              const isWeekend = ((firstDay + i) % 7 === 0) || ((firstDay + i) % 7 === 6);
              return (
                <div
                  key={day}
                  onClick={() => openNewAppt(dayStr)}
                  className={`
                    min-h-[100px] border-b border-r border-white/4 p-2 cursor-pointer transition-colors
                    ${isToday ? 'bg-blue-500/8' : isWeekend ? 'bg-white/1' : ''}
                    hover:bg-white/5
                  `}
                >
                  <span className={`
                    inline-flex w-7 h-7 items-center justify-center rounded-full text-sm font-medium mb-1
                    ${isToday ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-slate-200'}
                  `}>
                    {day}
                  </span>
                  <div className="space-y-1">
                    {dayAppts.slice(0, 2).map((a) => (
                      <div
                        key={a.id}
                        className={`text-xs px-1.5 py-0.5 rounded border truncate ${typeColor[a.type]}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {typeIcon[a.type]} {new Date(a.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} {a.title}
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <div className="text-xs text-slate-600 pl-1">+{dayAppts.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day view */}
      {view === 'day' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/8">
            <p className="text-slate-300 font-medium">
              {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="p-4 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => {
              const hour = i + 8;
              const hourStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}`;
              const hourAppts = appointments.filter((a) => a.startTime.startsWith(hourStr));
              return (
                <div key={hour} className="flex gap-4 min-h-[56px]">
                  <div className="w-16 text-xs text-slate-600 text-right pt-1 shrink-0">
                    {hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                  </div>
                  <div className="flex-1 border-t border-white/5 pt-1 space-y-1">
                    {hourAppts.map((a) => (
                      <div key={a.id} className={`rounded-lg border px-3 py-2 ${typeColor[a.type]}`}>
                        <p className="text-sm font-medium">{typeIcon[a.type]} {a.title}</p>
                        <p className="text-xs opacity-70">{a.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
        <span className="font-medium text-slate-400">Legend:</span>
        {Object.entries(typeColor).map(([type, cls]) => (
          <span key={type} className={`px-2 py-1 rounded-full border ${cls}`}>
            {typeIcon[type]} {type.replace('_', ' ')}
          </span>
        ))}
      </div>

      {/* New Appointment Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Schedule Appointment"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={saveAppt}>Schedule</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={newAppt.title ?? ''}
            onChange={(e) => setNewAppt((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. John Doe - FE Consultation"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Time"
              type="datetime-local"
              value={newAppt.startTime?.slice(0, 16) ?? ''}
              onChange={(e) => setNewAppt((p) => ({ ...p, startTime: e.target.value + ':00' }))}
            />
            <Input
              label="End Time"
              type="datetime-local"
              value={newAppt.endTime?.slice(0, 16) ?? ''}
              onChange={(e) => setNewAppt((p) => ({ ...p, endTime: e.target.value + ':00' }))}
            />
          </div>
          <Select
            label="Type"
            value={newAppt.type ?? 'phone'}
            onChange={(e) => setNewAppt((p) => ({ ...p, type: e.target.value as 'phone' | 'video' | 'in_person' }))}
          >
            <option value="phone">📞 Phone Call</option>
            <option value="video">🎥 Video Call</option>
            <option value="in_person">🤝 In Person</option>
          </Select>
          <Textarea
            label="Notes"
            value={newAppt.description ?? ''}
            onChange={(e) => setNewAppt((p) => ({ ...p, description: e.target.value }))}
            rows={3}
            placeholder="Appointment details..."
          />
        </div>
      </Modal>
    </div>
  );
}

function PlusIcon() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
