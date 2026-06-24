import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, RefreshCw, CheckCircle2, Circle, Flame, Trophy } from 'lucide-react';
import { api, type ProgressReport, type Milestone } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useReplanSSE } from '@/hooks/useSSE';
import { formatDate, formatRelativeDate } from '@/lib/utils';

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setReport(await api.goals.progress(id));
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useReplanSSE(load);

  if (loading) return <Shell><p className="text-muted-foreground">載入中...</p></Shell>;
  if (!report) return <Shell><p className="text-destructive">找不到目標</p></Shell>;

  const { goal, active_plan, current_state, recent_assessments, streak, recent_tasks } = report;

  return (
    <Shell>
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <Link to="/goals">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ChevronLeft size={16} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold leading-tight">{goal.title}</h1>
          {goal.category && <Badge variant="outline" className="mt-1 text-xs">{goal.category}</Badge>}
        </div>
        {active_plan?.replan_pending && (
          <Badge variant="warning" className="gap-1 shrink-0">
            <RefreshCw size={10} className="animate-spin" /> 計劃調整中
          </Badge>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">概覽</TabsTrigger>
          <TabsTrigger value="plan">計劃</TabsTrigger>
          <TabsTrigger value="history">歷史</TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Current state */}
          {current_state && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">目前程度</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">{current_state.current_level_description}</p>
                {current_state.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">強項</p>
                    <div className="flex flex-wrap gap-1">
                      {current_state.strengths.map((s, i) => <Badge key={i} variant="success" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                )}
                {current_state.weaknesses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">待加強</p>
                    <div className="flex flex-wrap gap-1">
                      {current_state.weaknesses.map((w, i) => <Badge key={i} variant="destructive" className="text-xs">{w}</Badge>)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Streak */}
          {streak && (
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Flame size={20} className="text-orange-500" />
                  <div>
                    <p className="text-xl font-bold">{streak.current_streak}</p>
                    <p className="text-xs text-muted-foreground">連勝天數</p>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div>
                  <p className="text-sm font-medium">{streak.longest_streak}</p>
                  <p className="text-xs text-muted-foreground">歷史最長</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goal details */}
          {goal.success_criteria && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">成功標準</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {goal.success_criteria}
              </CardContent>
            </Card>
          )}

          {/* Recent assessments */}
          {recent_assessments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">最近評估</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recent_assessments.map(a => (
                  <div key={a.id} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{a.assessment_type}</span>
                      <span className="text-muted-foreground">{formatDate(a.created_at)}</span>
                    </div>
                    <pre className="text-muted-foreground mt-0.5 whitespace-pre-wrap font-sans">
                      {JSON.stringify(a.result, null, 2)}
                    </pre>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Plan tab */}
        <TabsContent value="plan">
          {!active_plan ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                尚無計劃。透過 AI 對話生成計劃。
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{active_plan.current_phase}</Badge>
                <span className="text-xs text-muted-foreground">版本 {active_plan.version}</span>
              </div>

              {/* Milestones */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy size={14} /> 里程碑
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MilestoneTimeline milestones={active_plan.milestones} />
                </CardContent>
              </Card>

              {/* Task pool preview */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">任務池（{active_plan.task_template_pool.length} 個）</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {active_plan.task_template_pool.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Badge variant={t.task_type === 'daily' ? 'default' : 'outline'} className="text-xs shrink-0">
                          {t.task_type === 'daily' ? '每日' : '可選'}
                        </Badge>
                        <span className="truncate">{t.title}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">D{t.difficulty} · {t.coin_reward}🪙</span>
                      </div>
                    ))}
                    {active_plan.task_template_pool.length > 5 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        +{active_plan.task_template_pool.length - 5} 個任務...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history">
          {recent_tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">尚無任務記錄</p>
          ) : (
            <div className="space-y-2">
              {recent_tasks.map(task => (
                <div key={task.id} className="flex items-center gap-2 text-sm py-2 border-b last:border-0">
                  {task.status === 'completed'
                    ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    : <Circle size={14} className="text-muted-foreground shrink-0" />}
                  <span className={task.status !== 'pending' ? 'line-through text-muted-foreground' : ''}>
                    {task.title}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {task.completed_at ? formatRelativeDate(task.completed_at) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (!milestones || milestones.length === 0) {
    return <p className="text-xs text-muted-foreground">無里程碑資料</p>;
  }

  return (
    <div className="relative pl-4">
      {milestones.map((m, i) => (
        <div key={i} className="relative mb-4 last:mb-0">
          {/* Timeline line */}
          {i < milestones.length - 1 && (
            <div className="absolute left-[-12px] top-4 bottom-[-16px] w-0.5 bg-border" />
          )}
          {/* Dot */}
          <div className={`absolute left-[-16px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
            m.is_completed ? 'bg-emerald-500 border-emerald-500' : 'bg-background border-border'
          }`} />

          <div>
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium ${m.is_completed ? 'text-muted-foreground line-through' : ''}`}>
                {m.title}
              </p>
              <span className="text-xs text-muted-foreground shrink-0">{formatRelativeDate(m.target_date)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{m.success_criteria}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      {children}
    </div>
  );
}
