import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fmtUSD } from "@/lib/format";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Wallet, ArrowDownCircle, ArrowUpCircle, Trash2 } from "lucide-react";

interface Entry {
  id: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  occurred_on: string;
  note: string | null;
}

const schema = z.object({
  kind: z.enum(["income", "expense"]),
  category: z.string().trim().min(1).max(60),
  amount: z.number().positive().max(1_000_000_000),
});

const EMERGENCY_GOAL = 10000;

const Budget = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("budget_plans").select("*").eq("user_id", user.id).order("occurred_on", { ascending: false });
    if (data) setEntries(data as unknown as Entry[]);
  };

  useEffect(() => { load(); }, [user]);

  const totals = entries.reduce(
    (acc, e) => {
      if (e.kind === "income") acc.income += Number(e.amount);
      else acc.expense += Number(e.amount);
      return acc;
    },
    { income: 0, expense: 0 }
  );
  const net = totals.income - totals.expense;
  const emergencyProgress = Math.max(0, Math.min(100, (net / EMERGENCY_GOAL) * 100));

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({ kind, category, amount: Number(amount) });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("budget_plans").insert({
      user_id: user.id, kind, category, amount: Number(amount),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategory(""); setAmount("");
    toast.success("Entry added");
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("budget_plans").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <p className="text-xs font-mono text-primary uppercase tracking-wider">Level 1</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Personal Budgeter</h1>
        <p className="text-muted-foreground mt-1">Track every dollar in and out. Build your safety net before you build your portfolio.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5 bg-card/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Income</p>
            <ArrowUpCircle className="h-4 w-4 text-gain" />
          </div>
          <p className="font-mono text-2xl font-semibold text-gain">{fmtUSD(totals.income)}</p>
        </Card>
        <Card className="p-5 bg-card/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Expenses</p>
            <ArrowDownCircle className="h-4 w-4 text-loss" />
          </div>
          <p className="font-mono text-2xl font-semibold text-loss">{fmtUSD(totals.expense)}</p>
        </Card>
        <Card className="p-5 bg-card/60">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Net</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className={`font-mono text-2xl font-semibold ${net >= 0 ? "text-gain" : "text-loss"}`}>{fmtUSD(net)}</p>
        </Card>
      </div>

      <Card className="p-5 bg-card/60">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Emergency Fund</p>
            <p className="text-sm text-muted-foreground">Goal: {fmtUSD(EMERGENCY_GOAL)} · A 3–6 month expense buffer is the foundation of every plan.</p>
          </div>
          <p className="font-mono text-lg font-semibold">{fmtUSD(Math.max(0, net))}</p>
        </div>
        <Progress value={emergencyProgress} className="h-2" />
      </Card>

      <div className="grid gap-6 md:grid-cols-[360px,1fr]">
        <Card className="p-5 bg-card/60 h-fit">
          <h2 className="font-semibold mb-4">Add entry</h2>
          <form onSubmit={addEntry} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Salary, Rent, Groceries…" maxLength={60} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (USD)</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <Plus className="h-4 w-4 mr-1" /> Add entry
            </Button>
          </form>
        </Card>

        <Card className="p-5 bg-card/60">
          <h2 className="font-semibold mb-4">Recent entries</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No entries yet. Add your first to start tracking.</p>
          ) : (
            <div className="divide-y divide-border">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    {e.kind === "income"
                      ? <ArrowUpCircle className="h-4 w-4 text-gain" />
                      : <ArrowDownCircle className="h-4 w-4 text-loss" />}
                    <div>
                      <p className="font-medium">{e.category}</p>
                      <p className="text-xs text-muted-foreground font-mono">{e.occurred_on}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-semibold ${e.kind === "income" ? "text-gain" : "text-loss"}`}>
                      {e.kind === "income" ? "+" : "−"}{fmtUSD(Number(e.amount))}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(e.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Budget;
