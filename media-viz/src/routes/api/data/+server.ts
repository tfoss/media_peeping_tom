import type { RequestHandler } from './$types';

const PARQUET_URL = 'https://pub-607c4046dbc4449a97bbb25f716639d5.r2.dev/viewing_sessions.parquet';

export const GET: RequestHandler = async ({ fetch }) => {
	const response = await fetch(PARQUET_URL);

	if (!response.ok) {
		return new Response('Failed to fetch parquet file', { status: response.status });
	}

	const data = await response.arrayBuffer();

	return new Response(data, {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'public, max-age=300'
		}
	});
};
