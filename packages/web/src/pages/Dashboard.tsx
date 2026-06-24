import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Coins, CheckCircle2, Circle, RefreshCw, ChevronRight } from 'lucide-react';
import { api, type Dashboard } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useReplanSSE } from '@/hooks/useSSE';

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard.get());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useReplanSSE(load);

  if (loading) return <PageShell><p className="text-muted-foreground">載入中...</p></PageShell>;
  if (!data) return <PageShell><p className="text-destructive">載入失敗</p></PageShell>;

  const { today_progress, wallet, global_streak, goals, pending_replans } = data;
  const progressPct = today_progress.total > 0
    ? Math.round((today_progress.completed / today_progress.total) * 100)
    : 0;

  return (
    <PageShell>
      {/* Replan banner */}
      {pending_replans > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <RefreshCw size={16} className="animate-spin" />
          AI 正在調整 {pending_replans} 個計劃，稍後會自動更新...
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard
          icon={<CheckCircle2 size={20} className="text-emerald-500" />}
          label="今日進度"
          value={`${today_progress.completed}/${today_progress.total}`}
          sub={`${progressPct}%`}
        />
        <StatCard
          icon={<Flame size={20} className="text-orange-500" />}
          label="全域連勝"
          value={String(global_streak)}
          sub="天"
        />
        <StatCard
          icon={<span className="text-yellow-500 text-lg">🪙</span>}
          label="可用金幣"
          value={String(wallet.available_coins)}
          sub="coins"
        />
      </div>

      {/* Today progress bar */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="font-medium">今日任務完成率</span>
            <span className="text-muted-foreground">{progressPct}%</span>
          </div>
          <Progress value={progressPct} />
        </CardContent>
      </Card>

      {/* Goal summaries */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">進行中的目標</h2>
          <Link to="/goals">
            <Button variant="ghost" size="sm" className="gap-1">
              全部目標 <ChevronRight size={14} />
            </Button>
          </Link>
        </div>

        {goals.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              尚無進行中的目標。前往<Link to="/goals" className="text-primary underline mx-1">目標頁面</Link>建立第一個目標。
            </CardContent>
          </Card>
        )}

        {goals.map(goal => {
          const tasks = goal.today_tasks ?? [];
          const completed = goal.today_completed ?? 0;
          const pct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

          return (
            <Link key={goal.id} to={`/goals/${goal.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-sm leading-tight">{goal.title}</p>
                      {goal.active_plan_phase && (
                        <p className="text-xs text-muted-foreground mt-0.5">{goal.active_plan_phase}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {goal.replan_pending && (
                        <Badge variant="warning" className="gap-1">
                          <RefreshCw size={10} className="animate-spin" /> 調整中
                        </Badge>
                      )}
                      {goal.current_streak! > 0 && (
                        <Badge variant="secondary">
                          <Flame size={10} className="mr-1 text-orange-500" />
                          {goal.current_streak}天
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    {tasks.slice(0, 3).map(t => (
                      <span key={t.id} className="flex items-center gap-1">
                        {t.status === 'completed'
                          ? <CheckCircle2 size={12} className="text-emerald-500" />
                          : <Circle size={12} />}
                        {t.title}
                      </span>
                    ))}
                    {tasks.length > 3 && <span>+{tasks.length - 3}</span>}
                  </div>

                  <Progress value={pct} className="h-1.5" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col items-center text-center gap-1">
        {icon}
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">總覽</h1>
      {children}
    </div>
  );
}
