<script lang="ts">
    import { tick } from "svelte";
    import * as d3 from "d3";
    import { getTimelineSessions, type TimelineSession } from "$lib/db";

    export let dbReady: boolean = false;

    let container: HTMLDivElement;
    let sessions: TimelineSession[] = [];
    let loading = true;
    let error: string | null = null;

    // Default to last 24 hours
    let endDate = new Date();
    let startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    // Track if we're viewing "now" or a custom offset
    let offsetDays = 0;

    const timeRangeOptions = [
        { value: "day", label: "24 Hours" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
    ];
    let selectedTimeRange = "day";

    $: if (dbReady) {
        loadData();
    }

    // Check if we can go forward (only if we're not at "now")
    $: canGoForward = offsetDays > 0;

    function updateDateRange() {
        const now = new Date();
        // Apply offset
        endDate = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);

        if (selectedTimeRange === "day") {
            startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        } else if (selectedTimeRange === "week") {
            startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else {
            startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    }

    function goBack() {
        if (selectedTimeRange === "day") {
            offsetDays += 1;
        } else if (selectedTimeRange === "week") {
            offsetDays += 7;
        } else {
            offsetDays += 30;
        }
        loadData();
    }

    function goForward() {
        if (selectedTimeRange === "day") {
            offsetDays = Math.max(0, offsetDays - 1);
        } else if (selectedTimeRange === "week") {
            offsetDays = Math.max(0, offsetDays - 7);
        } else {
            offsetDays = Math.max(0, offsetDays - 30);
        }
        loadData();
    }

    function goToNow() {
        offsetDays = 0;
        loadData();
    }

    async function loadData() {
        try {
            loading = true;
            error = null;
            updateDateRange();
            console.log(`[Timeline] Loading from ${startDate} to ${endDate}`);
            sessions = await getTimelineSessions(startDate, endDate);
            console.log(`[Timeline] Got ${sessions.length} sessions`);
            if (sessions.length > 0) {
                console.log(`[Timeline] First session:`, sessions[0]);
                console.log(
                    `[Timeline] First session start (local):`,
                    sessions[0].session_start.toLocaleString(),
                );
            }
            loading = false;
            await tick();
            renderTimeline();
        } catch (e) {
            console.error("[Timeline] Error:", e);
            error = e instanceof Error ? e.message : "Failed to load data";
            loading = false;
        }
    }

    function handleTimeRangeChange(event: Event) {
        selectedTimeRange = (event.target as HTMLSelectElement).value;
        loadData();
    }

    function formatDuration(seconds: number | null): string {
        if (seconds === null) return "Unknown";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        if (mins >= 60) {
            const hrs = Math.floor(mins / 60);
            const remainMins = mins % 60;
            return `${hrs}h ${remainMins}m`;
        }
        return `${mins}m ${secs}s`;
    }

    function renderTimeline() {
        if (!container || sessions.length === 0) return;

        // Clear previous content
        d3.select(container).selectAll("*").remove();

        // Get unique devices and apps
        const devices = [...new Set(sessions.map((s) => s.device_name))].sort();
        const apps = [
            ...new Set(sessions.map((s) => s.app || "Unknown")),
        ].sort();

        // Color scale for apps - Okabe-Ito colorblind-friendly palette (black last)
        const okabeIto = [
            "#E69F00", // orange
            "#56B4E9", // sky blue
            "#009E73", // bluish green
            "#F0E442", // yellow
            "#0072B2", // blue
            "#D55E00", // vermillion
            "#CC79A7", // reddish purple
            "#000000", // black
        ];

        // Create a map of app to color index and cycle info
        const appStyleMap = new Map<string, { color: string; cycle: number }>();
        apps.forEach((app, i) => {
            const colorIndex = i % okabeIto.length;
            const cycle = Math.floor(i / okabeIto.length);
            appStyleMap.set(app, { color: okabeIto[colorIndex], cycle });
        });

        const getAppColor = (app: string) =>
            appStyleMap.get(app)?.color || okabeIto[0];
        const getAppCycle = (app: string) => appStyleMap.get(app)?.cycle || 0;

        // Dimensions - calculate left margin based on longest device name
        const maxDeviceNameLength = Math.max(...devices.map((d) => d.length));
        const leftMargin = Math.max(150, maxDeviceNameLength * 8 + 20);
        const margin = { top: 40, right: 30, bottom: 30, left: leftMargin };
        const width = container.clientWidth - margin.left - margin.right;
        const rowHeight = 40;
        const height = devices.length * rowHeight;

        // Create SVG
        const svg = d3
            .select(container)
            .append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3
            .scaleTime()
            .domain([startDate, endDate])
            .range([0, width]);

        const yScale = d3
            .scaleBand()
            .domain(devices)
            .range([0, height])
            .padding(0.3);

        // Time-of-day shading - alternating 6hr blocks
        // 12am-6am, 6am-12pm, 12pm-6pm, 6pm-12am
        function get6HourBlock(hour: number): number {
            return Math.floor(hour / 6); // 0, 1, 2, or 3
        }

        // Generate 6-hour time periods
        const timePeriods: { start: Date; end: Date; block: number }[] = [];
        let current = new Date(startDate);
        // Align to 6-hour boundary
        const currentHour = current.getHours();
        const blockStart = Math.floor(currentHour / 6) * 6;
        current.setHours(blockStart, 0, 0, 0);

        while (current < endDate) {
            const hour = current.getHours();
            const block = get6HourBlock(hour);
            const periodStart = new Date(current);
            const periodEnd = new Date(current);
            periodEnd.setHours(periodEnd.getHours() + 6);

            timePeriods.push({
                start: periodStart < startDate ? startDate : periodStart,
                end: periodEnd > endDate ? endDate : periodEnd,
                block,
            });

            current = periodEnd;
        }

        // Draw time-of-day backgrounds
        svg.selectAll(".time-bg")
            .data(timePeriods)
            .enter()
            .append("rect")
            .attr("class", "time-bg")
            .attr("x", (d) => xScale(d.start))
            .attr("y", 0)
            .attr("width", (d) => Math.max(0, xScale(d.end) - xScale(d.start)))
            .attr("height", height)
            .style("fill", (d) =>
                d.block % 2 === 0
                    ? "rgba(40, 60, 120, 0.06)"
                    : "rgba(255, 255, 255, 0)",
            )
            .style("pointer-events", "none");

        // X Axis
        const xAxis = d3
            .axisTop(xScale)
            .ticks(
                d3.timeHour.every(
                    selectedTimeRange === "day"
                        ? 2
                        : selectedTimeRange === "week"
                          ? 12
                          : 24,
                ),
            )
            .tickFormat(() => ""); // We'll add custom labels

        const xAxisGroup = svg.append("g").attr("class", "x-axis").call(xAxis);

        // Add multiline tick labels
        const tickValues = xScale.ticks(
            d3.timeHour.every(
                selectedTimeRange === "day"
                    ? 2
                    : selectedTimeRange === "week"
                      ? 12
                      : 24,
            ),
        );

        xAxisGroup.selectAll(".tick").each(function (d) {
            const tick = d3.select(this);
            const date = d as Date;

            tick.select("text").remove(); // Remove empty text

            if (selectedTimeRange === "day") {
                const hour = date.getHours();
                if (hour === 0) {
                    // Midnight - show day above time
                    const text = tick
                        .append("text")
                        .attr("text-anchor", "middle")
                        .style("font-size", "11px")
                        .style("fill", "#666");

                    text.append("tspan")
                        .attr("x", 0)
                        .attr("y", -18)
                        .text(d3.timeFormat("%a")(date));

                    text.append("tspan")
                        .attr("x", 0)
                        .attr("y", -6)
                        .text(d3.timeFormat("%I%p")(date));
                } else {
                    // Regular hour - single line
                    tick.append("text")
                        .attr("y", -9)
                        .attr("text-anchor", "middle")
                        .style("font-size", "11px")
                        .style("fill", "#666")
                        .text(d3.timeFormat("%I%p")(date));
                }
            } else {
                // Two lines for week/month view
                const text = tick
                    .append("text")
                    .attr("text-anchor", "middle")
                    .style("font-size", "11px")
                    .style("fill", "#666");

                text.append("tspan")
                    .attr("x", 0)
                    .attr("y", -18)
                    .text(d3.timeFormat("%a")(date));

                text.append("tspan")
                    .attr("x", 0)
                    .attr("y", -6)
                    .text(d3.timeFormat("%I%p")(date));
            }
        });

        svg.selectAll(".x-axis path, .x-axis line").style("stroke", "#ccc");

        // Y Axis (device names)
        svg.append("g")
            .attr("class", "y-axis")
            .selectAll("text")
            .data(devices)
            .enter()
            .append("text")
            .attr("x", -10)
            .attr("y", (d) => (yScale(d) ?? 0) + yScale.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .style("font-size", "13px")
            .style("fill", "#333")
            .text((d) => d);

        // Horizontal grid lines
        svg.selectAll(".grid-line")
            .data(devices)
            .enter()
            .append("line")
            .attr("class", "grid-line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", (d) => (yScale(d) ?? 0) + yScale.bandwidth() / 2)
            .attr("y2", (d) => (yScale(d) ?? 0) + yScale.bandwidth() / 2)
            .style("stroke", "#e0e0e0")
            .style("stroke-width", 1);

        // Tooltip - append to body for proper positioning
        // Remove any existing tooltip first
        d3.select("body").selectAll(".timeline-tooltip").remove();

        const tooltip = d3
            .select("body")
            .append("div")
            .attr("class", "timeline-tooltip")
            .style("position", "fixed")
            .style("visibility", "hidden")
            .style("background", "#fff")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("padding", "8px 12px")
            .style("font-size", "12px")
            .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("max-width", "300px");

        // Minimum visual width for sessions (in pixels)
        const minWidth = 10;

        // Session pills
        svg.selectAll(".session")
            .data(sessions)
            .enter()
            .append("rect")
            .attr("class", "session")
            .attr("x", (d) => {
                const x = xScale(d.session_start);
                const calculatedWidth = Math.max(
                    xScale(d.session_end) - xScale(d.session_start),
                    minWidth,
                );
                // Center the pill if it's using minimum width
                if (
                    xScale(d.session_end) - xScale(d.session_start) <
                    minWidth
                ) {
                    return x - minWidth / 2;
                }
                return x;
            })
            .attr(
                "y",
                (d) =>
                    (yScale(d.device_name) ?? 0) + yScale.bandwidth() / 2 - 8,
            )
            .attr("width", (d) =>
                Math.max(
                    xScale(d.session_end) - xScale(d.session_start),
                    minWidth,
                ),
            )
            .attr("height", 16)
            .attr("rx", 8)
            .attr("ry", 8)
            .style("fill", (d) => getAppColor(d.app || "Unknown"))
            .style("fill-opacity", (d) => {
                const cycle = getAppCycle(d.app || "Unknown");
                // Reduce opacity for each cycle: 0.6, 0.4, 0.25
                return cycle === 0 ? 0.6 : cycle === 1 ? 0.4 : 0.25;
            })
            .style("stroke", (d) => {
                const cycle = getAppCycle(d.app || "Unknown");
                // Add stroke for cycles > 0
                return cycle > 0 ? getAppColor(d.app || "Unknown") : "none";
            })
            .style("stroke-width", (d) => {
                const cycle = getAppCycle(d.app || "Unknown");
                // Thicker stroke for cycle 2+
                return cycle === 1 ? 1.5 : cycle > 1 ? 2.5 : 0;
            })
            .style("stroke-dasharray", (d) => {
                const cycle = getAppCycle(d.app || "Unknown");
                // Dashed stroke for cycle 2+
                return cycle > 1 ? "3,2" : "none";
            })
            .style("cursor", "pointer")
            .on("mouseover", function (event, d) {
                d3.select(this).style("fill-opacity", 0.9);

                const title = d.title || "Unknown";
                const artist = d.artist || d.series_name || "";
                const startTime = d3.timeFormat("%a %b %d, %I:%M %p")(
                    d.session_start,
                );
                const endTime = d3.timeFormat("%I:%M %p")(d.session_end);
                const durationSecs = d.watch_time_seconds ?? 0;
                const isLongSession = durationSecs >= 3600; // 1 hour or more
                const duration = formatDuration(d.watch_time_seconds);
                const completion = d.completion_pct
                    ? `${Math.round(d.completion_pct)}%`
                    : "";

                let html = `<strong>${title}</strong>`;
                if (artist)
                    html += `<br><span style="color:#666">${artist}</span>`;
                if (isLongSession) {
                    html += `<br><span style="color:#888">${startTime} - ${endTime}</span>`;
                } else {
                    html += `<br><span style="color:#888">${startTime}</span>`;
                }
                html += `<br>Duration: ${duration}`;
                if (completion) html += ` (${completion})`;
                html += `<br><span style="color:#999">${d.media_type}${d.app ? ` - ${d.app}` : ""}</span>`;

                tooltip.html(html).style("visibility", "visible");
            })
            .on("mousemove", function (event) {
                tooltip
                    .style("top", event.clientY + 10 + "px")
                    .style("left", event.clientX + 10 + "px");
            })
            .on("mouseout", function (event, d) {
                const cycle = getAppCycle(d.app || "Unknown");
                const opacity = cycle === 0 ? 0.6 : cycle === 1 ? 0.4 : 0.25;
                d3.select(this).style("fill-opacity", opacity);
                tooltip.style("visibility", "hidden");
            });

        // Legend
        const legendContainer = d3
            .select(container)
            .append("div")
            .attr("class", "legend")
            .style("display", "flex")
            .style("flex-wrap", "wrap")
            .style("gap", "12px")
            .style("margin-top", "16px")
            .style("padding-left", `${margin.left}px`);

        apps.forEach((app) => {
            const cycle = getAppCycle(app);
            const color = getAppColor(app);
            const opacity = cycle === 0 ? 0.6 : cycle === 1 ? 0.4 : 0.25;

            const item = legendContainer
                .append("div")
                .style("display", "flex")
                .style("align-items", "center")
                .style("gap", "6px");

            const swatch = item
                .append("div")
                .style("width", "16px")
                .style("height", "12px")
                .style("border-radius", "3px")
                .style("background", color)
                .style("opacity", String(opacity));

            // Add border styling for cycles > 0
            if (cycle > 0) {
                swatch
                    .style("border", `1.5px solid ${color}`)
                    .style("box-sizing", "border-box");
            }
            if (cycle > 1) {
                swatch.style("border-style", "dashed");
            }

            item.append("span")
                .style("font-size", "12px")
                .style("color", "#666")
                .text(app);
        });
    }

    // Re-render on window resize
    function handleResize() {
        if (sessions.length > 0 && container) {
            renderTimeline();
        }
    }
</script>

<svelte:window on:resize={handleResize} />

<div class="timeline-chart">
    <div class="header">
        <h3>
            Activity Timeline <span class="date-display"
                >({#if selectedTimeRange === "day"}{endDate.toLocaleDateString(
                        "en-US",
                        { weekday: "short", month: "short", day: "numeric" },
                    )}{:else}{startDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                    })} – {endDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                    })}{/if})</span
            >
        </h3>
        <div class="controls">
            <div class="nav-buttons">
                <button class="nav-btn" on:click={goBack} title="Go back">
                    ←
                </button>
                <button
                    class="nav-btn now-btn"
                    on:click={goToNow}
                    disabled={!canGoForward}
                    title="Go to now"
                >
                    Now
                </button>
                <button
                    class="nav-btn"
                    on:click={goForward}
                    disabled={!canGoForward}
                    title="Go forward"
                >
                    →
                </button>
            </div>
            <select value={selectedTimeRange} on:change={handleTimeRangeChange}>
                {#each timeRangeOptions as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else if error}
        <div class="error">{error}</div>
    {:else if sessions.length === 0}
        <div class="empty">No sessions in selected time range</div>
    {:else}
        <div class="chart-container" bind:this={container}></div>
    {/if}
</div>

<style>
    .timeline-chart {
        background: #fff;
        border-radius: 8px;
        padding: 1rem;
        border: 1px solid #e0e0e0;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    h3 {
        margin: 0;
        color: #333;
        font-size: 1.1rem;
    }

    .controls {
        display: flex;
        gap: 0.75rem;
        align-items: center;
    }

    .nav-buttons {
        display: flex;
        gap: 0.25rem;
    }

    .nav-btn {
        background: #fff;
        color: #333;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 0.5rem 0.75rem;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .nav-btn:hover:not(:disabled) {
        border-color: #667eea;
        background: #f5f7ff;
    }

    .nav-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }

    .now-btn {
        font-size: 0.8rem;
        padding: 0.5rem 0.6rem;
    }

    .date-display {
        font-weight: 400;
        color: #666;
    }

    select {
        background: #fff;
        color: #333;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        cursor: pointer;
    }

    select:hover {
        border-color: #667eea;
    }

    select:focus {
        outline: none;
        border-color: #667eea;
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

    .chart-container {
        overflow-x: auto;
        position: relative;
    }
</style>
