export interface MediaSession {
	device_name: string | null;
	title: string | null;
	artist: string | null;
	album: string | null;
	series_name: string | null;
	season: number | null;
	episode: number | null;
	media_type: string;
	app: string | null;
	user_name: string | null;
	address: string | null;
	device_model: string | null;
	session_start: Date;
	session_end: Date;
	max_position_reached: number | null;
	media_duration: number | null;
	watch_time_seconds: number | null;
	completion_pct: number | null;
	num_entries: number;
	session_id: number;
}

export interface TopNResult {
	label: string;
	count: number;
}

export type Dimension = 'artist' | 'device_name' | 'title' | 'album' | 'series_name';
export type TimeRange = 'day' | 'week' | 'month';
export type MediaType = 'Music' | 'Video';
