"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    BarChart3, LayoutDashboard, Lightbulb, Star, Users, DollarSign,
    MousePointerClick, Target, ChevronLeft,
    RefreshCw, Search, Loader2, AlertCircle, Eye, Menu, X,
    Building2, Layers, Hash, Brain, Wallet, Activity, Filter,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid,
} from "recharts";

import { load, save, KEYS } from "./lib/storage";
import { PRESETS } from "./lib/metrics";
import { formatCurrency, formatNumber, formatPct } from "./lib/format";

import KpiCard from "./components/KpiCard";
import HealthBadge from "./components/HealthBadge";
import MetricsPicker from "./components/MetricsPicker";
import DateRangePicker, { DateRangeValue } from "./components/DateRangePicker";
import BudgetPacing from "./components/BudgetPacing";
import BreakdownsPanel from "./components/BreakdownsPanel";
import CreativePreview from "./components/CreativePreview";
import ExportMenu from "./components/ExportMenu";
import ClientReport from "./components/ClientReport";
import CmdK, { CmdItem } from "./components/CmdK";
import InsightsTable from "./components/InsightsTable";
import SmartInsights from "./components/SmartInsights";

// ─────────────────────────────────────────────────────────────
// PAGES (sidebar)
// ─────────────────────────────────────────────────────────────
const PAGES = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "favorites", label: "Meus Clientes", icon: Star },
    { id: "insights", label: "Insights", icon: Lightbulb },
];

// ─────────────────────────────────────────────────────────────
// MÉTRICAS DEFAULT
// ─────────────────────────────────────────────────────────────
const DEFAULT_ACCOUNT_METRICS = PRESETS["Diagnóstico"];
const DEFAULT_CAMPAIGN_METRICS = ["spend", "impressions", "ctr", "inline_link_clicks", "cpc", "cpm", "leads", "cpl", "messaging_started", "frequency"];
const DEFAULT_AD_METRICS = ["spend", "impressions", "ctr", "cpc", "leads", "cpl", "messaging_started", "hook_rate", "hold_rate", "frequency"];

