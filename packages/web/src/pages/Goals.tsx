import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Target, Flame, RefreshCw, Pause, Play, ChevronRight } from 'lucide-react';
import { api, type Goal } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setGoals(await api.goals.list());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pause = async (id: string) => { await api.goals.pause(id); await load(); };
  const resume = async (id: string) => { await api.goals.resume(id); await load(); };
  const complete = async (id: string) => { await api.goals.complete(id); await load(); };

  const active = goals.filter(g => g.status === 'active');
  const paused = goals.filter(g => g.status === 'paused');
  const completed = goals.filter(g => g.status === 'completed');

  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">目標</h1>
        <p className="text-xs text-muted-foreground">透過 AI 對話新增目標</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">載入中...</p>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">尚無目標</p>
            <p className="text-xs text-muted-foreground mt-1">與 AI 對話，說出你的目標，AI 會引導你建立計劃</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList className="mb-4">
            <TabsTrigger value="active">進行中 {active.length > 0 && `(${active.length})`}</TabsTrigger>
            <TabsTrigger value="paused">暫停 {paused.length > 0 && `(${paused.length})`}</TabsTrigger>
            <TabsTrigger value="completed">已完成 {completed.length > 0 && `(${completed.length})`}</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <GoalList goals={active} onPause={pause} onResume={resume} onComplete={complete} />
          </TabsContent>
          <TabsContent value="paused">
            <GoalList goals={paused} onPause={pause} onResume={resume} onComplete={complete} />
          </TabsContent>
          <TabsContent value="completed">
            <GoalList goals={completed} onPause={pause} onResume={resume} onComplete={complete} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function GoalList({
  goals,
  onPause,
  onResume,
  onComplete,
}: {
  goals: Goal[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  if (goals.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">沒有符合的目標</p>;
  }

  return (
    <div className="space-y-3">
      {goals.map(goal => (
        <GoalCard key={goal.id} goal={goal} onPause={onPause} onResume={onResume} onComplete={onComplete} />
      ))}
    </div>
  );
}

function GoalCard({
  goal,
  onPause,
  onResume,
  onComplete,
}: {
  goal: Goal;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const deadline = goal.deadline
    ? new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(goal.deadline))
    : null;

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <Link to={`/goals/${goal.id}`} className="font-medium text-sm hover:underline leading-tight">
              {goal.title}
            </Link>
            {goal.category && (
              <Badge variant="outline" className="ml-2 text-xs">{goal.category}</Badge>
            )}
            {deadline && (
              <p className="text-xs text-muted-foreground mt-0.5">截止：{deadline}</p>
            )}
          </div>
          <Link to={`/goals/${goal.id}`}>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronRight size={14} />
            </Button>
          </Link>
        </div>

        {goal.success_criteria && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{goal.success_criteria}</p>
        )}

        <div className="flex items-center gap-2">
          {goal.status === 'active' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onPause(goal.id)} className="gap-1 text-xs">
                <Pause size={11} /> 暫停
              </Button>
              <Button size="sm" variant="outline" onClick={() => onComplete(goal.id)} className="gap-1 text-xs">
                完成目標
              </Button>
            </>
          )}
          {goal.status === 'paused' && (
            <Button size="sm" variant="outline" onClick={() => onResume(goal.id)} className="gap-1 text-xs">
              <Play size={11} /> 恢復
            </Button>
          )}
          <Badge
            variant={goal.status === 'active' ? 'success' : goal.status === 'paused' ? 'warning' : 'secondary'}
            className="ml-auto text-xs"
          >
            {goal.status === 'active' ? '進行中' : goal.status === 'paused' ? '已暫停' : '已完成'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
