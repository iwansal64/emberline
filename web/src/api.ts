// EmberLine API client — payloads follow contracts/*.example.json.
// `mock`/`fixture` passthrough from the backend — kept in payloads for provenance, hidden in UI.

export type Envelope = { run_id: string; model_version: string | null; fixture: string | null; mock: boolean; boundary: string; };
export type DayRow = {
  date: string; source_flag: "observed_modis" | "harmonized_viirs" | "gap";
  raw_modis_frp_mw: number | null; raw_modis_n: number | null;
  raw_viirs_frp_mw: number | null; raw_viirs_n: number | null;
  harmonized_lo_mw: number | null; harmonized_estimate_mw: number | null; harmonized_hi_mw: number | null;
  flags: string[]; gap_reason: string | null;
};
export type Series = Envelope & { aoi_id: string; n_days: number; days: DayRow[]; };
export type CalPos = { month_day: string; value_mw: number | null; state: string; source_flag: string | null; flags: string[]; reason?: string | null; index?: number | null; };
export type CalYear = { year: number; eligible: boolean; positions: CalPos[]; };
export type Calendar = Envelope & { years: CalYear[]; climatology: { month_day: string; median_mw: number | null; iqr?: { p25_mw: number; p75_mw: number; } | null; n_years: number; state: string; }[]; climatology_smoothed_median_mw: (number | null)[]; critical_windows: Window[]; index_denominator_p95_training_mw: number; };
export type Window = { start_md: string; end_md: string; wraps_new_year?: boolean; years_active: number | null; years_eligible: number | null; median_intensity_mw?: number; };
export type Preset = { id: string; name: string; west: number; south: number; east: number; north: number; sources: string; start: string; end: string; artifact_status: string; mock: string | null; };
export type Method = Envelope & {
  status?: string;
  status_reason?: string;
  split: { train_years: string[]; test_years: string[]; };
  coefficients: Record<string, number>;
  interval: Record<string, unknown>;
  metrics: Record<string, number | string | null>;
  stress_tests: {
    pseudo_transition?: string;
    transition_date?: string;
    status: string;
    shift_naive?: number | { value: number; };
    shift_harmonized?: number | { value: number; };
    shift_truth_continued_modis?: number | { value: number; };
    error_naive?: number;
    error_harmonized?: number;
    error_ratio?: number | string;
    reason?: string;
    interpretation?: string;
    window?: string[];
  }[];
  limitations: string[];
  citations: string;
};

export type GridYear = { modis: number; viirs: number; n_days: number; };
export type GridCell = { cell_id: string; south: number; west: number; north: number; east: number; years?: Record<string, GridYear>; n_days: number; total_modis: number; total_viirs: number; detection_count: number; has_data?: boolean; };
export type Grid = { cell_deg: number; bounds?: { south: number; west: number; north: number; east: number; }; years: string[]; n_cells: number; scale_note: string; cells: GridCell[]; };

export type Detection = { date: string; lat: number; lon: number; frp: number; sensor: "modis" | "viirs"; conf: string; daynight: string; };
export type Detections = { n_detections: number; note: string; detections: Detection[]; };

export type HotspotAnalysisRequest = {
  lat: number;
  lon: number;
  date: string;
  frp: number;
  sensor: "modis" | "viirs";
  conf: string;
  daynight: string;
  region?: string;
  question?: string;
  lang?: string;
};

export type HotspotAnalysisResponse = {
  status: "success" | "fallback" | "error";
  model: string;
  provider: "grok" | "groq" | "heuristic";
  analysis: string;
  telemetry_context: {
    biome: string;
    peatland_susceptibility: string;
    seasonal_climate: string;
    sensor_resolution: string;
    frp_interpretation: string;
  };
  note?: string;
};

async function get<T>(path: string): Promise<T> {
  // Same-origin: vercel.json routes /api/* to the api service; vite proxies /api in dev.
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail?.message || body?.detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ status: string; aois_with_artifacts: string[]; }>("/api/health"),
  presets: () => get<{ presets: Preset[]; }>("/api/aoi/presets"),
  series: (aoi: string) => get<Series>(`/api/aoi/${aoi}/series`),
  calendar: (aoi: string) => get<Calendar>(`/api/aoi/${aoi}/calendar`),
  windows: (aoi: string) => get<{ windows: Window[]; } & Envelope>(`/api/aoi/${aoi}/windows`),
  method: (aoi: string) => get<Method>(`/api/method?aoi=${aoi}`),
  grid: async (aoi: string) => {
    const data = await get<Grid>(`/api/aoi/${aoi}/grid`);
    if (!Array.isArray(data.cells)) {
      throw new Error("Format data grid tidak valid.");
    }
    for (const cell of data.cells) {
      if (!Number.isFinite(cell.detection_count)) {
        cell.detection_count = Math.max(0, Math.round((cell.total_viirs || 0) + (cell.total_modis || 0)));
      }
    }
    return data;
  },
  detections: (aoi: string, bounds?: Pick<GridCell, "west" | "south" | "east" | "north">) => {
    const query = bounds ? `?${new URLSearchParams({
      west: String(bounds.west),
      south: String(bounds.south),
      east: String(bounds.east),
      north: String(bounds.north),
    })}` : "";
    return get<Detections>(`/api/aoi/${aoi}/detections${query}`);
  },
  analyze: (bbox: { west: number; south: number; east: number; north: number; }) =>
    fetch("/api/aoi/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bbox })
    }).then(async r => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.detail?.message || b?.detail || String(r.status));
      return b as { job_id: string; status: string; };
    }),
  analyzeHotspot: (data: HotspotAnalysisRequest) =>
    fetch("/api/ai/analyze-hotspot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.detail?.message || b?.detail || String(r.status));
      return b as HotspotAnalysisResponse;
    }),
  job: (id: string) => get<{ job_id: string; status: string; progress_pct?: number; stage?: string; error?: { message: string; }; }>(`/api/jobs/${id}`),
};
