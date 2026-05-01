import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useSpotlight } from "@/components/spotlight/SpotlightProvider";
import { onboardingTour } from "@/lib/levels";
import { toast } from "sonner";
import { HelpCircle, Save } from "lucide-react";

const Settings = () => {
  const { user, signOut } = useAuth();
  const { start } = useSpotlight();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.display_name) setName(data.display_name); });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim().slice(0, 60) }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">{user?.email}</p>
      </div>

      <Card className="p-5 bg-card/60 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div className="space-y-1.5">
          <Label>Display name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1.5" /> Save</Button>
      </Card>

      <Card className="p-5 bg-card/60 space-y-3">
        <h2 className="font-semibold">Onboarding</h2>
        <p className="text-sm text-muted-foreground">Replay the guided spotlight tour.</p>
        <Button variant="outline" onClick={() => start(onboardingTour)}>
          <HelpCircle className="h-4 w-4 mr-1.5" /> Replay tour
        </Button>
      </Card>

      <Card className="p-5 bg-card/60 space-y-3">
        <h2 className="font-semibold">Account</h2>
        <Button variant="destructive" onClick={signOut}>Sign out</Button>
      </Card>
    </div>
  );
};

export default Settings;
