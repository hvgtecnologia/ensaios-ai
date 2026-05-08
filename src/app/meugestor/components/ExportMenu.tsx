"use client";
import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileJson, ChevronDown, Brain } from "lucide-react";

interface Props {
    period: { preset?: string; since?: string; until?: string };
    accounts?: string[];
}

export default function ExportMenu({ period, accounts }: Props) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", fn);
        return () => document.removeEventListener("mousedown", fn);
    }, []);

    const buildUrl = (level: "accounts" | "campaigns" | "ads", format: "csv" | "json") => {
        const p = new URLSearchParams();
        if (period.preset) p.set("period", period.preset);
        if (period.since) p.set("since", period.since);
        if (period.until) p.set("until", period.until);
        if (accounts?.length) p.set("accounts", accounts.join(","));
        p.set("level", level);
        p.set("format", format);
        return `/api/meugestor/export?${p.toString()}`;
    };

    const items: { label: string; icon: any; level: "accounts" | "campaigns" | "ads"; format: "csv" | "json"; hint: string }[] = [
        { label: "Contas (CSV)", icon: FileText, level: "accounts", format: "csv", hint: "1 linha por conta · Excel" },
        { label: "Campanhas (CSV)", icon: FileText, level: "campaigns", format: "csv", hint: "Todas campanhas das contas selecionadas" },
        { label: "Anúncios (CSV)", icon: FileText, level: "ads", format: "csv", hint: "Todos criativos com métricas" },
        { label: "Pacote IA (JSON)", icon: Brain, level: "ads", format: "json", hint: "Tudo + instruções para LLM" },
    ];

    return (
        <div ref={ref} style={{ position: "relative" }}>
            <button onClick={() => setOpen(!open)} className="g-btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", fontSize: "0.75rem" }}>
                <Download style={{ width: 14, height: 14 }} />
                Exportar
                <ChevronDown style={{ width: 12, height: 12, opacity: 0.6 }} />
            </button>
            {open && (
                <div className="g-glass" style={{
                    position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, width: 280, padding: "0.5rem",
                    background: "rgba(15,18,37,0.98)",
                }}>
                    {items.map((it, i) => {
                        const Icon = it.icon;
                        return (
                            <a key={i} href={buildUrl(it.level, it.format)}
                                style={{
                                    display: "flex", alignItems: "center", gap: "0.6rem",
                                    padding: "0.55rem 0.6rem", borderRadius: 6, textDecoration: "none",
                                    color: "rgba(255,255,255,0.85)", transition: "background 0.2s",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                <Icon style={{ width: 16, height: 16, color: it.format === "json" ? "#a78bfa" : "#748ffc" }} />
                                <div>
                                    <p style={{ fontSize: "0.78rem", fontWeight: 600 }}>{it.label}</p>
                                    <p style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)" }}>{it.hint}</p>
                                </div>
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
