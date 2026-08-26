import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, BarChart3, Bookmark, BookmarkCheck, ChevronDown, CircleHelp, Database, Loader2, LogIn, Plus, RefreshCw, Search, Sparkles, Target, Trophy } from "lucide-react";
import { toast } from "sonner";

type SortField = "edge" | "projection" | "hitRate" | "matchupRank" | "confidence";
type RecentGameLog = { week: number; value: number; opponent: string; date?: string };
type BoardRow = {
  id: number;
  slateId: number;
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: string;
  market: string;
  line: string | number;
  opportunityPercentile: string | number | null;
  vulnerabilityPercentile: string | number | null;
  mismatchIndex: string | number | null;
  projection: string | number | null;
  edge: string | number | null;
  hitRate: string | number | null;
  matchupRank: number | null;
  confidence: number | null;
  dataQuality: string | null;
  explanation: string | null;
  recentGameLogs: RecentGameLog[] | null;
};

const marketLabels: Record<string, string> = {
  rush_yards: "Rush yards",
  rec_yards: "Rec yards",
  targets: "Targets",
  rush_attempts: "Rush attempts",
  pass_attempts: "Pass attempts",
};

function formatNumber(value: unknown, digits = 1) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toFixed(digits) : "—";
}

function confidenceTone(value: unknown) {
  const number = Number(value ?? 0);
  if (number >= 75) return "bg-emerald-50 text-emerald-800 ring-emerald-600/15";
  if (number >= 55) return "bg-amber-50 text-amber-800 ring-amber-600/15";
  return "bg-stone-100 text-stone-700 ring-stone-500/15";
}

function MetricCard({ label, value, helper, highlight }: { label: string; value: string; helper: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4 transition-shadow hover:shadow-sm", highlight ? "border-[#e16859]/30 bg-[#fff8f5]" : "border-stone-200 bg-white/70")}>
      <p className="mono text-[10px] uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight", highlight && "text-[#d9493c]")}>{value}</p>
      <p className="mt-1 text-xs text-stone-500">{helper}</p>
    </div>
  );
}

