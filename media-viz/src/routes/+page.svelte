<script lang="ts">
    import { onMount } from "svelte";
    import { initDB } from "$lib/db";
    import RecentSessions from "$lib/components/RecentSessions.svelte";
    import TopNChart from "$lib/components/TopNChart.svelte";
    import Timeline from "$lib/components/Timeline.svelte";

    let dbReady = false;
    let initError: string | null = null;

    onMount(async () => {
        try {
            await initDB();
            dbReady = true;
        } catch (e) {
            initError =
                e instanceof Error
                    ? e.message
                    : "Failed to initialize database";
            console.error("DB init error:", e);
        }
    });
</script>

<svelte:head>
    <title>Media Consumption Dashboard</title>
</svelte:head>

<div class="dashboard">
    <header>
        <h1>Media Consumption Dashboard</h1>
    </header>

    {#if initError}
        <div class="init-error">
            <p>Failed to load data: {initError}</p>
            <p>Make sure the parquet file is accessible.</p>
        </div>
    {:else if !dbReady}
        <div class="init-loading">
            <div class="spinner"></div>
            <p>Loading database...</p>
        </div>
    {:else}
        <main>
            <section class="timeline-section">
                <Timeline {dbReady} />
            </section>

            <section class="chart-section">
                <TopNChart {dbReady} />
            </section>

            <section class="recent-sessions-grid">
                <RecentSessions mediaType="Music" {dbReady} />
                <RecentSessions mediaType="Video" {dbReady} />
            </section>
        </main>
    {/if}
</div>

<style>
    .dashboard {
        min-height: 100vh;
        background: #f5f5f5;
        color: #333;
        padding: 1rem;
    }

    header {
        text-align: center;
        margin-bottom: 2rem;
    }

    h1 {
        font-size: 1.8rem;
        font-weight: 600;
        color: #333;
        margin: 0;
    }

    main {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .recent-sessions-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 1.5rem;
    }

    .chart-section {
        min-height: 400px;
    }

    .init-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 50vh;
        gap: 1rem;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e0e0e0;
        border-top-color: #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .init-error {
        text-align: center;
        padding: 2rem;
        background: #fff;
        border-radius: 8px;
        max-width: 500px;
        border: 1px solid #e0e0e0;
        margin: 2rem auto;
    }

    .init-error p:first-child {
        color: #d32f2f;
        font-weight: 500;
    }

    @media (max-width: 600px) {
        .recent-sessions-grid {
            grid-template-columns: 1fr;
        }

        h1 {
            font-size: 1.4rem;
        }
    }
</style>
