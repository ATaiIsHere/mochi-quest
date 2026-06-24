import { useEffect, useState, useCallback } from 'react';
import { Coins, Gift, TrendingUp, TrendingDown } from 'lucide-react';
import { api, type WalletData, type Reward } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDate } from '@/lib/utils';

export function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [w, r] = await Promise.all([api.wallet.get(), api.wallet.rewards()]);
    setWallet(w);
    setRewards(r);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const redeem = async (id: string) => {
    await api.wallet.redeem(id);
    await load();
  };

  const activeRewards = rewards.filter(r => r.status === 'active');
  const redeemedRewards = rewards.filter(r => r.status === 'redeemed');

  return (
    <div className="p-6 max-w-2xl mx-auto pb-24 md:pb-6">
      <h1 className="text-2xl font-bold mb-6">錢包</h1>

      {loading ? (
        <p className="text-muted-foreground">載入中...</p>
      ) : !wallet ? (
        <p className="text-destructive">載入失敗</p>
      ) : (
        <div className="space-y-4">
          {/* Balance card */}
          <Card className="bg-gradient-to-br from-amber-50 to-yellow-100 dark:from-amber-950 dark:to-yellow-900 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-6 pb-6 flex items-center gap-6">
              <div className="text-4xl">🪙</div>
              <div>
                <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{wallet.available_coins}</p>
                <p className="text-sm text-amber-600 dark:text-amber-400">可用金幣</p>
                <p className="text-xs text-amber-500 mt-0.5">累計獲得：{wallet.total_coins} coins</p>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="rewards">
            <TabsList>
              <TabsTrigger value="rewards">
                可兌換獎勵 {activeRewards.length > 0 && `(${activeRewards.length})`}
              </TabsTrigger>
              <TabsTrigger value="transactions">交易記錄</TabsTrigger>
              <TabsTrigger value="redeemed">已兌換</TabsTrigger>
            </TabsList>

            <TabsContent value="rewards" className="mt-4 space-y-3">
              {activeRewards.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <Gift size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">尚無獎勵。透過 AI 對話新增獎勵。</p>
                  </CardContent>
                </Card>
              ) : (
                activeRewards.map(reward => (
                  <RewardCard key={reward.id} reward={reward} availableCoins={wallet.available_coins} onRedeem={redeem} />
                ))
              )}
            </TabsContent>

            <TabsContent value="transactions" className="mt-4">
              {wallet.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">尚無交易記錄</p>
              ) : (
                <div className="space-y-1">
                  {wallet.transactions.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      {tx.type === 'earn'
                        ? <TrendingUp size={14} className="text-emerald-500 shrink-0" />
                        : <TrendingDown size={14} className="text-red-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{tx.description ?? tx.source}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                      </div>
                      <span className={`text-sm font-mono font-medium shrink-0 ${tx.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="redeemed" className="mt-4 space-y-2">
              {redeemedRewards.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">尚未兌換任何獎勵</p>
              ) : (
                redeemedRewards.map(reward => (
                  <RewardCard key={reward.id} reward={reward} availableCoins={wallet.available_coins} onRedeem={redeem} disabled />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function RewardCard({
  reward,
  availableCoins,
  onRedeem,
  disabled = false,
}: {
  reward: Reward;
  availableCoins: number;
  onRedeem: (id: string) => void;
  disabled?: boolean;
}) {
  const canAfford = availableCoins >= reward.coin_cost;

  const categoryEmoji: Record<string, string> = {
    food: '🍔',
    leisure: '🎮',
    purchase: '🛍️',
    experience: '✈️',
    custom: '🎁',
  };

  return (
    <Card className={disabled ? 'opacity-60' : ''}>
      <CardContent className="pt-4 pb-4 flex items-center gap-3">
        <span className="text-2xl">{categoryEmoji[reward.category] ?? '🎁'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{reward.title}</p>
          {reward.description && (
            <p className="text-xs text-muted-foreground truncate">{reward.description}</p>
          )}
          <Badge variant="secondary" className="mt-1 text-xs gap-1">
            🪙 {reward.coin_cost} coins
          </Badge>
        </div>
        {!disabled && reward.status === 'active' && (
          <Button
            size="sm"
            disabled={!canAfford}
            onClick={() => onRedeem(reward.id)}
            title={!canAfford ? `還差 ${reward.coin_cost - availableCoins} coins` : ''}
          >
            兌換
          </Button>
        )}
        {disabled && (
          <Badge variant="success">已兌換</Badge>
        )}
      </CardContent>
    </Card>
  );
}
