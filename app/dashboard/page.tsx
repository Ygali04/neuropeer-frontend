"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Brain, Folder, FolderOpen, FileText, Plus, Trash2,
  ChevronRight, ChevronDown, MoreHorizontal, FolderInput,
  ExternalLink, X, Check, Loader2, BarChart3,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getProjects, getProjectDetail, createProject, deleteProject,
  createCampaignV2, moveReport, getAllReports, getProfile, getCampaigns,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MarketerProfileCard } from "@/components/MarketerProfileCard";
import { ScoreTimeline } from "@/components/ScoreTimeline";
import { Button } from "@/components/ui/button";
import type { ProjectSummary, ProjectDetail, MarketerProfile, CampaignSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface LooseReport {
  job_id: string; url: string; content_type: string;
  score: number | null; created_at: string;
  campaign_name?: string | null; content_group_id?: string;
  project_id?: string | null; campaign_id?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s: number | null): string {
  if (!s) return "text-white/30";
  if (s >= 75) return "text-green-400";
  if (s >= 50) return "text-amber-400";
  return "text-red-400";
}

function shortUrl(url: string): string {
  return url.replace(/https?:\/\/(www\.)?/, "").slice(0, 40);
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { session, status } = useAuth();
  const email = session?.user?.email ?? "";

  // Data
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectDetails, setProjectDetails] = useState<Record<string, ProjectDetail>>({});
  const [looseReports, setLooseReports] = useState<LooseReport[]>([]);
  const [allReports, setAllReports] = useState<LooseReport[]>([]);
  const [profile, setProfile] = useState<MarketerProfile | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<"files" | "stats">("files");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ type: string; id: string; x: number; y: number } | null>(null);
  const [creating, setCreating] = useState<{ type: "project" | "campaign"; parentId?: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [draggedReport, setDraggedReport] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    try {
      const [projs, prof, allReps, camps] = await Promise.all([
        getProjects(email),
        getProfile(email),
        getAllReports(email).catch(() => []),
        getCampaigns(email).catch(() => []),
      ]);
      setProjects(projs);
      setProfile(prof);
      setAllReports(allReps as LooseReport[]);
      setCampaigns(camps);

      // Load details for each project
      const details: Record<string, ProjectDetail> = {};
      for (const p of projs) {
        const d = await getProjectDetail(p.id);
        if (d) details[p.id] = d;
      }
      setProjectDetails(details);

      // Collect ALL job_ids that are in any project (loose or in campaigns)
      const assignedJobIds = new Set<string>();
      for (const d of Object.values(details)) {
        for (const r of d.loose_reports) {
          assignedJobIds.add(r.job_id);
        }
        for (const c of d.campaigns) {
          for (const r of (c.reports ?? [])) {
            assignedJobIds.add(r.job_id);
          }
        }
      }

      // Also exclude reports that have a campaign_id or project_id set
      const loose = (allReps as LooseReport[]).filter(
        (r: LooseReport) =>
          !assignedJobIds.has(r.job_id) &&
          !r.project_id &&
          !r.campaign_id
      );
      setLooseReports(loose);
    } catch (e) {
      console.error("Dashboard load error:", e);
    }
    setLoading(false);
  }, [email]);

  useEffect(() => {
    if (status === "authenticated" && email) refresh();
  }, [status, email, refresh]);

  useEffect(() => {
    const name = session?.user?.name?.split(" ")[0] ?? "Dashboard";
    document.title = `${name}'s Dashboard — NeuroPeer`;
  }, [session]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleCreateProject = async () => {
    if (!newName.trim() || !email) return;
    await createProject(newName.trim(), email);
    setCreating(null);
    setNewName("");
    refresh();
  };

  const handleCreateCampaign = async (projectId: string) => {
    if (!newName.trim() || !email) return;
    await createCampaignV2(newName.trim(), email, projectId);
    setCreating(null);
    setNewName("");
    refresh();
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Delete this project? Reports will become loose.")) return;
    await deleteProject(id);
    refresh();
  };

  // ── Optimistic drag-and-drop ──────────────────────────────────────────
  const handleMoveReport = async (jobId: string, targetProjectId?: string, targetCampaignId?: string) => {
    // Find the report from all sources
    const findReport = (): LooseReport | null => {
      // Check loose reports
      const fromLoose = looseReports.find(r => r.job_id === jobId);
      if (fromLoose) return fromLoose;
      // Check project details
      for (const d of Object.values(projectDetails)) {
        const fromProjectLoose = d.loose_reports.find(r => r.job_id === jobId);
        if (fromProjectLoose) return { ...fromProjectLoose, content_type: fromProjectLoose.content_type };
        for (const c of d.campaigns) {
          const fromCampaign = (c.reports ?? []).find(r => r.job_id === jobId);
          if (fromCampaign) return { ...fromCampaign, content_type: fromCampaign.content_type };
        }
      }
      return null;
    };

    const report = findReport();
    if (!report) return;

    // Snapshot for rollback
    const prevLooseReports = looseReports;
    const prevProjectDetails = projectDetails;

    // ── Optimistic update ──
    // 1. Remove from loose reports
    setLooseReports(prev => prev.filter(r => r.job_id !== jobId));

    // 2. Remove from all project details (loose + campaigns) and add to target
    setProjectDetails(prev => {
      const next = { ...prev };

      // Remove from everywhere
      for (const [pid, detail] of Object.entries(next)) {
        let modified = false;
        const newLoose = detail.loose_reports.filter(r => r.job_id !== jobId);
        if (newLoose.length !== detail.loose_reports.length) modified = true;

        const newCampaigns = detail.campaigns.map(c => {
          const reps = c.reports ?? [];
          const newReports = reps.filter(r => r.job_id !== jobId);
          if (newReports.length !== reps.length) modified = true;
          return newReports.length !== reps.length
            ? { ...c, reports: newReports, report_count: newReports.length }
            : c;
        });

        if (modified) {
          next[pid] = { ...detail, loose_reports: newLoose, campaigns: newCampaigns };
        }
      }

      // Add to target
      if (targetProjectId && next[targetProjectId]) {
        const detail = next[targetProjectId];
        const reportEntry = { job_id: report.job_id, url: report.url, content_type: report.content_type, score: report.score, created_at: report.created_at };

        if (targetCampaignId) {
          // Add to specific campaign
          const newCampaigns = detail.campaigns.map(c =>
            c.id === targetCampaignId
              ? { ...c, reports: [reportEntry, ...(c.reports ?? [])], report_count: c.report_count + 1 }
              : c
          );
          next[targetProjectId] = { ...detail, campaigns: newCampaigns };
        } else {
          // Add as loose report in project
          next[targetProjectId] = { ...detail, loose_reports: [reportEntry, ...detail.loose_reports] };
        }
      }

      return next;
    });

    // 3. Persist to server
    try {
      await moveReport(jobId, targetProjectId, targetCampaignId);
    } catch (e) {
      console.error("Move failed, reverting:", e);
      // Rollback
      setLooseReports(prevLooseReports);
      setProjectDetails(prevProjectDetails);
    }
  };

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCampaign = (id: string) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <Navbar breadcrumb={{ label: "Dashboard", href: "/dashboard" }} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Profile header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-10 h-10 rounded-full border border-white/10" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold">
                {(session?.user?.name ?? "U")[0]}
              </div>
            )}
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-lg font-bold text-white">{session?.user?.name ?? "Dashboard"}</h1>
              <p className="text-xs text-white/30">{email} · {profile?.total_analyses ?? 0} analyses</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 border-b border-white/[0.06] pb-px">
          <button
            onClick={() => setActiveTab("files")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === "files" ? "text-white" : "text-white/30 hover:text-white/50"
            )}
          >
            <div className="flex items-center gap-2">
              <Folder className="w-3.5 h-3.5" />
              Files
            </div>
            {activeTab === "files" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-400 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("stats")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors relative",
              activeTab === "stats" ? "text-white" : "text-white/30 hover:text-white/50"
            )}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" />
              Stats
            </div>
            {activeTab === "stats" && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-400 rounded-full" />
            )}
          </button>
        </div>

        {/* ── Stats Tab ────────────────────────────────────────────────── */}
        {activeTab === "stats" && profile && (
          <div className="space-y-6 animate-fade-up">
            <MarketerProfileCard profile={profile} campaigns={campaigns} />
            <ScoreTimeline campaigns={campaigns} overallScore={profile.overall_score} reports={allReports.map(r => ({ job_id: r.job_id, url: r.url, content_type: r.content_type, score: r.score ?? 0, campaign_name: r.campaign_name ?? null, content_group_id: r.content_group_id ?? "", created_at: r.created_at }))} />
          </div>
        )}

        {/* ── Files Tab ────────────────────────────────────────────────── */}
        {activeTab === "files" && (
          <div>
            {/* New Project button */}
            <div className="flex justify-end mb-4">
              <Button variant="primary" size="sm" onClick={() => { setCreating({ type: "project" }); setNewName(""); }}>
                <Plus className="w-3.5 h-3.5" /> New Project
              </Button>
            </div>

            {/* Create project inline */}
            {creating?.type === "project" && (
              <div className="glass-card p-4 mb-4 flex items-center gap-3 animate-fade-up">
                <Folder className="w-4 h-4 text-brand-400" />
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateProject(); if (e.key === "Escape") setCreating(null); }}
                  placeholder="Project name..."
                  className="flex-1 bg-transparent border-b border-white/10 text-sm text-white focus:outline-none focus:border-brand-400 py-1"
                />
                <button onClick={handleCreateProject} className="p-1 text-brand-400 hover:text-brand-300"><Check className="w-4 h-4" /></button>
                <button onClick={() => setCreating(null)} className="p-1 text-white/30 hover:text-white/50"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* ── File System Tree ─────────────────────────────────────── */}
            <div className="space-y-1">
              {/* Projects */}
              {projects.map(project => {
                const isExpanded = expandedProjects.has(project.id);
                const detail = projectDetails[project.id];

                return (
                  <div key={project.id}>
                    {/* Project row */}
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all group",
                        isExpanded ? "bg-white/[0.03]" : "hover:bg-white/[0.02]",
                        dragOverTarget === `project:${project.id}` && "ring-1 ring-brand-400/50 bg-brand-500/[0.05]"
                      )}
                      onClick={() => toggleProject(project.id)}
                      onDragOver={e => { e.preventDefault(); setDragOverTarget(`project:${project.id}`); }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggedReport) handleMoveReport(draggedReport, project.id, undefined);
                        setDragOverTarget(null);
                        setDraggedReport(null);
                      }}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-white/30" /> : <ChevronRight className="w-3.5 h-3.5 text-white/30" />}
                      {isExpanded ? <FolderOpen className="w-4 h-4 text-brand-400" /> : <Folder className="w-4 h-4 text-brand-400" />}
                      <span className="text-sm text-white/70 font-medium flex-1">{project.name}</span>
                      <span className="text-[10px] text-white/20 tabular-nums">{project.campaign_count}c · {project.report_count}r</span>
                      {project.latest_score != null && (
                        <span className={cn("text-xs font-semibold tabular-nums", scoreColor(project.latest_score))}>
                          {project.latest_score.toFixed(1)}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setContextMenu({ type: "project", id: project.id, x: e.clientX, y: e.clientY }); }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/50 transition-all"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expanded project contents */}
                    {isExpanded && detail && (
                      <div className="ml-6 border-l border-white/[0.04] pl-3 space-y-0.5 mt-0.5">
                        {/* Campaigns */}
                        {detail.campaigns.map(campaign => {
                          const campExpanded = expandedCampaigns.has(campaign.id);
                          return (
                            <div key={campaign.id}>
                              <div
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all group",
                                  campExpanded ? "bg-white/[0.02]" : "hover:bg-white/[0.02]",
                                  dragOverTarget === `campaign:${campaign.id}` && "ring-1 ring-teal-400/50 bg-teal-500/[0.05]"
                                )}
                                onClick={() => toggleCampaign(campaign.id)}
                                onDragOver={e => { e.preventDefault(); setDragOverTarget(`campaign:${campaign.id}`); }}
                                onDragLeave={() => setDragOverTarget(null)}
                                onDrop={e => {
                                  e.preventDefault();
                                  if (draggedReport) handleMoveReport(draggedReport, project.id, campaign.id);
                                  setDragOverTarget(null);
                                  setDraggedReport(null);
                                }}
                              >
                                {campExpanded ? <ChevronDown className="w-3 h-3 text-white/20" /> : <ChevronRight className="w-3 h-3 text-white/20" />}
                                <Folder className="w-3.5 h-3.5 text-teal-400" />
                                <span className="text-sm text-white/60 flex-1">{campaign.name}</span>
                                <span className="text-[10px] text-white/20">{campaign.report_count}r</span>
                                {campaign.latest_score != null && (
                                  <span className={cn("text-[11px] font-semibold tabular-nums", scoreColor(campaign.latest_score))}>
                                    {campaign.latest_score.toFixed(1)}
                                  </span>
                                )}
                              </div>

                              {/* Campaign reports */}
                              {campExpanded && (
                                <div className="ml-6 border-l border-white/[0.03] pl-3 space-y-0.5 mt-0.5">
                                  {(campaign.reports ?? []).length > 0 ? (
                                    (campaign.reports ?? []).map(report => (
                                      <Link
                                        key={report.job_id}
                                        href={`/analyze/${report.job_id}`}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-all group"
                                        draggable
                                        onDragStart={e => { e.stopPropagation(); setDraggedReport(report.job_id); }}
                                        onDragEnd={() => { setDraggedReport(null); setDragOverTarget(null); }}
                                      >
                                        <FileText className="w-3.5 h-3.5 text-white/20" />
                                        <span className="text-sm text-white/50 truncate flex-1">{shortUrl(report.url)}</span>
                                        {report.score != null && (
                                          <span className={cn("text-[11px] font-semibold tabular-nums", scoreColor(report.score))}>
                                            {report.score.toFixed(1)}
                                          </span>
                                        )}
                                        <ExternalLink className="w-3 h-3 text-white/10 group-hover:text-white/30" />
                                      </Link>
                                    ))
                                  ) : (
                                    <p className="text-[10px] text-white/20 px-3 py-1">No reports yet</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Loose reports in project */}
                        {detail.loose_reports.map(report => (
                          <Link
                            key={report.job_id}
                            href={`/analyze/${report.job_id}`}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-all group"
                            draggable
                            onDragStart={() => setDraggedReport(report.job_id)}
                            onDragEnd={() => { setDraggedReport(null); setDragOverTarget(null); }}
                          >
                            <FileText className="w-3.5 h-3.5 text-white/20" />
                            <span className="text-sm text-white/50 truncate flex-1">{shortUrl(report.url)}</span>
                            {report.score != null && (
                              <span className={cn("text-[11px] font-semibold tabular-nums", scoreColor(report.score))}>
                                {report.score.toFixed(1)}
                              </span>
                            )}
                            <ExternalLink className="w-3 h-3 text-white/10 group-hover:text-white/30" />
                          </Link>
                        ))}

                        {/* Add campaign button */}
                        {creating?.type === "campaign" && creating.parentId === project.id ? (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Folder className="w-3.5 h-3.5 text-teal-400" />
                            <input
                              autoFocus
                              value={newName}
                              onChange={e => setNewName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleCreateCampaign(project.id); if (e.key === "Escape") setCreating(null); }}
                              placeholder="Campaign name..."
                              className="flex-1 bg-transparent border-b border-white/10 text-xs text-white focus:outline-none focus:border-teal-400 py-0.5"
                            />
                            <button onClick={() => handleCreateCampaign(project.id)} className="text-teal-400"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setCreating(null)} className="text-white/30"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setCreating({ type: "campaign", parentId: project.id }); setNewName(""); }}
                            className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-white/20 hover:text-teal-400 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> New Campaign
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Loose reports (not in any project or campaign) */}
              {looseReports.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 px-3 py-2 mb-1">
                    <FileText className="w-4 h-4 text-white/20" />
                    <span className="text-xs text-white/30 uppercase tracking-wider font-medium">Uncategorized Reports</span>
                    <span className="text-[10px] text-white/15">{looseReports.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {looseReports.map(report => (
                      <Link
                        key={report.job_id}
                        href={`/analyze/${report.job_id}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-all group"
                        draggable
                        onDragStart={() => setDraggedReport(report.job_id)}
                        onDragEnd={() => { setDraggedReport(null); setDragOverTarget(null); }}
                      >
                        <FileText className="w-3.5 h-3.5 text-white/15" />
                        <span className="text-sm text-white/40 truncate flex-1">{shortUrl(report.url)}</span>
                        <span className="text-[10px] text-white/15">{report.content_type?.replace("_", " ")}</span>
                        {report.score != null && (
                          <span className={cn("text-[11px] font-semibold tabular-nums", scoreColor(report.score))}>
                            {(report.score).toFixed(1)}
                          </span>
                        )}
                        <span className="text-[10px] text-white/10">{timeAgo(report.created_at)}</span>
                        <ExternalLink className="w-3 h-3 text-white/10 group-hover:text-white/30" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {projects.length === 0 && looseReports.length === 0 && (
                <div className="glass-card p-12 text-center mt-8">
                  <Folder className="w-10 h-10 text-white/10 mx-auto mb-4" />
                  <p className="text-white/30 text-sm mb-2">No projects yet</p>
                  <p className="text-white/15 text-xs mb-6">Create a project to organize your neural analysis reports</p>
                  <Button variant="primary" size="sm" onClick={() => { setCreating({ type: "project" }); setNewName(""); }}>
                    <Plus className="w-3.5 h-3.5" /> Create First Project
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className="fixed z-50 glass-card !p-1 rounded-xl shadow-2xl shadow-black/50 min-w-[160px] animate-fade-up"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === "project" && (
              <>
                <button
                  onClick={() => { setCreating({ type: "campaign", parentId: contextMenu.id }); setNewName(""); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.04] rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> New Campaign
                </button>
                <button
                  onClick={() => { handleDeleteProject(contextMenu.id); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:bg-red-500/[0.06] rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete Project
                </button>
              </>
            )}
          </div>
        )}

        {/* Drag indicator */}
        {draggedReport && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-card !px-4 !py-2 rounded-full text-xs text-white/50 animate-fade-up">
            <FolderInput className="w-3 h-3 inline mr-1.5 text-brand-400" />
            Drop on a project or campaign to move
          </div>
        )}
      </main>
    </div>
  );
}
