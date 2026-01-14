<script lang="ts">
    import { tick } from "svelte";
    import * as d3 from "d3";
    import type { MediaSession, MediaType } from "$lib/types";
    import { getRecentSessions } from "$lib/db";

    export let mediaType: MediaType;
    export let dbReady: boolean = false;

    let sessions: MediaSession[] = [];
    let loading = true;
    let error: string | null = null;
    let tableContainer: HTMLDivElement;

    $: if (dbReady) {
        loadData();
    }

    async function loadData() {
        try {
            loading = true;
            error = null;
            console.log(`[${mediaType}] Loading data...`);
            sessions = await getRecentSessions(mediaType, 10);
            console.log(
                `[${mediaType}] Got ${sessions.length} sessions:`,
                sessions,
            );
            loading = false;
            // Wait for DOM to update before rendering table
            await tick();
            console.log(`[${mediaType}] tableContainer:`, tableContainer);
            renderTable();
        } catch (e) {
            console.error(`[${mediaType}] Error:`, e);
            error = e instanceof Error ? e.message : "Failed to load data";
            loading = false;
        }
    }

    function formatDuration(seconds: number | null): string {
        if (seconds === null) return "-";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    function formatTime(date: Date): string {
        return d3.timeFormat("%b %d, %H:%M")(date);
    }

    function renderTable() {
        if (!tableContainer || sessions.length === 0) return;

        // Clear previous content
        d3.select(tableContainer).selectAll("*").remove();

        const table = d3
            .select(tableContainer)
            .append("table")
            .attr("class", "sessions-table");

        // Header
        const headers =
            mediaType === "Music"
                ? ["Title", "Artist", "Device", "Time", "Duration", "%"]
                : ["Title", "Series", "Device", "Time", "Duration", "%"];

        table
            .append("thead")
            .append("tr")
            .selectAll("th")
            .data(headers)
            .enter()
            .append("th")
            .text((d) => d);

        // Body
        const tbody = table.append("tbody");

        const rows = tbody.selectAll("tr").data(sessions).enter().append("tr");

        rows.each(function (session) {
            const row = d3.select(this);
            row.append("td")
                .attr("class", "title")
                .text(session.title || "-");
            row.append("td").text(
                mediaType === "Music"
                    ? session.artist || "-"
                    : session.series_name || "-",
            );
            row.append("td").text(session.device_name || "-");
            row.append("td").text(formatTime(session.session_start));
            row.append("td").text(formatDuration(session.watch_time_seconds));
            row.append("td").text(
                session.completion_pct !== null
                    ? `${Math.round(session.completion_pct)}%`
                    : "-",
            );
        });
    }
</script>

<div class="recent-sessions">
    <h3>{mediaType === "Music" ? "Recent Music" : "Recent Video"}</h3>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if error}
        <div class="error">{error}</div>
    {:else if sessions.length === 0}
        <div class="empty">No sessions found</div>
    {:else}
        <div class="table-container" bind:this={tableContainer}></div>
    {/if}
</div>

<style>
    .recent-sessions {
        background: #fff;
        border-radius: 8px;
        padding: 1rem;
        height: 100%;
        border: 1px solid #e0e0e0;
    }

    h3 {
        margin: 0 0 1rem 0;
        color: #333;
        font-size: 1.1rem;
    }

    .loading,
    .error,
    .empty {
        color: #888;
        text-align: center;
        padding: 2rem;
    }

    .error {
        color: #d32f2f;
    }

    .table-container {
        overflow-x: auto;
    }

    :global(.sessions-table) {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
    }

    :global(.sessions-table th) {
        text-align: left;
        padding: 0.5rem;
        border-bottom: 1px solid #e0e0e0;
        color: #666;
        font-weight: 500;
        white-space: nowrap;
    }

    :global(.sessions-table td) {
        padding: 0.5rem;
        border-bottom: 1px solid #f0f0f0;
        color: #333;
    }

    :global(.sessions-table td.title) {
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    :global(.sessions-table tr:hover) {
        background: rgba(0, 0, 0, 0.02);
    }
</style>
