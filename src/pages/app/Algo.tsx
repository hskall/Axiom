import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Cpu, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Algo {
  id: string;
  name: string;
  rules: { symbol: string; indicator: string; op: string; value: number; action: string; quantity: number };
  is_active: boolean;
}

const Algo = () => {
  const { user } = useAuth();
  const [algos, setAlgos] = useState<Algo[]>([]);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [indicator, setIndicator] = useState("RSI");
  const [op, setOp] = useState("<");
  const [value, setValue] = useState("30");
  const [action, setAction] = useState("buy");
  const [quantity, setQuantity] = useState("10");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("algorithms").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setAlgos(data as unknown as Algo[]);
  };
  useEffect(() => { load(); }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return toast.error("Name your algorithm");
    const { error } = await supabase.from("algorithms").insert({
      user_id: user.id,
      name: name.trim(),
      rules: { symbol, indicator, op, value: Number(value), action, quantity: Number(quantity) },
    });
    if (error) return toast.error(error.message);
    setName("");
    toast.success("Algorithm saved");
    load();
  };

  const toggle = async (a: Algo) => {
    await supabase.from("algorithms").update({ is_active: !a.is_active }).eq("id", a.id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("algorithms").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <p className="text-xs font-mono text-primary uppercase tracking-wider">Level 4</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">Algorithm Builder</h1>
        <p className="text-muted-foreground mt-1">Compose trading rules in plain English. The engine watches the market for you.</p>
      </div>

      <Card className="p-5 bg-card/60">
        <h2 className="font-semibold mb-4">New rule</h2>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Algorithm name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oversold AAPL bounce" maxLength={80} />
          </div>

          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4">
            <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider">Rule definition</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">If</span>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="w-24 font-mono" />
              <Select value={indicator} onValueChange={setIndicator}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RSI">RSI</SelectItem>
                  <SelectItem value="PRICE">Price</SelectItem>
                  <SelectItem value="MACD">MACD</SelectItem>
                </SelectContent>
              </Select>
              <Select value={op} onValueChange={setOp}>
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="<">{"<"}</SelectItem>
                  <SelectItem value=">">{">"}</SelectItem>
                  <SelectItem value="=">=</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 font-mono" />
              <span className="text-muted-foreground">then</span>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-20 font-mono" />
              <span className="text-muted-foreground">shares.</span>
            </div>
          </div>

          <Button type="submit"><Plus className="h-4 w-4 mr-1" /> Save algorithm</Button>
        </form>
      </Card>

      <Card className="p-5 bg-card/60">
        <h2 className="font-semibold mb-4">Your algorithms</h2>
        {algos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No algorithms yet. Build one above.</p>
        ) : (
          <div className="space-y-3">
            {algos.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center gap-3">
                  <Cpu className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs font-mono text-muted-foreground">
                      If {a.rules.symbol} {a.rules.indicator} {a.rules.op} {a.rules.value} → {a.rules.action} {a.rules.quantity}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={a.is_active} onCheckedChange={() => toggle(a)} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-4">Backtest engine ships in a follow-up iteration.</p>
      </Card>
    </div>
  );
};

export default Algo;
