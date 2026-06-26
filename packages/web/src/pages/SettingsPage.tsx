import { useEffect, useState, useCallback } from 'react';
import { api, type Settings } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const s = await api.settings.get();
    setSettings(s);
    setForm(s);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    await api.settings.update(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <Shell><p className="text-muted-foreground">載入中...</p></Shell>;

  return (
    <Shell>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">任務設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="每日任務上限" hint="所有目標合計的每日任務數（1-20）">
              <input
                type="number"
                min={1}
                max={20}
                value={form.daily_task_total_limit ?? 5}
                onChange={e => setForm(f => ({ ...f, daily_task_total_limit: Number(e.target.value) }))}
                className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">通知設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="每日通知時間" hint="HH:MM 格式（daemon 模式下生效）">
              <input
                type="time"
                value={form.notification_time ?? '08:00'}
                onChange={e => setForm(f => ({ ...f, notification_time: e.target.value }))}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
            <SettingRow label="時區">
              <input
                type="text"
                value={form.timezone ?? ''}
                placeholder="e.g. Asia/Taipei"
                onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                className="w-40 rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">日誌設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="日誌保留天數" hint="自動刪除超過 N 天的日誌（1-30）">
              <input
                type="number"
                min={1}
                max={30}
                value={form.log_retention_days ?? 3}
                onChange={e => setForm(f => ({ ...f, log_retention_days: Number(e.target.value) }))}
                className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">系統資訊</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>MCP Server 連接埠：stdio</p>
            <p>REST API：http://localhost:3030</p>
            <p>資料庫：~/.mochi-quest/data.db</p>
            <p className="pt-2">daemon 啟動：<code className="font-mono bg-muted px-1 rounded">mochi-quest start --daemon</code></p>
          </CardContent>
        </Card>

        <Button onClick={save} className="w-full">
          {saved ? '已儲存！' : '儲存設定'}
        </Button>
      </div>
    </Shell>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">設定</h1>
      {children}
    </div>
  );
}
