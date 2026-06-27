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
            <CardTitle className="text-sm">排程與通知</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="每日排程時間" hint="系統自動 check（更新連勝、分配任務、重新規劃判斷），預設凌晨 4 點">
              <input
                type="time"
                value={form.daily_check_time ?? '04:00'}
                onChange={e => setForm(f => ({ ...f, daily_check_time: e.target.value }))}
                className="rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
            <SettingRow label="Discord Webhook URL" hint="留空則不發送通知，Agent 可透過 mq_send_notification 發送">
              <input
                type="url"
                value={form.discord_webhook_url ?? ''}
                placeholder="https://discord.com/api/webhooks/..."
                onChange={e => setForm(f => ({ ...f, discord_webhook_url: e.target.value }))}
                className="w-64 rounded-md border bg-background px-2 py-1 text-sm"
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
            <CardTitle className="text-sm">Agent Webhook</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingRow label="Webhook URL" hint="Agent 接收事件推送的端點，留空則停用。透過 mq_register_webhook 也可設定">
              <input
                type="url"
                value={form.agent_webhook_url ?? ''}
                placeholder="http://localhost:8080/webhook"
                onChange={e => setForm(f => ({ ...f, agent_webhook_url: e.target.value }))}
                className="w-64 rounded-md border bg-background px-2 py-1 text-sm"
              />
            </SettingRow>
            <SettingRow label="訂閱的 Events" hint="逗號分隔，留空則推送所有訂閱事件（預設：task_completed,cycle_ended,daily_check_ran,assessment_recorded）">
              <input
                type="text"
                value={form.agent_webhook_events ?? ''}
                placeholder="task_completed,cycle_ended,daily_check_ran,assessment_recorded"
                onChange={e => setForm(f => ({ ...f, agent_webhook_events: e.target.value }))}
                className="w-64 rounded-md border bg-background px-2 py-1 text-sm"
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
