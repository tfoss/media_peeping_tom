<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import * as echarts from "echarts";
    import type { TopNResult, Dimension, TimeRange } from "$lib/types";
    import { getTopByDimension } from "$lib/db";

    export let dbReady: boolean = false;

    let videoChartContainer: HTMLDivElement;
    let musicChartContainer: HTMLDivElement;
    let videoChart: echarts.ECharts | null = null;
    let musicChart: echarts.ECharts | null = null;
    let videoData: TopNResult[] = [];
    let musicData: TopNResult[] = [];
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

    onMount(() => {
        window.addEventListener("resize", handleResize);
    });

    onDestroy(() => {
        if (videoChart) videoChart.dispose();
        if (musicChart) musicChart.dispose();
        window.removeEventListener("resize", handleResize);
    });

    function handleResize() {
        videoChart?.resize();
        musicChart?.resize();
    }

    async function loadData() {
        try {
            loading = true;
            error = null;

            const [video, music] = await Promise.all([
                getTopByDimension(
                    selectedDimension,
                    selectedTimeRange,
                    10,
                    "Video",
                ),
                getTopByDimension(
                    selectedDimension,
                    selectedTimeRange,
                    10,
                    "Music",
                ),
            ]);

            videoData = video;
            musicData = music;

            if (videoData.length === 0 && musicData.length === 0) {
                error = "No data for selected filters";
            }

            loading = false;
            await tick();
            renderCharts();
        } catch (e) {
            console.error("[TopN] Error:", e);
            error = e instanceof Error ? e.message : "Failed to load data";
            loading = false;
        }
    }

    function renderCharts() {
        if (videoData.length > 0 && videoChartContainer) {
            if (!videoChart) {
                videoChart = echarts.init(videoChartContainer);
            }
            updateChart(videoChart, videoData, "#667eea", "#764ba2");
        }

        if (musicData.length > 0 && musicChartContainer) {
            if (!musicChart) {
                musicChart = echarts.init(musicChartContainer);
            }
            updateChart(musicChart, musicData, "#009E73", "#56B4E9");
        }
    }

    function updateChart(
        chart: echarts.ECharts,
        data: TopNResult[],
        color1: string,
        color2: string,
    ) {
        if (!chart || data.length === 0) return;

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
                            { offset: 0, color: color1 },
                            { offset: 1, color: color2 },
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
                                    { offset: 0, color: color2 },
                                    { offset: 1, color: color1 },
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

    <div class="charts-row" class:loading class:hidden={!!error}>
        <div class="chart-section">
            <h4>Video</h4>
            <div class="chart-wrapper">
                <div
                    class="chart-container"
                    bind:this={videoChartContainer}
                    class:hidden={videoData.length === 0 && !loading}
                ></div>
                {#if videoData.length === 0 && !loading}
                    <div class="empty-message">No video data</div>
                {/if}
            </div>
        </div>
        <div class="chart-section">
            <h4>Music</h4>
            <div class="chart-wrapper">
                <div
                    class="chart-container"
                    bind:this={musicChartContainer}
                    class:hidden={musicData.length === 0 && !loading}
                ></div>
                {#if musicData.length === 0 && !loading}
                    <div class="empty-message">No music data</div>
                {/if}
            </div>
        </div>
    </div>
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

    h4 {
        margin: 0 0 0.5rem 0;
        color: #555;
        font-size: 0.95rem;
        font-weight: 500;
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

    .error {
        color: #d32f2f;
        text-align: center;
        padding: 2rem;
    }

    .charts-row {
        display: flex;
        gap: 1rem;
        flex: 1;
    }

    .charts-row.loading {
        opacity: 0.5;
    }

    .charts-row.hidden {
        display: none;
    }

    .chart-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .chart-wrapper {
        flex: 1;
        min-height: 300px;
        position: relative;
    }

    .chart-container {
        width: 100%;
        height: 100%;
        min-height: 300px;
    }

    .chart-container.hidden {
        display: none;
    }

    .empty-message {
        width: 100%;
        height: 100%;
        min-height: 300px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #888;
        background: #f9f9f9;
        border-radius: 4px;
    }
</style>