function EmptyResearchState({ signedIn, onSync, syncing, onAdd }: { signedIn: boolean; onSync: () => void; syncing: boolean; onAdd: () => void }) {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#fbe5df] text-[#d9493c]"><Target className="h-5 w-5" /></div>
        <h3 className="editorial mt-5 text-3xl text-stone-900">Your board is ready for a slate.</h3>
        <p className="mt-3 text-sm leading-6 text-stone-600">Sync an NFLverse schedule, add verified sportsbook lines, then calculate the board. The engine keeps historical volume, defensive allowance, and market inputs explicitly separate.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={onSync} disabled={!signedIn || syncing} className="bg-[#d9493c] text-white hover:bg-[#c43c31]">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync season slate
          </Button>
          <Button variant="outline" onClick={onAdd} disabled={!signedIn} className="border-stone-300 bg-white">Add a prop line</Button>
        </div>
        {!signedIn && <p className="mt-4 text-xs text-stone-500">Sign in to connect a slate or save research to your watchlist.</p>}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [slateId, setSlateId] = useState<number | undefined>();
  const [market, setMarket] = useState("all");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [sortBy, setSortBy] = useState<SortField>("edge");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [lineForm, setLineForm] = useState({ playerId: "", playerName: "", team: "", opponent: "", position: "", market: "rec_yards", line: "", source: "" });

  const status = trpc.research.status.useQuery();
  const filters = trpc.research.filters.useQuery();
  const queryInput = useMemo(() => ({
    slateId,
    market: market === "all" ? undefined : market,
    team: team === "all" ? undefined : team,
    position: position === "all" ? undefined : position,
    sortBy,
    sortOrder,
  }), [slateId, market, team, position, sortBy, sortOrder]);
  const board = trpc.research.board.useQuery(queryInput);
  const detail = trpc.research.player.useQuery({ propId: detailId ?? 1 }, { enabled: detailId !== null });
  const watchlist = trpc.research.watchlist.useQuery(undefined, { enabled: Boolean(user) });
  const syncSlates = trpc.research.syncSlates.useMutation({
    onSuccess: ({ synced }) => {
      toast.success(`${synced} slate weeks synced from NFLverse.`);
      void utils.research.filters.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const recalculate = trpc.research.recalculateSlate.useMutation({
    onSuccess: ({ message }) => { toast.success(message); void utils.research.board.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const addProp = trpc.research.addProp.useMutation({
    onSuccess: () => {
      toast.success("Player prop record saved.");
      setAddOpen(false);
      setLineForm({ playerId: "", playerName: "", team: "", opponent: "", position: "", market: "rec_yards", line: "", source: "" });
      void utils.research.filters.invalidate();
      void utils.research.board.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const toggleWatchlist = trpc.research.toggleWatchlist.useMutation({
    onSuccess: () => { void utils.research.watchlist.invalidate(); toast.success("Watchlist updated."); },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!slateId && filters.data?.slates[0]) setSlateId(filters.data.slates[0].id);
  }, [filters.data, slateId]);

  const savedPropIds = new Set((watchlist.data ?? []).map((entry) => entry.propId));
  const rows = (board.data ?? []) as BoardRow[];
  const selected = (detail.data ?? null) as BoardRow | null;
  const aggregate = rows.reduce((acc, row) => ({ edge: acc.edge + Number(row.edge ?? 0), confidence: acc.confidence + Number(row.confidence ?? 0) }), { edge: 0, confidence: 0 });
  const averageEdge = rows.length ? aggregate.edge / rows.length : 0;
  const averageConfidence = rows.length ? aggregate.confidence / rows.length : 0;

  const requestSync = () => {
    if (!user) return startLogin();
    const parsedSeason = Number(season);
    if (!Number.isInteger(parsedSeason) || parsedSeason < 1999) return toast.error("Enter a valid NFL season.");
    syncSlates.mutate({ season: parsedSeason });
  };

  const submitProp = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return startLogin();
    if (!slateId) return toast.error("Sync and select a slate before adding a prop.");
    addProp.mutate({
      slateId,
      playerId: lineForm.playerId.trim(),
      playerName: lineForm.playerName.trim(),
      team: lineForm.team.trim(),
      opponent: lineForm.opponent.trim(),
      position: lineForm.position.trim(),
      market: lineForm.market as "rush_yards" | "rec_yards" | "targets" | "rush_attempts" | "pass_attempts",
      line: Number(lineForm.line),
      americanOdds: -110,
      source: lineForm.source.trim(),
    });
  };

  const changeSort = (field: SortField) => {
    if (sortBy === field) setSortOrder((current) => current === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder(field === "matchupRank" ? "asc" : "desc"); }
  };

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-stone-900">
      <div className="topograph relative overflow-hidden text-stone-50">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ef5a4f] font-bold tracking-tighter text-white shadow-lg shadow-red-950/25">PM</div>
            <div>
              <p className="text-sm font-semibold tracking-tight">NFL Prop Machine</p>
              <p className="mono text-[9px] uppercase tracking-[0.14em] text-stone-400">Research terminal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-white/15 bg-white/5 px-2 py-1 text-[10px] font-normal text-stone-300 sm:flex"><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#f4bc69]" />NFLVERSE-READY</Badge>
            {authLoading ? <Skeleton className="h-8 w-24 bg-white/10" /> : user ? (
              <div className="flex items-center gap-2 rounded-lg bg-white/8 py-1.5 pl-2 pr-3 text-xs text-stone-200"><div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f4bc69] text-[9px] font-bold text-stone-950">{user.name?.slice(0, 1).toUpperCase() ?? "U"}</div>{user.name?.split(" ")[0] ?? "Researcher"}</div>
            ) : <Button variant="outline" size="sm" onClick={() => startLogin()} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><LogIn className="mr-1.5 h-3.5 w-3.5" />Sign in</Button>}
          </div>
        </div>
        <div className="mx-auto max-w-[1600px] px-5 pb-12 pt-7 lg:px-8 lg:pb-16">
          <div className="max-w-3xl reveal">
            <p className="mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#f4bc69]">Matchup intelligence, not just a projection</p>
            <h1 className="editorial mt-4 text-5xl leading-[0.9] tracking-tight text-stone-50 sm:text-6xl">Find the gap <span className="italic text-[#f4bc69]">before</span> the market does.</h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-stone-300">Rank player-prop opportunities by the collision of usage, positional matchup vulnerability, historical performance, and the book’s price point.</p>
          </div>
        </div>
      </div>

      <main className="mx-auto -mt-6 max-w-[1600px] px-5 pb-12 lg:px-8">
        <section className="panel-shadow reveal-delay rounded-2xl border border-stone-200 bg-white p-3 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect label="Slate" value={slateId?.toString() ?? "all"} onValueChange={(value) => setSlateId(value === "all" ? undefined : Number(value))} options={[{ value: "all", label: "All synced slates" }, ...(filters.data?.slates.map((slate) => ({ value: String(slate.id), label: slate.label })) ?? [])]} />
              <FilterSelect label="Market" value={market} onValueChange={setMarket} options={[{ value: "all", label: "Every market" }, ...(filters.data?.markets.map((value) => ({ value, label: marketLabels[value] ?? value })) ?? [])]} />
              <FilterSelect label="Team" value={team} onValueChange={setTeam} options={[{ value: "all", label: "All teams" }, ...(filters.data?.teams.map((value) => ({ value, label: value })) ?? [])]} />
              <FilterSelect label="Position" value={position} onValueChange={setPosition} options={[{ value: "all", label: "All positions" }, ...(filters.data?.positions.map((value) => ({ value, label: value })) ?? [])]} />
            </div>
            <div className="flex gap-2">
              <Input aria-label="NFL season" value={season} onChange={(event) => setSeason(event.target.value)} className="h-10 w-20 border-stone-200 bg-stone-50 text-center text-sm" inputMode="numeric" />
              <Button variant="outline" onClick={requestSync} disabled={syncSlates.isPending} className="h-10 border-stone-300 bg-white text-xs"><RefreshCw className={cn("mr-2 h-3.5 w-3.5", syncSlates.isPending && "animate-spin")} />Sync slate</Button>
              <Button onClick={() => user ? setAddOpen(true) : startLogin()} className="h-10 bg-[#d9493c] text-xs text-white hover:bg-[#c43c31]"><Plus className="mr-1.5 h-3.5 w-3.5" />Add line</Button>
            </div>
          </div>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Researchable props" value={rows.length.toString()} helper="Filtered board records" />
          <MetricCard label="Average projection edge" value={`${averageEdge >= 0 ? "+" : ""}${formatNumber(averageEdge)}`} helper="Model projection less line" highlight={averageEdge > 0} />
          <MetricCard label="Average confidence" value={`${formatNumber(averageConfidence, 0)}%`} helper="Volume and sample support" />
          <MetricCard label="Current data input" value={status.data?.oddsProviderConfigured ? "Connected" : "Manual"} helper={status.data?.oddsProviderConfigured ? "Sportsbook source configured" : "Add verified prop records"} />
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white panel-shadow">
          <div className="flex flex-col gap-4 border-b border-stone-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#fbe5df] text-[#d9493c]"><Sparkles className="h-3.5 w-3.5" /></span><p className="mono text-[10px] font-medium uppercase tracking-[0.16em] text-stone-500">Ranked mismatch board</p></div>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">Research the highest-quality volume and matchup gaps.</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-500"><CircleHelp className="h-4 w-4" />Click any player to inspect the underlying trend.</div>
          </div>

          {board.isLoading ? <BoardSkeleton /> : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left">
                <thead className="bg-stone-50/90">
                  <tr className="mono text-[10px] uppercase tracking-[0.12em] text-stone-500">
                    <th className="w-10 px-5 py-3.5"></th>
                    <th className="px-3 py-3.5">Player / market</th>
                    <th className="px-3 py-3.5">Matchup</th>
                    <SortableHeader label="Line" onClick={() => changeSort("projection")} />
                    <SortableHeader label="Projection" active={sortBy === "projection"} order={sortOrder} onClick={() => changeSort("projection")} />
                    <SortableHeader label="Edge" active={sortBy === "edge"} order={sortOrder} onClick={() => changeSort("edge")} />
                    <SortableHeader label="Hit rate" active={sortBy === "hitRate"} order={sortOrder} onClick={() => changeSort("hitRate")} />
                    <SortableHeader label="Matchup" active={sortBy === "matchupRank"} order={sortOrder} onClick={() => changeSort("matchupRank")} />
                    <SortableHeader label="Confidence" active={sortBy === "confidence"} order={sortOrder} onClick={() => changeSort("confidence")} />
                    <th className="px-5 py-3.5 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((row) => <PropRow key={row.id} row={row} saved={savedPropIds.has(row.id)} onOpen={() => setDetailId(row.id)} onSave={() => user ? toggleWatchlist.mutate({ propId: row.id }) : startLogin()} />)}
                </tbody>
              </table>
            </div>
          ) : <EmptyResearchState signedIn={Boolean(user)} syncing={syncSlates.isPending} onSync={requestSync} onAdd={() => user ? setAddOpen(true) : startLogin()} />}
        </section>

        <section className="mt-7 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-2xl border border-stone-200 bg-[#fcfbf8] p-6">
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-stone-500">Methodology</p>
            <h2 className="editorial mt-3 text-3xl text-stone-900">A transparent research stack.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">The mismatch index adds a player’s positional opportunity percentile to the opponent’s positional vulnerability percentile and subtracts 100. The line delta situates the book’s line within that player’s recent game distribution. Thin samples are labeled, not disguised.</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex items-center gap-3"><Database className="h-4 w-4 text-[#d9493c]" /><p className="text-sm font-semibold">Data provenance</p></div>
            <p className="mt-3 text-sm leading-6 text-stone-600">Historical player statistics and schedule context come from NFLverse. Sportsbook lines are stored with their source so the research trail remains auditable.</p>
          </div>
        </section>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg border-stone-200 bg-[#fdfcf9]">
          <DialogHeader><DialogTitle className="text-xl">Add a verified player-prop line</DialogTitle><DialogDescription>Record the actual line from a licensed source. The model will use it only after you run the slate calculation.</DialogDescription></DialogHeader>
          <form className="mt-2 grid gap-4" onSubmit={submitProp}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="NFLverse player ID" value={lineForm.playerId} onChange={(value) => setLineForm((current) => ({ ...current, playerId: value }))} placeholder="00-003..." />
              <Field label="Player name" value={lineForm.playerName} onChange={(value) => setLineForm((current) => ({ ...current, playerName: value }))} placeholder="Player name" />
              <Field label="Team" value={lineForm.team} onChange={(value) => setLineForm((current) => ({ ...current, team: value }))} placeholder="KC" />
              <Field label="Opponent" value={lineForm.opponent} onChange={(value) => setLineForm((current) => ({ ...current, opponent: value }))} placeholder="BUF" />
              <Field label="Position" value={lineForm.position} onChange={(value) => setLineForm((current) => ({ ...current, position: value }))} placeholder="WR" />
              <Field label="Line" value={lineForm.line} onChange={(value) => setLineForm((current) => ({ ...current, line: value }))} placeholder="67.5" inputMode="decimal" />
              <div className="grid gap-2"><Label className="text-xs text-stone-600">Market</Label><Select value={lineForm.market} onValueChange={(value) => setLineForm((current) => ({ ...current, market: value }))}><SelectTrigger className="border-stone-200 bg-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(marketLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <Field label="Sportsbook / source" value={lineForm.source} onChange={(value) => setLineForm((current) => ({ ...current, source: value }))} placeholder="Provider name" />
            </div>
            <Button type="submit" disabled={addProp.isPending} className="mt-2 bg-[#d9493c] text-white hover:bg-[#c43c31]">{addProp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save player prop</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto border-stone-200 bg-[#fcfbf8] p-0 sm:max-w-xl">
          {detail.isLoading || !selected ? <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="mt-5 h-64 w-full" /></div> : <PlayerDetail row={selected} saved={savedPropIds.has(selected.id)} onSave={() => user ? toggleWatchlist.mutate({ propId: selected.id }) : startLogin()} onRecalculate={() => recalculate.mutate({ slateId: selected.slateId })} recalculating={recalculate.isPending} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="grid gap-1.5"><Label className="mono px-1 text-[9px] uppercase tracking-[0.12em] text-stone-500">{label}</Label><Select value={value} onValueChange={onValueChange}><SelectTrigger className="h-10 border-stone-200 bg-stone-50 text-sm"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "decimal" }) {
  return <div className="grid gap-2"><Label className="text-xs text-stone-600">{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} className="border-stone-200 bg-white" required /></div>;
}

function SortableHeader({ label, active, order, onClick }: { label: string; active?: boolean; order?: "asc" | "desc"; onClick: () => void }) {
  return <th className="px-3 py-3.5"><button onClick={onClick} className={cn("flex items-center gap-1 transition-colors hover:text-stone-900", active && "text-[#c94135]")}>{label}{active && (order === "desc" ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />)}</button></th>;
}

function PropRow({ row, saved, onOpen, onSave }: { row: BoardRow; saved: boolean; onOpen: () => void; onSave: () => void }) {
  const edge = Number(row.edge ?? 0);
  return <tr className="group transition-colors hover:bg-[#fffaf6]"><td className="px-5 py-4"><button onClick={onSave} className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-[#d9493c]" aria-label={saved ? "Remove from watchlist" : "Save to watchlist"}>{saved ? <BookmarkCheck className="h-4 w-4 fill-[#d9493c] text-[#d9493c]" /> : <Bookmark className="h-4 w-4" />}</button></td><td className="px-3 py-4"><button onClick={onOpen} className="text-left"><p className="font-semibold tracking-tight transition-colors group-hover:text-[#c94135]">{row.playerName}</p><p className="mt-0.5 text-xs text-stone-500">{row.position} · {marketLabels[row.market] ?? row.market}</p></button></td><td className="px-3 py-4"><p className="text-sm font-medium">{row.team} <span className="text-stone-400">vs</span> {row.opponent}</p><p className="mt-0.5 text-xs text-stone-500">Opportunity {formatNumber(row.opportunityPercentile, 0)}th pct.</p></td><td className="px-3 py-4 text-sm font-medium">{formatNumber(row.line)}</td><td className="px-3 py-4 text-sm font-medium">{formatNumber(row.projection)}</td><td className={cn("px-3 py-4 text-sm font-semibold", edge >= 0 ? "text-emerald-700" : "text-rose-700")}>{edge >= 0 ? "+" : ""}{formatNumber(edge)}</td><td className="px-3 py-4"><span className="text-sm font-medium">{formatNumber(row.hitRate, 0)}%</span></td><td className="px-3 py-4"><span className="mono rounded-md bg-stone-100 px-2 py-1 text-xs">#{row.matchupRank ?? "—"}</span></td><td className="px-3 py-4"><span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset", confidenceTone(row.confidence))}>{formatNumber(row.confidence, 0)}%</span></td><td className="px-5 py-4 text-right"><Button variant="ghost" size="sm" onClick={onOpen} className="text-xs text-stone-600 hover:bg-[#fbe5df] hover:text-[#c94135]">Inspect</Button></td></tr>;
}

function BoardSkeleton() { return <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full bg-stone-100" />)}</div>; }

function PlayerDetail({ row, saved, onSave, onRecalculate, recalculating }: { row: BoardRow; saved: boolean; onSave: () => void; onRecalculate: () => void; recalculating: boolean }) {
  const chartData = (row.recentGameLogs ?? []).map((game) => ({ week: `W${game.week}`, value: game.value, opponent: game.opponent }));
  const edge = Number(row.edge ?? 0);
  return <div>
    <SheetHeader className="topograph px-6 pb-7 pt-6 text-left text-white"><div className="flex items-start justify-between gap-4"><div><p className="mono text-[10px] uppercase tracking-[0.16em] text-[#f4bc69]">Player prop research</p><SheetTitle className="mt-2 text-3xl text-white">{row.playerName}</SheetTitle><SheetDescription className="mt-2 text-sm text-stone-300">{row.team} vs {row.opponent} · {row.position} · {marketLabels[row.market] ?? row.market}</SheetDescription></div><Button variant="outline" size="icon" onClick={onSave} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">{saved ? <BookmarkCheck className="h-4 w-4 fill-[#f4bc69] text-[#f4bc69]" /> : <Bookmark className="h-4 w-4" />}</Button></div></SheetHeader>
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-3 gap-3"><MetricCard label="Line" value={formatNumber(row.line)} helper="Book line" /><MetricCard label="Projection" value={formatNumber(row.projection)} helper="Engine output" /><MetricCard label="Edge" value={`${edge >= 0 ? "+" : ""}${formatNumber(edge)}`} helper="Projection − line" highlight={edge > 0} /></div>
      <div className="rounded-xl border border-stone-200 bg-white p-4"><div className="flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[0.14em] text-stone-500">Recent game trend</p><p className="mt-1 text-sm font-semibold">Last {chartData.length || 0} recorded games</p></div><BarChart3 className="h-4 w-4 text-[#d9493c]" /></div>{chartData.length ? <div className="mt-4 h-48"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e85b50" stopOpacity={0.32} /><stop offset="100%" stopColor="#e85b50" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ebe7df" /><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78716c" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#78716c" }} /><Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e7e3db", fontSize: 12 }} formatter={(value) => [value, marketLabels[row.market] ?? row.market]} labelFormatter={(_, payload) => payload?.[0]?.payload?.opponent ? `Opponent: ${payload[0].payload.opponent}` : ""} /><Area type="monotone" dataKey="value" stroke="#d9493c" strokeWidth={2} fill="url(#trendFill)" /></AreaChart></ResponsiveContainer></div> : <p className="mt-5 text-sm text-stone-500">Run the slate calculation to attach NFLverse game history.</p>}</div>
      <div className="rounded-xl border border-[#edd8d1] bg-[#fff8f5] p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#d9493c]" /><p className="text-sm font-semibold">Why this appears on the board</p></div><p className="mt-3 text-sm leading-6 text-stone-700">{row.explanation ?? "Calculate the selected slate to generate its volume, matchup, and line-delta rationale."}</p></div>
      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 text-sm"><div className="flex items-center justify-between"><span className="text-stone-500">Opportunity percentile</span><span className="font-semibold">{formatNumber(row.opportunityPercentile, 0)}th</span></div><div className="flex items-center justify-between"><span className="text-stone-500">Opponent vulnerability</span><span className="font-semibold">{formatNumber(row.vulnerabilityPercentile, 0)}th</span></div><div className="flex items-center justify-between"><span className="text-stone-500">Mismatch index</span><span className="font-semibold">{formatNumber(row.mismatchIndex)}</span></div><div className="flex items-center justify-between"><span className="text-stone-500">Data quality</span><Badge variant="outline" className="border-stone-200 bg-stone-50 text-xs capitalize">{String(row.dataQuality ?? "pending").replace("_", " ")}</Badge></div></div>
      <Button variant="outline" className="w-full border-stone-300 bg-white" onClick={onRecalculate} disabled={recalculating}>{recalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Recalculate this slate</Button>
    </div>
  </div>;
}
