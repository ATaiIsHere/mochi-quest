import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Clock, Coins, Plus } from 'lucide-react';
import { api, type Task } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useReplanSSE } from '@/hooks/useSSE';

export function TasksPage() {
  const [dailyTasks, setDailyTasks] = useState<Task[]>([]);
  const [optionalTasks, setOptionalTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [skipReason, setSkipReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [daily, optional] = await Promise.all([api.tasks.today(), api.tasks.optional()]);
    setDailyTasks(daily);
    setOptionalTasks(optional);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useReplanSSE(load);

  const complete = async (id: string) => {
    await api.tasks.complete(id);
    await load();
  };

  const skip = async (id: string) => {
    const reason = skipReason[id] ?? '';
    await api.tasks.skip(id, reason);
    await load();
  };

  const dailyPending = dailyTasks.filter(t => t.status === 'pending');
  const dailyDone = dailyTasks.filter(t => t.status !== 'pending');

  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">任務</h1>

      {loading ? (
        <p className="text-muted-foreground">載入中...</p>
      ) : (
        <Tabs defaultValue="daily">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">
              每日任務
              {dailyPending.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs">
                  {dailyPending.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="optional">
              可選任務
              {optionalTasks.filter(t => t.status === 'pending').length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {optionalTasks.filter(t => t.status === 'pending').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            {dailyTasks.length === 0 ? (
              <EmptyState message="今日任務尚未產生，開始對話以生成任務" />
            ) : (
              <div className="space-y-3">
                {dailyPending.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    skipReason={skipReason[task.id] ?? ''}
                    onSkipReasonChange={r => setSkipReason(prev => ({ ...prev, [task.id]: r }))}
                    onComplete={() => complete(task.id)}
                    onSkip={() => skip(task.id)}
                  />
                ))}

                {dailyDone.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <p className="text-xs text-muted-foreground mb-2">已完成 / 已跳過</p>
                    {dailyDone.map(task => (
                      <TaskCard key={task.id} task={task} disabled />
                    ))}
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="optional">
            {optionalTasks.length === 0 ? (
              <EmptyState message="目前沒有可選任務，完成每日任務後 AI 會補充" />
            ) : (
              <div className="space-y-3">
                {optionalTasks.filter(t => t.status === 'pending').map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    skipReason={skipReason[task.id] ?? ''}
                    onSkipReasonChange={r => setSkipReason(prev => ({ ...prev, [task.id]: r }))}
                    onComplete={() => complete(task.id)}
                    onSkip={() => skip(task.id)}
                  />
                ))}
                {optionalTasks.filter(t => t.status !== 'pending').map(task => (
                  <TaskCard key={task.id} task={task} disabled />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function TaskCard({
  task,
  disabled = false,
  skipReason = '',
  onSkipReasonChange,
  onComplete,
  onSkip,
}: {
  task: Task;
  disabled?: boolean;
  skipReason?: string;
  onSkipReasonChange?: (r: string) => void;
  onComplete?: () => void;
  onSkip?: () => void;
}) {
  const [showSkip, setShowSkip] = useState(false);

  const statusIcon = {
    completed: <CheckCircle2 size={16} className="text-emerald-500" />,
    skipped: <XCircle size={16} className="text-muted-foreground" />,
    pending: null,
    in_progress: null,
  }[task.status];
  const instructions = task.instructions?.trim();
  const descriptionAlreadyIncludesInstructions = Boolean(
    instructions && task.description?.includes(instructions),
  );

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{statusIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium leading-tight ${task.status !== 'pending' ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <DifficultyBadge difficulty={task.difficulty} />
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Coins size={10} className="text-yellow-500" />
                  {task.coin_reward}
                </Badge>
              </div>
            </div>

            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{task.description}</p>
            )}

            {instructions && !descriptionAlreadyIncludesInstructions && (
              <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
                <p className="mb-1 font-medium text-foreground">執行內容</p>
                <p className="whitespace-pre-line text-muted-foreground">{instructions}</p>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              {task.estimated_duration && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={10} /> {task.estimated_duration}
                </span>
              )}
              {task.completion_criteria && (
                <span className="text-xs text-muted-foreground truncate">· {task.completion_criteria}</span>
              )}
            </div>

            {!disabled && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={onComplete}>
                  <CheckCircle2 size={13} />
                  完成
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSkip(s => !s)}>
                  跳過
                </Button>
              </div>
            )}

            {showSkip && !disabled && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="跳過原因（選填）"
                  value={skipReason}
                  onChange={e => onSkipReasonChange?.(e.target.value)}
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                />
                <Button size="sm" variant="destructive" onClick={() => { onSkip?.(); setShowSkip(false); }}>
                  確認跳過
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: number }) {
  const color =
    difficulty <= 3 ? 'text-emerald-600' :
    difficulty <= 6 ? 'text-amber-600' :
    'text-red-600';
  return <span className={`text-xs font-mono ${color}`}>D{difficulty}</span>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}
