<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import * as echarts from "echarts";
    import type { TopNResult, Dimension, TimeRange } from "$lib/types";
    import { getTopByDimension } from "$lib/db";

    export let dbReady: boolean = false;

    let chartContainer: HTMLDivElement;
    let chart: echarts.ECharts | null = null;
    let data: TopNResult[] = [];
    let loading = true;
    let error: string | null = null;

    let selectedDimension: Dimension = "artist";
    let selectedTimeRange: TimeRange = "week";

    const dimensions: { value: Dimension; label: string }[] = [
        { value: "artist", label: "Artist" },
        { value: "device_name", label: "Device" },
        { value: "title", label: "Title" },
        { value: "album", label: "Album" },
        { value: "series_name", label: "Series" },
    ];

    const timeRanges: { value: TimeRange; label: string }[] = [
        { value: "day", label: "Last 24 Hours" },
        { value: "week", label: "Last Week" },
        { value: "month", label: "Last Month" },
    ];

    $: if (dbReady) {
        loadData();
    }

    $: if (data.length > 0 && chartContainer) {
        // Initialize chart if not already done, then update
        if (!chart) {
            console.log("[TopN] Initializing chart...");
            chart = echarts.init(chartContainer);
            window.addEventListener("resize", handleResize);
        }
        console.log("[TopN] Updating chart with data:", data.length);
        updateChart();
    }

    onMount(() => {
        // Chart will be initialized reactively when chartContainer and data are ready
    });

    onDestroy(() => {
        if (chart) {
            chart.dispose();
        }
        window.removeEventListener("resize", handleResize);
    });

    function handleResize() {
        chart?.resize();
    }

    async function loadData() {
        try {
            loading = true;
            error = null;
            console.log(
                `[TopN] Loading ${selectedDimension} for ${selectedTimeRange}...`,
            );
            data = await getTopByDimension(
                selectedDimension,
                selectedTimeRange,
                10,
            );
            console.log(`[TopN] Got ${data.length} results:`, data);
            if (data.length === 0) {
                error = "No data for selected filters";
            }
        } catch (e) {
            console.error("[TopN] Error:", e);
            error = e instanceof Error ? e.message : "Failed to load data";
        } finally {
            loading = false;
        }
    }

    function updateChart() {
        if (!chart) return;

        const option: echarts.EChartsOption = {
            animation: false,
            backgroundColor: "#fff",
            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "shadow",
                },
            },
            grid: {
                left: "3%",
                right: "4%",
                bottom: "3%",
                top: "3%",
                containLabel: true,
            },
            xAxis: {
                type: "value",
                axisLabel: {
                    color: "#333",
                },
                axisLine: {
                    lineStyle: { color: "#ccc" },
                },
                splitLine: {
                    lineStyle: { color: "#eee" },
                },
            },
            yAxis: {
                type: "category",
                data: data.map((d) => d.label).reverse(),
                axisLabel: {
                    color: "#333",
                    width: 150,
                    overflow: "truncate",
                    ellipsis: "...",
                },
                axisLine: {
                    lineStyle: { color: "#ccc" },
                },
            },
            series: [
                {
                    name: "Count",
                    type: "bar",
                    data: data.map((d) => d.count).reverse(),
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: "#667eea" },
                            { offset: 1, color: "#764ba2" },
                        ]),
                        borderRadius: [0, 4, 4, 0],
                    },
                    emphasis: {
                        itemStyle: {
                            color: new echarts.graphic.LinearGradient(
                                0,
                                0,
                                1,
                                0,
                                [
                                    { offset: 0, color: "#764ba2" },
                                    { offset: 1, color: "#f093fb" },
                                ],
                            ),
                        },
                    },
                },
            ],
        };

        chart.setOption(option);
    }

    function handleDimensionChange(event: Event) {
        selectedDimension = (event.target as HTMLSelectElement)
            .value as Dimension;
        loadData();
    }

    function handleTimeRangeChange(event: Event) {
        selectedTimeRange = (event.target as HTMLSelectElement)
            .value as TimeRange;
        loadData();
    }
</script>

<div class="top-n-chart">
    <div class="header">
        <h3>
            Top by {dimensions.find((d) => d.value === selectedDimension)
                ?.label}
        </h3>
        <div class="controls">
            <select value={selectedDimension} on:change={handleDimensionChange}>
                {#each dimensions as dim}
                    <option value={dim.value}>{dim.label}</option>
                {/each}
            </select>
            <select value={selectedTimeRange} on:change={handleTimeRangeChange}>
                {#each timeRanges as range}
                    <option value={range.value}>{range.label}</option>
                {/each}
            </select>
        </div>
    </div>

    {#if error}
        <div class="error">{error}</div>
    {/if}
    <div
        class="chart-container"
        bind:this={chartContainer}
        class:loading
        class:hidden={!!error}
    ></div>
</div>

<style>
    .top-n-chart {
        background: #fff;
        border-radius: 8px;
        padding: 1rem;
        height: 100%;
        display: flex;
        flex-direction: column;
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
        gap: 0.5rem;
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
    .error {
        color: #888;
        text-align: center;
        padding: 2rem;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .error {
        color: #d32f2f;
    }

    .chart-container {
        flex: 1;
        min-height: 300px;
    }

    .chart-container.loading {
        opacity: 0.5;
    }

    .chart-container.hidden {
        display: none;
    }
</style>
