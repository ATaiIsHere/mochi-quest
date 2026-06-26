import { useEffect, useState, useCallback } from 'react';
import {
  Target, CheckCircle, XCircle, Calendar, FileText, RefreshCw, Activity, Bell,
} from 'lucide-react';
import { api, type ActivityLog } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  goal_created:        { icon: Target,      color: 'text-blue-500',   label: '新增目標' },
  goal_updated:        { icon: Target,      color: 'text-blue-400',   label: '更新目標' },
  goal_status_changed: { icon: Target,      color: 'text-purple-500', label: '目標狀態' },
  task_completed:      { icon: CheckCircle, color: 'text-green-500',  label: '完成任務' },
  task_skipped:        { icon: XCircle,     color: 'text-muted-foreground', label: '略過任務' },
  daily_allocated:     { icon: Calendar,    color: 'text-sky-500',    label: '每日分配' },
  plan_created:        { icon: FileText,    color: 'text-indigo-500', label: '建立計劃' },
  replan_triggered:    { icon: RefreshCw,   color: 'text-amber-500',  label: '重新規劃' },
  daily_check_run:     { icon: Bell,        color: 'text-sky-400',    label: '每日排程' },
  cycle_complete:      { icon: RefreshCw,   color: 'text-violet-500', label: '週期結束' },
};

function eventConfig(type: string) {
  return EVENT_CONFIG[type] ?? { icon: Activity, color: 'text-muted-foreground', label: type };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupByDate(logs: ActivityLog[]): { date: string; entries: ActivityLog[] }[] {
  const map = new Map<string, ActivityLog[]>();
  for (const log of logs) {
    const date = formatDate(log.timestamp);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(log);
  }
  return Array.from(map.entries()).map(([date, entries]) => ({ date, entries }));
}

export function LogsPage() {
  const [groups, setGroups] = useState<{ date: string; entries: ActivityLog[] }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api.logs.list(100);
    setGroups(groupByDate(data.logs));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">活動日誌</h1>

      {loading && <p className="text-muted-foreground">載入中...</p>}

      {!loading && groups.length === 0 && (
        <p className="text-muted-foreground text-sm">尚無日誌記錄。完成任務、調整計劃等操作後會在此顯示。</p>
      )}

      <div className="space-y-6">
        {groups.map(({ date, entries }) => (
          <div key={date}>
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{date}</p>
            <Card>
              <CardContent className="p-0 divide-y">
                {entries.map((log) => {
                  const { icon: Icon, color, label } = eventConfig(log.event_type);
                  return (
                    <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon size={16} className={cn('mt-0.5 shrink-0', color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{log.title}</p>
                        {log.reason && (
                          <p className="text-xs text-muted-foreground mt-0.5">原因：{log.reason}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-xs text-muted-foreground">{formatTime(log.timestamp)}</span>
                        <span className="text-xs text-muted-foreground/60">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