interface PeriodMeta { preset?: string; range?: { since: string; until: string }; previous?: { since: string; until: string } | null; }

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export default function MeuGestorDashboard() {
    // Navegação
    const [currentPage, setCurrentPage] = useState("dashboard");
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [selectedAdId, setSelectedAdId] = useState<string | null>(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState("");
    const [period, setPeriod] = useState<DateRangeValue>({ preset: "last_7d" });
    const [compare, setCompare] = useState(true);
    const [onlyFavorites, setOnlyFavorites] = useState(false);

    // Dados
    const [accounts, setAccounts] = useState<any[]>([]);
    const [periodMeta, setPeriodMeta] = useState<PeriodMeta>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [accountDetail, setAccountDetail] = useState<{ campaigns: any[]; daily: any[]; adsets: any[] } | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [campaignDetail, setCampaignDetail] = useState<{ ads: any[]; daily: any[] } | null>(null);
    const [loadingCampaign, setLoadingCampaign] = useState(false);

    // Persistência
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [accountMetrics, setAccountMetrics] = useState<string[]>(DEFAULT_ACCOUNT_METRICS);
    const [campaignMetrics, setCampaignMetrics] = useState<string[]>(DEFAULT_CAMPAIGN_METRICS);
    const [adMetrics, setAdMetrics] = useState<string[]>(DEFAULT_AD_METRICS);

    // Modais
    const [pickerOpen, setPickerOpen] = useState<null | "account" | "campaign" | "ad">(null);
    const [cmdkOpen, setCmdkOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // ── Hidrata localStorage ──
    useEffect(() => {
        setFavorites(new Set(load<string[]>(KEYS.favorites, [])));
        setAccountMetrics(load(KEYS.metricsByLevel + ":account", DEFAULT_ACCOUNT_METRICS));
        setCampaignMetrics(load(KEYS.metricsByLevel + ":campaign", DEFAULT_CAMPAIGN_METRICS));
        setAdMetrics(load(KEYS.metricsByLevel + ":ad", DEFAULT_AD_METRICS));
        setPeriod(load(KEYS.period, { preset: "last_7d" }));
        setCompare(load(KEYS.compare, true));
        setOnlyFavorites(load(KEYS.onlyFavorites, false));
        setSidebarOpen(load(KEYS.sidebarOpen, true));
    }, []);

    useEffect(() => save(KEYS.favorites, Array.from(favorites)), [favorites]);
    useEffect(() => save(KEYS.metricsByLevel + ":account", accountMetrics), [accountMetrics]);
    useEffect(() => save(KEYS.metricsByLevel + ":campaign", campaignMetrics), [campaignMetrics]);
    useEffect(() => save(KEYS.metricsByLevel + ":ad", adMetrics), [adMetrics]);
    useEffect(() => save(KEYS.period, period), [period]);
    useEffect(() => save(KEYS.compare, compare), [compare]);
    useEffect(() => save(KEYS.onlyFavorites, onlyFavorites), [onlyFavorites]);
    useEffect(() => save(KEYS.sidebarOpen, sidebarOpen), [sidebarOpen]);

    // ── Cmd+K shortcut ──
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault(); setCmdkOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // ── Fetch contas ──
    const buildPeriodParams = useCallback(() => {
        const p = new URLSearchParams();
        if (period.preset) p.set("period", period.preset);
        if (period.since) p.set("since", period.since);
        if (period.until) p.set("until", period.until);
        p.set("compare", String(compare));
        return p;
    }, [period, compare]);

    const fetchAccounts = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/meugestor/accounts?${buildPeriodParams().toString()}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Erro ao buscar contas");
            setAccounts(json.data);
            setPeriodMeta(json.period);
        } catch (e: any) {
            setError(e.message);
        } finally { setLoading(false); }
    }, [buildPeriodParams]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    // ── Fetch detalhe ──
    const fetchAccountDetail = useCallback(async (id: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/meugestor/accounts/${id}?${buildPeriodParams().toString()}`);
            const json = await res.json();
            if (json.success) {
                const daily = (json.data.daily || []).map((d: any) => {
                    const [, m, day] = (d.date_start || "").split("-");
                    return { ...d, date: `${day}/${m}` };
                });
                setAccountDetail({ campaigns: json.data.campaigns, daily, adsets: json.data.adsets });
            }
        } finally { setLoadingDetail(false); }
    }, [buildPeriodParams]);

    const fetchCampaignDetail = useCallback(async (id: string) => {
        setLoadingCampaign(true);
        try {
            const res = await fetch(`/api/meugestor/campaigns/${id}?${buildPeriodParams().toString()}`);
            const json = await res.json();
            if (json.success) {
                const daily = (json.data.daily || []).map((d: any) => {
                    const [, m, day] = (d.date_start || "").split("-");
                    return { ...d, date: `${day}/${m}` };
                });
                setCampaignDetail({ ads: json.data.ads, daily });
            }
        } finally { setLoadingCampaign(false); }
    }, [buildPeriodParams]);

    // re-busca detalhes ao mudar período
    useEffect(() => {
        if (selectedAccountId) fetchAccountDetail(selectedAccountId);
    }, [selectedAccountId, fetchAccountDetail]);
    useEffect(() => {
        if (selectedCampaignId) fetchCampaignDetail(selectedCampaignId);
    }, [selectedCampaignId, fetchCampaignDetail]);

    // ── Handlers ──
    const toggleFavorite = (id: string) => {
        setFavorites(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const handleSelectAccount = (id: string) => {
        setSelectedAccountId(id);
        setSelectedCampaignId(null);
        setSelectedAdId(null);
        setAccountDetail(null);
    };
    const handleSelectCampaign = (id: string) => {
        setSelectedCampaignId(id);
        setSelectedAdId(null);
        setCampaignDetail(null);
    };
    const handleBack = () => {
        if (selectedAdId) { setSelectedAdId(null); return; }
        if (selectedCampaignId) { setSelectedCampaignId(null); setCampaignDetail(null); return; }
        setSelectedAccountId(null); setAccountDetail(null);
    };

    const handleToggleStatus = async (id: string, currentStatus: string, kind: "campaign" | "ad") => {
        const newStatus = currentStatus === "PAUSED" ? "ACTIVE" : "PAUSED";
        if (!confirm(`Deseja ${newStatus === "PAUSED" ? "PAUSAR" : "ATIVAR"} ${kind === "campaign" ? "esta campanha" : "este anúncio"}?`)) return;
        try {
            const res = await fetch("/api/meugestor/status", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: newStatus }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            if (kind === "campaign" && accountDetail) {
                setAccountDetail({ ...accountDetail, campaigns: accountDetail.campaigns.map((c: any) => c.campaign_id === id ? { ...c, status: newStatus } : c) });
            } else if (kind === "ad" && campaignDetail) {
                setCampaignDetail({ ...campaignDetail, ads: campaignDetail.ads.map((a: any) => a.ad_id === id ? { ...a, status: newStatus } : a) });
            }
        } catch (e: any) {
            alert("Erro: " + e.message);
        }
    };

    // ── Computed ──
    const visibleAccounts = useMemo(() => {
        let arr = accounts;
        if (onlyFavorites) arr = arr.filter(a => favorites.has(a.id));
        if (currentPage === "favorites") arr = arr.filter(a => favorites.has(a.id));
        if (searchTerm) arr = arr.filter(a => (a.name || "").toLowerCase().includes(searchTerm.toLowerCase()));
        return arr;
    }, [accounts, favorites, onlyFavorites, currentPage, searchTerm]);

    const totals = useMemo(() => {
        const ts = visibleAccounts.reduce((s, a) => s + a.spend, 0);
        const ti = visibleAccounts.reduce((s, a) => s + a.impressions, 0);
        const tc = visibleAccounts.reduce((s, a) => s + a.clicks, 0);
        const tl = visibleAccounts.reduce((s, a) => s + a.leads, 0);
        const tm = visibleAccounts.reduce((s, a) => s + a.messaging_started, 0);
        const tp = visibleAccounts.reduce((s, a) => s + a.purchases, 0);
        const tv = visibleAccounts.reduce((s, a) => s + (a.purchase_value || 0), 0);
        const ctr = ti > 0 ? (tc / ti) * 100 : 0;
        const cpc = tc > 0 ? ts / tc : 0;
        const cpl = tl > 0 ? ts / tl : 0;
        const roas = ts > 0 ? tv / ts : 0;
        // delta agregados (média ponderada por spend prev)
        const prevSpend = visibleAccounts.reduce((s, a) => s + (a.previous?.spend || 0), 0);
        const prevLeads = visibleAccounts.reduce((s, a) => s + (a.previous?.leads || 0), 0);
        const dSpend = prevSpend > 0 ? ((ts - prevSpend) / prevSpend) * 100 : null;
        const dLeads = prevLeads > 0 ? ((tl - prevLeads) / prevLeads) * 100 : null;
        return { ts, ti, tc, tl, tm, tp, tv, ctr, cpc, cpl, roas, dSpend, dLeads };
    }, [visibleAccounts]);

    const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

    const cmdItems: CmdItem[] = useMemo(() => {
        const items: CmdItem[] = [];
        for (const a of accounts) {
            items.push({
                id: a.id, title: a.name || a.account_id, subtitle: `${formatCurrency(a.spend)} · ${a.leads || 0} leads`,
                type: "account", onSelect: () => handleSelectAccount(a.id),
            });
        }
        if (accountDetail?.campaigns) {
            for (const c of accountDetail.campaigns) {
                items.push({
                    id: c.campaign_id, title: c.campaign_name, subtitle: `${formatCurrency(c.spend)} · CTR ${(c.ctr || 0).toFixed(2)}%`,
                    type: "campaign", onSelect: () => handleSelectCampaign(c.campaign_id),
                });
            }
        }
        if (campaignDetail?.ads) {
            for (const a of campaignDetail.ads) {
                items.push({
                    id: a.ad_id, title: a.ad_name, subtitle: `${formatCurrency(a.spend)} · ${a.leads || 0} leads`,
                    type: "ad", onSelect: () => setSelectedAdId(a.ad_id),
                });
            }
        }
        return items;
    }, [accounts, accountDetail, campaignDetail]);

    const periodLabel = periodMeta.range
        ? `${periodMeta.range.since} → ${periodMeta.range.until}`
        : (period.since && period.until ? `${period.since} → ${period.until}` : (period.preset || "—"));

    // ── Loading / Error ──
    if (loading && accounts.length === 0) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center" }}>
                    <Loader2 style={{ width: 48, height: 48, color: "#4c6ef5", margin: "0 auto 1rem" }} className="g-pulse" />
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem" }}>Carregando contas e período comparativo...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="g-glass" style={{ padding: "2rem", textAlign: "center", maxWidth: 460 }}>
                    <AlertCircle style={{ width: 48, height: 48, color: "#f87171", margin: "0 auto 1rem" }} />
                    <h3 style={{ color: "white", fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>Erro ao carregar</h3>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>
                    <button onClick={fetchAccounts} className="g-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                        <RefreshCw style={{ width: 16, height: 16 }} /> Tentar novamente
                    </button>
                </div>
            </div>
        );
    }

    // ── Render ──
    return (
        <div style={{ minHeight: "100vh" }}>
            {/* SIDEBAR */}
            <aside style={{
                position: "fixed", left: 0, top: 0, bottom: 0, width: sidebarOpen ? 240 : 72, zIndex: 50,
                background: "rgba(10,12,28,0.95)", borderRight: "1px solid var(--glass-border)",
                backdropFilter: "blur(20px)", display: "flex", flexDirection: "column", transition: "width 0.3s ease",
            }}>
                <div style={{ height: 72, display: "flex", alignItems: "center", justifyContent: sidebarOpen ? "space-between" : "center", padding: sidebarOpen ? "0 1.25rem" : "0", borderBottom: "1px solid var(--glass-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "0.65rem", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gradient-primary)" }}>
                            <BarChart3 style={{ width: 18, height: 18, color: "white" }} />
                        </div>
                        {sidebarOpen && <div>
                            <h1 style={{ color: "white", fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.02em" }}>Meu Gestor</h1>
                            <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Meta · v3</p>
                        </div>}
                    </div>
                    {sidebarOpen && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}><X style={{ width: 18, height: 18 }} /></button>}
                </div>
                <nav style={{ flex: 1, padding: "0.85rem 0.5rem" }}>
                    {PAGES.map(p => {
                        const Icon = p.icon;
                        const active = currentPage === p.id;
                        return (
                            <button key={p.id} onClick={() => { setCurrentPage(p.id); setSelectedAccountId(null); setSelectedCampaignId(null); }}
                                className={`g-sidebar-link ${active ? "active" : ""}`}
                                style={{ justifyContent: sidebarOpen ? "flex-start" : "center", padding: sidebarOpen ? "0.6rem 0.85rem" : "0.6rem", fontSize: "0.82rem" }}>
                                <Icon style={{ width: 18, height: 18 }} />
                                {sidebarOpen && <span>{p.label}</span>}
                                {sidebarOpen && p.id === "favorites" && favorites.size > 0 && (
                                    <span style={{ marginLeft: "auto", fontSize: "0.65rem", padding: "0.1rem 0.4rem", background: "rgba(76,110,245,0.25)", borderRadius: 9999, color: "#748ffc" }}>{favorites.size}</span>
                                )}
                            </button>
                        );
                    })}
                </nav>
                <div style={{ padding: "0.85rem", borderTop: "1px solid var(--glass-border)", textAlign: sidebarOpen ? "left" : "center" }}>
                    <button onClick={() => setCmdkOpen(true)} className="g-btn-secondary"
                        style={{ width: "100%", display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem", fontSize: "0.7rem", justifyContent: sidebarOpen ? "flex-start" : "center" }}>
                        <Search style={{ width: 12, height: 12 }} />
                        {sidebarOpen && <><span>Buscar</span><kbd style={{ marginLeft: "auto", fontSize: "0.6rem", padding: "0.1rem 0.3rem", background: "rgba(255,255,255,0.06)", borderRadius: 3, color: "rgba(255,255,255,0.4)" }}>⌘K</kbd></>}
                    </button>
                </div>
            </aside>

            {/* MAIN */}
            <main style={{ marginLeft: sidebarOpen ? 240 : 72, minHeight: "100vh", transition: "margin-left 0.3s ease" }}>
                {/* TOPBAR */}
                <header style={{
                    position: "sticky", top: 0, zIndex: 40, height: 72,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0 1.5rem", background: "rgba(15,18,37,0.92)",
                    borderBottom: "1px solid var(--glass-border)", backdropFilter: "blur(20px)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                        {!sidebarOpen && (
                            <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", display: "flex" }}>
                                <Menu style={{ width: 22, height: 22 }} />
                            </button>
                        )}
                        {(selectedAccountId || selectedCampaignId || selectedAdId) && (
                            <button onClick={handleBack} className="g-btn-secondary" style={{ padding: "0.4rem", display: "inline-flex" }}>
                                <ChevronLeft style={{ width: 16, height: 16 }} />
                            </button>
                        )}
                        <div>
                            <h1 style={{ fontSize: "1.05rem", fontWeight: 700, color: "white", letterSpacing: "-0.01em" }}>
                                {selectedAdId ? "Detalhe do Anúncio"
                                    : selectedCampaignId ? (accountDetail?.campaigns.find((c: any) => c.campaign_id === selectedCampaignId)?.campaign_name || "Anúncios da Campanha")
                                    : selectedAccountId ? (selectedAccount?.name || "Conta")
                                    : currentPage === "insights" ? "Insights da Operação"
                                    : currentPage === "favorites" ? "Meus Clientes"
                                    : "Painel Geral"}
                            </h1>
                            <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                                {periodLabel}
                                {periodMeta.previous && compare && <> · vs {periodMeta.previous.since} → {periodMeta.previous.until}</>}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <DateRangePicker value={period} onChange={setPeriod} compare={compare} onCompareChange={setCompare} />
                        <ExportMenu period={period} accounts={onlyFavorites || currentPage === "favorites" ? Array.from(favorites) : undefined} />
                        <button onClick={fetchAccounts} className="g-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>
                            <RefreshCw style={{ width: 13, height: 13 }} /> Atualizar
                        </button>
                    </div>
                </header>

                <div style={{ padding: "1.5rem" }}>
                    {/* ========== DASHBOARD / FAVORITES ========== */}
                    {!selectedAccountId && (currentPage === "dashboard" || currentPage === "favorites") && (
                        <div className="g-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {/* KPIs */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
                                <KpiCard title="Investimento" value={formatCurrency(totals.ts)} sub={`${visibleAccounts.length} contas`} icon={<DollarSign style={{ width: 18, height: 18 }} />} delta={totals.dSpend} color="blue" tooltip="Valor total gasto no período (com comparativo)" />
                                <KpiCard title="Cliques" value={formatNumber(totals.tc)} sub={`CPC ${formatCurrency(totals.cpc)}`} icon={<MousePointerClick style={{ width: 18, height: 18 }} />} color="yellow" tooltip="Cliques totais — inclui qualquer interação" />
                                <KpiCard title="CTR Médio" value={formatPct(totals.ctr)} sub={`${formatNumber(totals.ti)} impressões`} icon={<Target style={{ width: 18, height: 18 }} />} color="green" tooltip="Taxa de clique agregada" />
                                <KpiCard title="Leads" value={formatNumber(totals.tl)} sub={`CPL ${formatCurrency(totals.cpl)}`} icon={<Users style={{ width: 18, height: 18 }} />} delta={totals.dLeads} color="green" tooltip="Volume de leads e custo por lead" />
                                <KpiCard title="Conversas WhatsApp" value={formatNumber(totals.tm)} sub="Click-to-Message" icon={<Activity style={{ width: 18, height: 18 }} />} color="purple" tooltip="Conversas iniciadas via Meta Ads" />
                                <KpiCard title="Receita / ROAS" value={`${totals.roas.toFixed(2)}x`} sub={`${formatCurrency(totals.tv)} de receita · ${totals.tp} compras`} icon={<Wallet style={{ width: 18, height: 18 }} />} color="blue" tooltip="ROAS = receita / spend" />
                            </div>

                            {/* Filtros + tabela de contas */}
                            <div className="g-glass" style={{ overflow: "hidden" }}>
                                <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                    <div>
                                        <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "white" }}>
                                            <Building2 style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />
                                            {currentPage === "favorites" ? "Meus Clientes" : "Contas de Anúncio"}
                                        </h3>
                                        <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                                            {visibleAccounts.length} contas exibidas · {favorites.size} marcadas como cliente
                                        </p>
                                    </div>
                                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                                        {currentPage !== "favorites" && (
                                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                                                <input type="checkbox" checked={onlyFavorites} onChange={e => setOnlyFavorites(e.target.checked)} style={{ accentColor: "#fbbf24" }} />
                                                <Filter style={{ width: 12, height: 12 }} /> Só clientes
                                            </label>
                                        )}
                                        <div style={{ position: "relative" }}>
                                            <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "rgba(255,255,255,0.35)" }} />
                                            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar conta..."
                                                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "0.4rem 0.65rem 0.4rem 1.85rem", fontSize: "0.78rem", color: "white", outline: "none", width: 220 }} />
                                        </div>
                                    </div>
                                </div>
                                <InsightsTable
                                    rows={visibleAccounts}
                                    selectedMetrics={accountMetrics}
                                    nameKey="name" nameLabel="Conta" idKey="id"
                                    onRowClick={r => handleSelectAccount(r.id)}
                                    favorites={favorites}
                                    onToggleFavorite={toggleFavorite}
                                    onOpenMetricsPicker={() => setPickerOpen("account")}
                                    extraColumnsLeft={[{
                                        key: "status", label: "Status", render: (r: any) => (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                                <span className={`g-badge ${r.account_status === 1 ? "g-badge-success" : r.account_status === 3 ? "g-badge-danger" : "g-badge-warning"}`} style={{ fontSize: "0.6rem" }}>
                                                    {r.account_status === 1 ? "Ativa" : r.account_status === 3 ? "Restrita" : "Inativa"}
                                                </span>
                                                {r.business_name && <span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)" }}>{r.business_name}</span>}
                                            </div>
                                        )
                                    }]}
                                    emptyText={onlyFavorites ? "Marque algumas contas como cliente (estrela) para vê-las aqui." : "Nenhuma conta encontrada."}
                                />
                            </div>
                        </div>
                    )}

                    {/* ========== ACCOUNT DETAIL ========== */}
                    {selectedAccountId && selectedAccount && !selectedCampaignId && !selectedAdId && (
                        <div className="g-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {/* KPIs da conta */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
                                <KpiCard title="Investimento" value={formatCurrency(selectedAccount.spend)} delta={selectedAccount.deltas?.spend} icon={<DollarSign style={{ width: 16, height: 16 }} />} color="blue" />
                                <KpiCard title="CTR Link" value={formatPct(selectedAccount.inline_link_click_ctr || selectedAccount.ctr)} delta={selectedAccount.deltas?.ctr} icon={<Target style={{ width: 16, height: 16 }} />} color="green" />
                                <KpiCard title="CPC Link" value={formatCurrency(selectedAccount.cost_per_inline_link_click || selectedAccount.cpc)} delta={selectedAccount.deltas?.cpc} deltaInverse icon={<DollarSign style={{ width: 16, height: 16 }} />} color="yellow" />
                                <KpiCard title="CPM" value={formatCurrency(selectedAccount.cpm)} delta={selectedAccount.deltas?.cpm} deltaInverse icon={<Eye style={{ width: 16, height: 16 }} />} color="yellow" />
                                <KpiCard title="Leads" value={formatNumber(selectedAccount.leads)} sub={`CPL ${formatCurrency(selectedAccount.cpl)}`} delta={selectedAccount.deltas?.leads} icon={<Users style={{ width: 16, height: 16 }} />} color="green" />
                                <KpiCard title="Conversas WhatsApp" value={formatNumber(selectedAccount.messaging_started)} sub={`Custo ${formatCurrency(selectedAccount.cpa_messaging)}`} delta={selectedAccount.deltas?.messaging_started} icon={<Activity style={{ width: 16, height: 16 }} />} color="purple" />
                                {selectedAccount.purchases > 0 && (
                                    <KpiCard title="ROAS" value={`${selectedAccount.roas.toFixed(2)}x`} sub={`${formatCurrency(selectedAccount.purchase_value)} receita`} delta={selectedAccount.deltas?.roas} icon={<Wallet style={{ width: 16, height: 16 }} />} color="blue" />
                                )}
                                <div className="g-glass" style={{ padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                    <p style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Saúde</p>
                                    <HealthBadge score={selectedAccount.health} reasons={selectedAccount.health_reasons} size="md" />
                                    <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                                        Quality {selectedAccount.quality_ranking || "—"}
                                    </p>
                                </div>
                            </div>

                            {/* Pacing + Cliente Report */}
                            {accountDetail?.daily && accountDetail.daily.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                                    <BudgetPacing daily={accountDetail.daily} />
                                    <ClientReport
                                        accountName={selectedAccount.name}
                                        period={periodLabel}
                                        flat={selectedAccount}
                                        deltas={selectedAccount.deltas}
                                    />
                                </div>
                            )}

                            {loadingDetail ? (
                                <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                                    <Loader2 className="g-pulse" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.3)" }} />
                                </div>
                            ) : accountDetail && (
                                <>
                                    {/* Charts */}
                                    {accountDetail.daily.length > 0 && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                                            <div className="g-glass" style={{ padding: "1.1rem" }}>
                                                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "white", marginBottom: "0.65rem" }}>Investimento Diário</h4>
                                                <ResponsiveContainer width="100%" height={220}>
                                                    <BarChart data={accountDetail.daily}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                        <Tooltip content={<TooltipBox />} />
                                                        <Bar dataKey="spend" name="Investimento (R$)" fill="#4c6ef5" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="g-glass" style={{ padding: "1.1rem" }}>
                                                <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "white", marginBottom: "0.65rem" }}>Conversões Diárias</h4>
                                                <ResponsiveContainer width="100%" height={220}>
                                                    <LineChart data={accountDetail.daily}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                        <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                        <Tooltip content={<TooltipBox />} />
                                                        <Line type="monotone" dataKey="leads" name="Leads" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                                                        <Line type="monotone" dataKey="messaging_started" name="Conversas" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
                                                        <Line type="monotone" dataKey="purchases" name="Compras" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    {/* Breakdowns */}
                                    <BreakdownsPanel accountId={selectedAccountId} period={period} />

                                    {/* Tabela de campanhas */}
                                    <div className="g-glass" style={{ overflow: "hidden" }}>
                                        <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid var(--glass-border)" }}>
                                            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "white" }}>
                                                <Layers style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />
                                                Campanhas ({accountDetail.campaigns.length})
                                            </h4>
                                        </div>
                                        <InsightsTable
                                            rows={accountDetail.campaigns}
                                            selectedMetrics={campaignMetrics}
                                            nameKey="campaign_name" nameLabel="Campanha" idKey="campaign_id"
                                            onRowClick={r => handleSelectCampaign(r.campaign_id)}
                                            onOpenMetricsPicker={() => setPickerOpen("campaign")}
                                            emptyText="Nenhuma campanha com dados no período."
                                            extraColumnsRight={[{
                                                key: "status", label: "Ações", render: (r: any) => (
                                                    <button onClick={() => handleToggleStatus(r.campaign_id, r.status || "ACTIVE", "campaign")} className="g-btn-secondary"
                                                        style={{ padding: "0.25rem 0.55rem", fontSize: "0.65rem" }}>
                                                        {r.status === "PAUSED" ? <span style={{ color: "#34d399" }}>▶ Ativar</span> : <span style={{ color: "#fbbf24" }}>⏸ Pausar</span>}
                                                    </button>
                                                )
                                            }]}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ========== CAMPAIGN DETAIL ========== */}
                    {selectedAccountId && selectedCampaignId && !selectedAdId && (
                        <div className="g-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                            {loadingCampaign ? (
                                <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                                    <Loader2 className="g-pulse" style={{ width: 28, height: 28, color: "rgba(255,255,255,0.3)" }} />
                                </div>
                            ) : campaignDetail && (
                                <>
                                    {campaignDetail.daily.length > 0 && (
                                        <div className="g-glass" style={{ padding: "1.1rem" }}>
                                            <h4 style={{ fontSize: "0.85rem", fontWeight: 700, color: "white", marginBottom: "0.65rem" }}>Performance Diária da Campanha</h4>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <BarChart data={campaignDetail.daily}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                    <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                    <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                                                    <Tooltip content={<TooltipBox />} />
                                                    <Bar dataKey="spend" name="Investimento" fill="#4c6ef5" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    <div className="g-glass" style={{ overflow: "hidden" }}>
                                        <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid var(--glass-border)" }}>
                                            <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "white" }}>
                                                <Hash style={{ width: 14, height: 14, display: "inline", marginRight: 6 }} />
                                                Anúncios ({campaignDetail.ads.length})
                                            </h4>
                                            <p style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Clique num anúncio para ver o criativo</p>
                                        </div>
                                        <InsightsTable
                                            rows={campaignDetail.ads}
                                            selectedMetrics={adMetrics}
                                            nameKey="ad_name" nameLabel="Anúncio" idKey="ad_id"
                                            onRowClick={r => setSelectedAdId(r.ad_id)}
                                            onOpenMetricsPicker={() => setPickerOpen("ad")}
                                            emptyText="Nenhum anúncio com dados no período."
                                            extraColumnsRight={[{
                                                key: "status", label: "Ações", render: (r: any) => (
                                                    <button onClick={() => handleToggleStatus(r.ad_id, r.status || "ACTIVE", "ad")} className="g-btn-secondary"
                                                        style={{ padding: "0.25rem 0.55rem", fontSize: "0.65rem" }}>
                                                        {r.status === "PAUSED" ? <span style={{ color: "#34d399" }}>▶ Ativar</span> : <span style={{ color: "#fbbf24" }}>⏸ Pausar</span>}
                                                    </button>
                                                )
                                            }]}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ========== AD DETAIL ========== */}
                    {selectedAdId && (
                        <div className="g-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <CreativePreview adId={selectedAdId} />
                            {(() => {
                                const ad = campaignDetail?.ads.find((a: any) => a.ad_id === selectedAdId);
                                if (!ad) return null;
                                return (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                                        <KpiCard title="Investimento" value={formatCurrency(ad.spend)} delta={ad.deltas?.spend} color="blue" />
                                        <KpiCard title="CTR" value={formatPct(ad.ctr)} delta={ad.deltas?.ctr} color="green" />
                                        <KpiCard title="CPC" value={formatCurrency(ad.cpc)} delta={ad.deltas?.cpc} deltaInverse color="yellow" />
                                        <KpiCard title="Hook Rate" value={formatPct(ad.hook_rate)} delta={ad.deltas?.hook_rate} color="purple" tooltip="Views 3s / impressões — força do início do criativo" />
                                        <KpiCard title="Hold Rate" value={formatPct(ad.hold_rate)} color="purple" tooltip="Views 100% / Views 3s — retenção" />
                                        <KpiCard title="Frequência" value={ad.frequency.toFixed(2)} color="yellow" tooltip="Quanto cada pessoa viu este anúncio" />
                                        <KpiCard title="Leads" value={formatNumber(ad.leads)} sub={ad.cpl > 0 ? `CPL ${formatCurrency(ad.cpl)}` : ""} delta={ad.deltas?.leads} color="green" />
                                        <div className="g-glass" style={{ padding: "1rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                            <p style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>Saúde</p>
                                            <HealthBadge score={ad.health} reasons={ad.health_reasons} size="md" />
                                            <p style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Q:{ad.quality_ranking || "—"} · E:{ad.engagement_rate_ranking || "—"}</p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* ========== INSIGHTS PAGE ========== */}
                    {currentPage === "insights" && !selectedAccountId && (
                        <div className="g-fade-in" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="g-glass" style={{ padding: "1.25rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", marginBottom: "1rem" }}>
                                    <div style={{ padding: "0.6rem", borderRadius: "0.65rem", background: "var(--gradient-primary)" }}>
                                        <Brain style={{ width: 20, height: 20, color: "white" }} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "white" }}>Insights da Operação</h3>
                                        <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)" }}>
                                            Análise heurística de {visibleAccounts.length} contas — saturação, CTR baixo, ROAS, anomalias vs período anterior
                                        </p>
                                    </div>
                                </div>
                                <SmartInsights accounts={visibleAccounts} />
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* MODAIS */}
            <MetricsPicker
                open={!!pickerOpen}
                onClose={() => setPickerOpen(null)}
                selected={pickerOpen === "account" ? accountMetrics : pickerOpen === "campaign" ? campaignMetrics : adMetrics}
                onChange={(keys) => {
                    if (pickerOpen === "account") setAccountMetrics(keys);
                    else if (pickerOpen === "campaign") setCampaignMetrics(keys);
                    else if (pickerOpen === "ad") setAdMetrics(keys);
                }}
                title={`Métricas — ${pickerOpen === "account" ? "Contas" : pickerOpen === "campaign" ? "Campanhas" : "Anúncios"}`}
            />
            <CmdK items={cmdItems} open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
        </div>
    );
}

function TooltipBox({ active, payload, label }: any) {
    if (!active || !payload) return null;
    return (
        <div className="g-glass" style={{ padding: "0.6rem", background: "rgba(15,18,37,0.95)" }}>
            <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 4, fontSize: "0.7rem" }}>{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} style={{ color: p.color || "white", fontWeight: 500, fontSize: "0.72rem" }}>
                    {p.name}: {typeof p.value === "number" ? p.value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : p.value}
                </p>
            ))}
        </div>
    );
}
