import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, Preset, Detections, Detection, Grid, GridCell, HotspotAnalysisResponse } from "../api";
import { useAoi } from "../App";
import SearchableSelect from "../components/SearchableSelect";

function MarkdownView({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inBlockquote = false;
  let quoteLines: string[] = [];
  let tableRows: string[] = [];

  const flushQuote = (key: number) => {
    if (quoteLines.length > 0) {
      elements.push(
        <blockquote key={`quote-${key}`}>
          {quoteLines.map((ql, i) => (
            <p key={i}>{formatInline(ql)}</p>
          ))}
        </blockquote>
      );
      quoteLines = [];
    }
  };

  const flushTable = (key: number) => {
    if (tableRows.length > 0) {
      const parsedRows = tableRows
        .map(r => r.trim())
        .filter(r => r.startsWith("|") && r.endsWith("|"))
        .map(r => r.slice(1, -1).split("|").map(c => c.trim()));

      if (parsedRows.length >= 2) {
        const header = parsedRows[0];
        const isSep = parsedRows[1].every(c => /^[-:\s]+$/.test(c));
        const bodyRows = isSep ? parsedRows.slice(2) : parsedRows.slice(1);

        elements.push(
          <div key={`table-wrap-${key}`} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table className="ai-markdown-table">
              <thead>
                <tr>
                  {header.map((th, thi) => (
                    <th key={thi}>{formatInline(th)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((td, tdi) => (
                      <td key={tdi}>{formatInline(td)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableRows = [];
    }
  };

  const formatInline = (text: string): React.ReactNode => {
    const rawParts = text.split(/<br\s*\/?>/gi);
    return rawParts.map((rawPart, rawIdx) => {
      const parts = rawPart.split(/(\*\*[^*]+\*\*)/g);
      const rendered = parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });
      return (
        <span key={rawIdx}>
          {rawIdx > 0 && <br />}
          {rendered}
        </span>
      );
    });
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const trimmed = lines[idx].trim();

    // Markdown table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (inBlockquote) { inBlockquote = false; flushQuote(idx); }
      tableRows.push(trimmed);
      continue;
    } else if (tableRows.length > 0) {
      flushTable(idx);
    }

    if (trimmed.startsWith(">")) {
      inBlockquote = true;
      quoteLines.push(trimmed.replace(/^>\s*/, ""));
      continue;
    } else if (inBlockquote) {
      inBlockquote = false;
      flushQuote(idx);
    }

    if (!trimmed) continue;

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={idx}>{formatInline(trimmed.replace(/^###\s+/, ""))}</h4>
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={idx}>{formatInline(trimmed.replace(/^##\s+/, ""))}</h3>
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={idx}>{formatInline(trimmed.replace(/^#\s+/, ""))}</h2>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <li key={idx}>{formatInline(trimmed.replace(/^[-*]\s+/, ""))}</li>
      );
    } else if (/^\d+\.\s+/.test(trimmed)) {
      elements.push(
        <li key={idx}>{formatInline(trimmed.replace(/^\d+\.\s+/, ""))}</li>
      );
    } else {
      elements.push(<p key={idx}>{formatInline(trimmed)}</p>);
    }
  }

  if (tableRows.length > 0) flushTable(lines.length);
  if (inBlockquote) flushQuote(lines.length);

  return <div className="ai-markdown-body">{elements}</div>;
}

const REGIONS: { name: string; center: [number, number]; preset?: string }[] = [
  { name: "Kalimantan Tengah", center: [-1.8, 113.8], preset: "central_kalimantan" },
  { name: "Riau", center: [0.6, 102.0], preset: "riau" },
  { name: "Sumatera Selatan", center: [-3.3, 104.6], preset: "south_sumatra" },
  { name: "Jambi", center: [-1.8, 103.0], preset: "jambi" },
  { name: "Papua Selatan (Merauke)", center: [-8.0, 139.0], preset: "merauke" },
  { name: "Aceh", center: [4.6, 96.7] },
  { name: "Sumatera Utara", center: [2.2, 98.7] },
  { name: "Sumatera Barat", center: [-0.5828, 100.6133] },
  { name: "Bengkulu", center: [-3.7928, 102.2608] },
  { name: "Lampung", center: [-4.8555, 105.0273] },
  { name: "Kepulauan Riau", center: [0.9, 104.5] },
  { name: "Kepulauan Bangka Belitung", center: [-2.5, 106.0] },
  { name: "Banten", center: [-6.4454, 106.1376] },
  { name: "DKI Jakarta", center: [-6.1754, 106.8272] },
  { name: "Jawa Barat", center: [-6.8892, 107.6405] },
  { name: "Jawa Tengah", center: [-7.3032, 110.0044] },
  { name: "DI Yogyakarta", center: [-7.9778, 110.3672] },
  { name: "Jawa Timur", center: [-7.6977, 112.4914] },
  { name: "Bali", center: [-8.2271, 115.1919] },
  { name: "Nusa Tenggara Barat", center: [-8.7893, 117.1462] },
  { name: "Nusa Tenggara Timur", center: [-8.5657, 120.6979] },
  { name: "Kalimantan Barat", center: [0.2, 109.5] },
  { name: "Kalimantan Selatan", center: [-3.0, 115.5] },
  { name: "Kalimantan Timur", center: [0.5, 116.5] },
  { name: "Kalimantan Utara", center: [2.5, 116.8] },
  { name: "Sulawesi Utara", center: [0.9, 124.2] },
  { name: "Gorontalo", center: [0.6, 122.4] },
  { name: "Sulawesi Tengah", center: [-1.4, 120.4] },
  { name: "Sulawesi Selatan", center: [-3.8, 119.9] },
  { name: "Sulawesi Barat", center: [-2.4975, 119.3919] },
  { name: "Sulawesi Tenggara", center: [-3.5491, 121.7280] },
  { name: "Maluku", center: [-3.1188, 129.4208] },
  { name: "Maluku Utara", center: [1.6, 127.6] },
  { name: "Papua", center: [-4.0, 138.5] },
  { name: "Papua Barat", center: [-2.8554, 133.4738] },
  { name: "Papua Barat Daya", center: [-1.0986, 131.3525] },
  { name: "Papua Tengah", center: [-3.8642, 136.3733] },
  { name: "Papua Pegunungan", center: [-4.2478, 139.3725] },
];

export const PROVINCE_TO_PRESET: Record<string, string> = {
  "Kalimantan Tengah": "central_kalimantan",
  "Riau": "riau",
  "Sumatera Selatan": "south_sumatra",
  "Jambi": "jambi",
  "Papua Selatan (Merauke)": "merauke",
  "Aceh": "sumut_aceh",
  "Sumatera Utara": "sumut_aceh",
  "Sumatera Barat": "bengkulu_barat",
  "Bengkulu": "bengkulu_barat",
  "Lampung": "lampung",
  "Kepulauan Riau": "riau",
  "Kepulauan Bangka Belitung": "south_sumatra",
  "Banten": "jawa",
  "DKI Jakarta": "jawa",
  "Jawa Barat": "jawa",
  "Jawa Tengah": "jawa",
  "DI Yogyakarta": "jawa",
  "Jawa Timur": "jawa",
  "Bali": "ntb",
  "Nusa Tenggara Barat": "ntb",
  "Nusa Tenggara Timur": "ntt",
  "Kalimantan Barat": "kalbar",
  "Kalimantan Selatan": "central_kalimantan",
  "Kalimantan Timur": "kaltim",
  "Kalimantan Utara": "kaltim",
  "Sulawesi Utara": "sulsel",
  "Gorontalo": "sulsel",
  "Sulawesi Tengah": "sulsel",
  "Sulawesi Selatan": "sulsel",
  "Sulawesi Barat": "sulsel",
  "Sulawesi Tenggara": "sulsel",
  "Maluku": "maluku",
  "Maluku Utara": "maluku",
  "Papua": "merauke",
  "Papua Barat": "papua_barat",
  "Papua Barat Daya": "papua_barat",
  "Papua Tengah": "merauke",
  "Papua Pegunungan": "merauke",
  "Papua Selatan": "merauke",
};

export type IslandRegion = {
  id: string;
  name: string;
  shortName: string;
  center: [number, number];
  zoom: number;
  bounds: L.LatLngBoundsLiteral;
  polygon: [number, number][];
  defaultPreset?: string;
  defaultProvince: string;
  provinces: string[];
};

export const ISLANDS: IslandRegion[] = [
  {
    id: "sumatera",
    name: "Pulau Sumatera",
    shortName: "Sumatera",
    center: [0.5, 101.8],
    zoom: 6,
    bounds: [[5.9, 95.0], [-6.0, 106.0]],
    polygon: [
      [5.9, 95.2], [5.3, 96.0], [4.0, 98.4], [2.2, 100.3], [1.6, 101.6],
      [1.2, 103.0], [0.8, 104.2], [-1.2, 104.5], [-3.2, 106.0], [-5.8, 105.8],
      [-5.9, 104.4], [-4.2, 102.7], [-2.3, 100.8], [-0.5, 98.7], [2.0, 97.0],
      [5.4, 95.2]
    ],
    defaultPreset: "riau",
    defaultProvince: "Riau",
    provinces: ["Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan", "Bengkulu", "Lampung", "Kepulauan Bangka Belitung"]
  },
  {
    id: "kalimantan",
    name: "Pulau Kalimantan",
    shortName: "Kalimantan",
    center: [-1.4, 113.8],
    zoom: 6,
    bounds: [[4.3, 108.8], [-4.3, 117.8]],
    polygon: [
      [4.3, 117.6], [2.1, 117.9], [0.8, 118.0], [-1.3, 117.1], [-3.7, 116.3],
      [-4.2, 114.6], [-3.5, 112.5], [-3.0, 110.5], [-1.8, 109.9], [0.8, 108.9],
      [2.1, 109.3], [1.3, 112.0], [1.7, 115.5], [3.8, 115.8], [4.3, 117.6]
    ],
    defaultPreset: "central_kalimantan",
    defaultProvince: "Kalimantan Tengah",
    provinces: ["Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara"]
  },
  {
    id: "jawa",
    name: "Pulau Jawa",
    shortName: "Jawa",
    center: [-7.3, 110.0],
    zoom: 7,
    bounds: [[-5.8, 105.1], [-8.9, 114.6]],
    polygon: [
      [-5.9, 106.0], [-6.1, 106.9], [-6.4, 108.5], [-6.8, 110.5], [-6.9, 112.6],
      [-7.0, 114.1], [-7.7, 114.5], [-8.6, 114.4], [-8.4, 112.5], [-8.2, 110.5],
      [-7.8, 108.5], [-7.0, 106.5], [-6.7, 105.2], [-5.9, 106.0]
    ],
    defaultProvince: "Jawa Timur",
    provinces: ["Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur"]
  },
  {
    id: "sulawesi",
    name: "Pulau Sulawesi",
    shortName: "Sulawesi",
    center: [-1.8, 121.0],
    zoom: 6,
    bounds: [[2.0, 118.5], [-6.0, 125.5]],
    polygon: [
      [1.8, 125.0], [0.8, 124.0], [0.9, 121.0], [1.4, 120.8], [-1.0, 119.3],
      [-3.5, 118.8], [-5.6, 119.5], [-5.5, 120.6], [-3.0, 120.4], [-3.0, 121.5],
      [-5.3, 122.8], [-3.7, 122.7], [-1.6, 123.6], [-0.5, 123.3], [-0.3, 120.5],
      [0.8, 121.5], [1.8, 125.0]
    ],
    defaultProvince: "Sulawesi Tengah",
    provinces: ["Sulawesi Utara", "Gorontalo", "Sulawesi Tengah", "Sulawesi Selatan", "Sulawesi Barat", "Sulawesi Tenggara"]
  },
  {
    id: "bali_nusa",
    name: "Bali & Nusa Tenggara",
    shortName: "Bali & Nusa",
    center: [-8.6, 119.5],
    zoom: 7,
    bounds: [[-8.0, 114.4], [-11.0, 125.2]],
    polygon: [
      [-8.0, 114.5], [-8.1, 115.7], [-8.2, 117.0], [-8.2, 119.0], [-8.2, 121.0],
      [-8.2, 123.5], [-8.3, 125.2], [-9.5, 125.1], [-10.5, 124.0], [-10.8, 123.0],
      [-10.0, 120.0], [-9.0, 118.0], [-9.0, 116.0], [-8.8, 114.5], [-8.0, 114.5]
    ],
    defaultProvince: "Bali",
    provinces: ["Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur"]
  },
  {
    id: "maluku",
    name: "Kepulauan Maluku",
    shortName: "Maluku",
    center: [-2.5, 129.5],
    zoom: 6,
    bounds: [[3.0, 125.5], [-8.5, 135.0]],
    polygon: [
      [2.8, 127.5], [2.0, 128.8], [-0.5, 128.5], [-1.8, 130.0], [-3.2, 131.0],
      [-5.5, 132.5], [-7.5, 132.0], [-8.3, 131.0], [-7.5, 128.5], [-4.0, 126.5],
      [-2.0, 125.5], [0.5, 127.0], [2.8, 127.5]
    ],
    defaultProvince: "Maluku Utara",
    provinces: ["Maluku", "Maluku Utara"]
  },
  {
    id: "papua",
    name: "Pulau Papua",
    shortName: "Papua",
    center: [-4.0, 136.0],
    zoom: 6,
    bounds: [[0.0, 130.5], [-9.2, 141.0]],
    polygon: [
      [-0.5, 131.0], [-0.8, 134.0], [-2.3, 135.0], [-1.8, 138.5], [-2.5, 141.0],
      [-9.1, 141.0], [-8.3, 138.5], [-5.0, 138.0], [-4.8, 135.5], [-3.8, 133.5],
      [-4.0, 132.0], [-2.8, 132.0], [-1.5, 130.5], [-0.5, 131.0]
    ],
    defaultProvince: "Papua",
    provinces: ["Papua", "Papua Selatan", "Papua Barat", "Papua Barat Daya", "Papua Tengah", "Papua Pegunungan"]
  }
];

// Indonesia Territorial Bounds (Sabang to Merauke, Miangas to Rote)
// Formatted with widescreen 16:9 margin so fullscreen viewports never collide with bounds constraints
const INDONESIA_BOUNDS: L.LatLngBoundsLiteral = [
  [14.0, 90.0],   // North-West
  [-16.0, 156.0], // South-East
];

export default function FireMap({ goCalendar }: { goCalendar: () => void }) {
  const { aoi, setAoi, calFilter, lang, t } = useAoi();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const allDetectionsRef = useRef<Detections | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const dotsLayerRef = useRef<L.LayerGroup | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const coordRef = useRef<HTMLSpanElement>(null);

  const PRESET_NAMES: Record<string, string> = {
    riau: "Riau",
    central_kalimantan: "Kalimantan Tengah",
    south_sumatra: "Sumatera Selatan",
    jambi: "Jambi",
    merauke: "Papua Selatan (Merauke)",
    kalbar: "Kalimantan Barat",
    kaltim: "Kalimantan Timur",
    papua_selatan: "Papua Selatan",
    sulsel: "Sulawesi Selatan",
    ntt: "Nusa Tenggara Timur",
    ntb: "Nusa Tenggara Barat",
    sumut_aceh: "Sumatera Utara",
    lampung: "Lampung",
    papua_barat: "Papua Barat",
    maluku: "Maluku",
    jawa: "Jawa",
    bengkulu_barat: "Bengkulu",
  };

  const [q, setQ] = useState("");
  const [selName, setSelName] = useState<string | null>(null);

  // Determine initial coordinates: focused on active province or whole Indonesia
  const getInitialCoords = (): { center: [number, number]; zoom: number } => {
    if (!selName) return { center: [-2.5, 118.0], zoom: 5 }; // Whole Indonesia center
    if (aoi === "central_kalimantan") return { center: [-1.8, 113.8], zoom: 7 };
    if (aoi === "south_sumatra") return { center: [-3.3, 104.6], zoom: 7 };
    if (aoi === "jambi") return { center: [-1.8, 103.0], zoom: 7 };
    if (aoi === "riau") return { center: [0.6, 102.0], zoom: 7 };
    if (aoi === "merauke") return { center: [-8.0, 139.0], zoom: 7 };
    return { center: [-2.5, 118.0], zoom: 5 }; // Whole Indonesia center
  };
  const [presets, setPresets] = useState<Preset[]>([]);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [gridOn, setGridOn] = useState(true); // Default ON: full grid displayed directly across the whole map
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState("");
  const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
  const [det, setDet] = useState<Detections | null>(null);
  const [detOn, setDetOn] = useState(true); // Default ON: FIRMS dots are immediately rendered on map load
  const [detLoading, setDetLoading] = useState(false);
  const [detError, setDetError] = useState("");
  const [detYear, setDetYear] = useState("all"); // Default to "all" so all hotspot telemetry is visible immediately
  const [detSensor, setDetSensor] = useState<"all" | "modis" | "viirs">("all");
  const [viewMode, setViewMode] = useState<"both" | "dots" | "grid">("both");
  const [currentZoom, setCurrentZoom] = useState<number>(() => getInitialCoords().zoom);
  const [riskFilter, setRiskFilter] = useState<"all" | "danger" | "alert">("all");
  const [minFrp, setMinFrp] = useState<number>(0);
  const [gridOpacity, setGridOpacity] = useState<number>(0.32);
  const [basemapMode, setBasemapMode] = useState<"osm" | "muted" | "dark">("osm");
  const [contrastPopoverOpen, setContrastPopoverOpen] = useState(false);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const contrastPopoverRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const next = !prev;
      if (next) setContrastPopoverOpen(false);
      return next;
    });
  };

  const curPreset = presets.find(p => p.id === aoi);

  const activeRegionBounds = useMemo(() => {
    if (!selName) return null;
    const r = REGIONS.find(x => x.name === selName);
    if (!r) return null;
    if (r.preset && curPreset) {
      return {
        west: curPreset.west,
        south: curPreset.south,
        east: curPreset.east,
        north: curPreset.north,
      };
    }
    // Province bounds: 1.5 deg lon, 1.2 deg lat around province center
    return {
      west: r.center[1] - 1.5,
      south: r.center[0] - 1.2,
      east: r.center[1] + 1.5,
      north: r.center[0] + 1.2,
    };
  }, [selName, curPreset]);

  const toggleContrastPopover = () => {
    setContrastPopoverOpen(prev => {
      const next = !prev;
      if (next) setSidebarOpen(false);
      return next;
    });
  };

  // AI Telemetry Context Inspector & Grok Integration
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<HotspotAnalysisResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiSubmittedQuestion, setAiSubmittedQuestion] = useState("");
  const lastClickedDetectionRef = useRef<Detection | null>(null);
  const aiDrawerRef = useRef<HTMLDivElement>(null);
  const aiAnswerRef = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);

  const activeAiReqIdRef = useRef<number>(0);
  const activeDetIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isAiDrawerOpenRef = useRef<boolean>(false);

  const getDetectionId = (d: Detection | null) => {
    if (!d) return "";
    return `${d.date}_${d.lat.toFixed(5)}_${d.lon.toFixed(5)}_${d.sensor}_${d.frp.toFixed(2)}`;
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeAiReqIdRef.current++;
    };
  }, []);

  useEffect(() => {
    isAiDrawerOpenRef.current = isAiDrawerOpen;
  }, [isAiDrawerOpen]);

  // When active hotspot changes, cancel active requests and reset AI state
  useEffect(() => {
    activeAiReqIdRef.current++;
    activeDetIdRef.current = getDetectionId(selectedDetection);
    setAiLoading(false);
    setAiResponse(null);
    setAiError(null);
    setAiQuestion("");
    setAiSubmittedQuestion("");
  }, [selectedDetection]);

  const closeAiDrawer = () => {
    activeAiReqIdRef.current++;
    setIsAiDrawerOpen(false);
    setAiLoading(false);
    setAiResponse(null);
    setAiError(null);
    setAiQuestion("");
    setAiSubmittedQuestion("");
  };

  // Smoothly scroll down to AI answer when response arrives
  useEffect(() => {
    if (aiResponse) {
      setTimeout(() => {
        aiAnswerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [aiResponse]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const visibleRowsRef = useRef<Detection[]>([]);

  const triggerAiAnalysis = async (targetDet: Detection, customQuestion?: string) => {
    const targetDetId = getDetectionId(targetDet);
    const reqId = ++activeAiReqIdRef.current;
    activeDetIdRef.current = targetDetId;

    setAiLoading(true);
    setAiError(null);
    setAiResponse(null);

    try {
      const res = await api.analyzeHotspot({
        lat: targetDet.lat,
        lon: targetDet.lon,
        date: targetDet.date,
        frp: targetDet.frp,
        sensor: targetDet.sensor,
        conf: targetDet.conf,
        daynight: targetDet.daynight,
        region: selName || aoi,
        question: customQuestion || undefined,
        lang: lang,
      });

      if (
        !isMountedRef.current ||
        reqId !== activeAiReqIdRef.current ||
        targetDetId !== activeDetIdRef.current ||
        !isAiDrawerOpenRef.current
      ) {
        return;
      }

      setAiResponse(res);
    } catch (err: any) {
      if (
        !isMountedRef.current ||
        reqId !== activeAiReqIdRef.current ||
        targetDetId !== activeDetIdRef.current ||
        !isAiDrawerOpenRef.current
      ) {
        return;
      }
      setAiError(err?.message || (lang === "id" ? "Gagal menghubungi layanan analisis satelit AI." : "Failed to connect to AI satellite telemetry service."));
    } finally {
      if (isMountedRef.current && reqId === activeAiReqIdRef.current) {
        setAiLoading(false);
      }
    }
  };

  const submitAiQuestion = (question: string) => {
    const target = selectedDetection;
    if (!target) return;
    const submittedQuestion = question.trim();
    setAiSubmittedQuestion(submittedQuestion);
    triggerAiAnalysis(target, submittedQuestion || undefined);
  };

  useEffect(() => {
    api.presets().then(r => setPresets(r.presets)).catch(() => { });
  }, []);

  // Isolate UI controls from Leaflet wheel zoom & click propagation
  useEffect(() => {
    if (sidebarRef.current) {
      L.DomEvent.disableScrollPropagation(sidebarRef.current);
      L.DomEvent.disableClickPropagation(sidebarRef.current);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (toolbarRef.current) {
      L.DomEvent.disableScrollPropagation(toolbarRef.current);
      L.DomEvent.disableClickPropagation(toolbarRef.current);
    }
  }, []);

  useEffect(() => {
    if (filterBarRef.current) {
      L.DomEvent.disableScrollPropagation(filterBarRef.current);
      L.DomEvent.disableClickPropagation(filterBarRef.current);
    }
    if (contrastPopoverRef.current) {
      L.DomEvent.disableScrollPropagation(contrastPopoverRef.current);
      L.DomEvent.disableClickPropagation(contrastPopoverRef.current);
    }
  }, [contrastPopoverOpen]);

  useEffect(() => {
    if (aiDrawerRef.current) {
      L.DomEvent.disableScrollPropagation(aiDrawerRef.current);
      L.DomEvent.disableClickPropagation(aiDrawerRef.current);
    }
  }, [isAiDrawerOpen]);

  useEffect(() => {
    (window as any).__emberline_open_ai_analyzer = () => {
      const target = lastClickedDetectionRef.current;
      if (target) {
        setSelectedDetection(target);
        setIsAiDrawerOpen(true);
        triggerAiAnalysis(target);
      }
    };
    return () => {
      delete (window as any).__emberline_open_ai_analyzer;
    };
  }, [selName, aoi, lang]);

  // Sync selected region name only when global AOI actually changes from outside
  const prevAoiRef = useRef(aoi);
  useEffect(() => {
    if (prevAoiRef.current !== aoi) {
      prevAoiRef.current = aoi;
      if (PRESET_NAMES[aoi] && selName !== null) {
        setSelName(PRESET_NAMES[aoi]);
      }
    }
  }, [aoi, selName]);

  // Fullscreen event listener to dynamically resize the map
  useEffect(() => {
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFs(fs);
      setTimeout(() => {
        mapRef.current?.invalidateSize({ pan: false });
      }, 100);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  };

  const findNearestDetection = (latlng: L.LatLng, maxPx: number = 24): Detection | null => {
    const map = mapRef.current;
    const rows = visibleRowsRef.current;
    if (!map || !rows || rows.length === 0) return null;
    const clickPt = map.latLngToContainerPoint(latlng);
    let nearest: Detection | null = null;
    let minDist = maxPx;
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i];
      const pt = map.latLngToContainerPoint([d.lat, d.lon]);
      const dist = Math.hypot(pt.x - clickPt.x, pt.y - clickPt.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = d;
      }
    }
    return nearest;
  };

  const openDetectionInspection = (nearest: Detection, latlng?: L.LatLngExpression) => {
    lastClickedDetectionRef.current = nearest;
    setSelectedDetection(nearest);
    const map = mapRef.current;
    if (!map) return;
    const isViirs = nearest.sensor === "viirs";
    const isEn = langRef.current === "en";
    const overpassText = nearest.daynight === "D"
      ? (isEn ? "Day overpass (~13:30 LT)" : "Lintasan siang (~13:30 LT)")
      : (isEn ? "Night overpass (~01:30 LT)" : "Lintasan malam (~01:30 LT)");
    const precisionText = isEn
      ? `FIRMS coordinate precision (${isViirs ? "375 m" : "1,000 m"})`
      : `Presisi koordinat FIRMS (${isViirs ? "375 m" : "1.000 m"})`;
    const caveatText = isEn
      ? "Spaceborne observation pixel — not proof of physical fire perimeter."
      : "Piksel observasi satelit — bukan klaim batas fisik kebakaran.";
    const askAiButtonText = isEn
      ? "Ask about this detection &rarr;"
      : "Tanya tentang deteksi ini &rarr;";
    const confText = isEn ? "Confidence" : "Keyakinan";

    L.popup({ autoPan: false, closeButton: true })
      .setLatLng(latlng || [nearest.lat, nearest.lon])
      .setContent(
        `<div style="font-size:12px; min-width:210px; line-height:1.5; font-family:var(--font-sans, system-ui);">
          <div style="font-weight:700; color:${isViirs ? "#EF4444" : "#2563EB"}; margin-bottom:4px; display:flex; align-items:center; justify-content:space-between;">
            <span>${isViirs ? "VIIRS (~375 m)" : "MODIS (~1 km)"}</span>
            <span style="font-size:10px; padding:1px 6px; background:rgba(128,128,128,0.15); border-radius:4px; font-weight:600;">${confText}: ${nearest.conf}</span>
          </div>
          <div style="font-size:12px;">FRP: <b>${nearest.frp.toFixed(2)} MW</b></div>
          <div style="font-size:11.5px; color:#666;">${nearest.date} · ${overpassText}</div>
          <div style="font-size:11px; font-family:monospace; color:#222; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px; margin-top:4px;">
            Lat: <b>${nearest.lat.toFixed(5)}°</b> · Lon: <b>${nearest.lon.toFixed(5)}°</b>
          </div>
          <div style="font-size:10px; color:#22c55e; font-weight:600; margin-top:4px;">
            ${precisionText}
          </div>
          <div style="font-size:10px; color:#888; margin-top:4px; border-top:1px dashed rgba(128,128,128,0.3); padding-top:4px; line-height:1.3;">
            ${caveatText}
          </div>
          <button
            type="button"
            onclick="window.__emberline_open_ai_analyzer && window.__emberline_open_ai_analyzer()"
            style="
              width:100%;
              margin-top:8px;
              padding:7px 10px;
              background:#0D9488;
              color:#ffffff;
              border:none;
              border-radius:6px;
              font-weight:600;
              font-size:11px;
              cursor:pointer;
              box-shadow:0 1px 3px rgba(0,0,0,0.25);
              display:flex;
              align-items:center;
              justify-content:center;
              gap:6px;
            "
          >
            <span>${askAiButtonText}</span>
          </button>
        </div>`
      )
      .openOn(map);
  };

  const findNearestDetectionRef = useRef(findNearestDetection);
  findNearestDetectionRef.current = findNearestDetection;
  const openDetectionInspectionRef = useRef(openDetectionInspection);
  openDetectionInspectionRef.current = openDetectionInspection;

  // Initialize Map locked to Indonesia territory (no global wander, seamless tiles)
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;

    const { center, zoom } = getInitialCoords();

    // Keep a small buffer around the viewport while panning.
    const canvasRenderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = canvasRenderer;

    const map = L.map(mapEl.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: true,
      minZoom: 5,
      maxZoom: 13,
      maxBounds: INDONESIA_BOUNDS,
      maxBoundsViscosity: 0.5, // Gentle elastic resistance: prevents rubber-band fighting in fullscreen 16:9
      zoomAnimation: true,
      zoomAnimationThreshold: 4,
      fadeAnimation: true,
      markerZoomAnimation: true,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 40,
      renderer: canvasRenderer,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Fast Topography basemap (OpenStreetMap) with 3-tile buffer
    const tileLayer = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 13,
        minZoom: 5,
        keepBuffer: 3,           // Fast 3-tile buffer: massive performance gain on fullscreen displays
        updateWhenZooming: false,
        updateWhenIdle: true,    // Zero network thrash during continuous drag
      }
    ).addTo(map);

    tileLayerRef.current = tileLayer;
    mapRef.current = map;
    if (!selName) {
      map.fitBounds([[6.0, 95.0], [-11.0, 141.0]], { padding: [30, 30] });
    }
    setMapReady(true);

    map.on("zoomend", () => {
      setCurrentZoom(map.getZoom());
    });

    // Track mouse coordinates directly via DOM ref & requestAnimationFrame
    // Eliminates 100% of React re-renders during mouse movement across fullscreen!
    let rafCoord: number | null = null;
    map.on("mousemove", (e) => {
      if (rafCoord) return;
      rafCoord = window.requestAnimationFrame(() => {
        if (coordRef.current) {
          coordRef.current.textContent = `Lat: ${e.latlng.lat.toFixed(2)}° · Lon: ${e.latlng.lng.toFixed(2)}°`;
        }
        rafCoord = null;
      });
    });

    map.on("mouseout", () => {
      if (coordRef.current) {
        coordRef.current.textContent = lang === "id" ? "Arahkan kursor ke peta" : "Hover cursor over map";
      }
    });

    // Instant click inspector (finds nearest dot within 24px)
    map.on("click", (e) => {
      const nearest = findNearestDetectionRef.current(e.latlng, 24);
      if (nearest) {
        openDetectionInspectionRef.current(nearest, [nearest.lat, nearest.lon]);
        return;
      }
      setSelectedCell(null);
    });

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        map.invalidateSize({ pan: false });
      }, 100);
    };

    window.addEventListener("resize", onResize);
    return () => {
      if (rafCoord) window.cancelAnimationFrame(rafCoord);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Load the density grid for Indonesia.
  useEffect(() => {
    let cancelled = false;
    setGridLoading(true);
    setGridError("");
    api.grid("indonesia")
      .then(data => {
        if (!cancelled) setGrid(data);
      })
      .catch(error => {
        if (!cancelled) {
          setGridError(error instanceof Error ? error.message : "Gagal memuat intensitas peta.");
        }
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Load satellite hotspot detections across the entire active region
  useEffect(() => {
    let cancelled = false;
    // Fast path: if all-Indonesia detections are already in memory, use them immediately without flash
    if (allDetectionsRef.current) {
      setDet(allDetectionsRef.current);
      return;
    }
    setDetLoading(true);
    setDetError("");
    api.detections("all")
      .then(data => {
        if (!cancelled) {
          allDetectionsRef.current = data;
          setDet(data);
        }
      })
      .catch(error => {
        if (!cancelled) {
          const targetAoi = selName === null ? "all" : aoi;
          api.detections(targetAoi)
            .then(fallbackData => {
              if (!cancelled) setDet(fallbackData);
            })
            .catch(fallbackError => {
              if (!cancelled) {
                setDetError(fallbackError instanceof Error ? fallbackError.message : "Gagal memuat titik satelit.");
              }
            });
        }
      })
      .finally(() => {
        if (!cancelled) setDetLoading(false);
      });
    return () => { cancelled = true; };
  }, [aoi, selName]);

  function getCellDensity(count: number, maxCount: number): { label: string; color: string; bg: string } {
    const isEn = lang === "en";
    if (count === 0) {
      return { label: isEn ? "0 records" : "0 rekaman", color: "#94A3B8", bg: "rgba(148, 163, 184, 0.15)" };
    }
    const intensity = maxCount > 0 ? Math.log1p(count) / Math.log1p(maxCount) : 0;
    if (intensity < 0.33) {
      return { label: isEn ? "Low" : "Rendah", color: "#FACC15", bg: "rgba(250, 204, 21, 0.2)" };
    }
    if (intensity < 0.66) {
      return { label: isEn ? "Medium" : "Sedang", color: "#F97316", bg: "rgba(249, 115, 22, 0.25)" };
    }
    return { label: isEn ? "High" : "Tinggi", color: "#EF4444", bg: "rgba(239, 68, 68, 0.32)" };
  }

  const cellCountsByCoord = useMemo(() => {
    const counts = new Map<string, { total: number; viirs: number; modis: number }>();
    if (!det || detLoading || !!detError) {
      return counts;
    }

    const step = grid?.cell_deg ?? 0.1;
    for (const d of det.detections) {
      if (activeRegionBounds) {
        if (
          d.lat < activeRegionBounds.south ||
          d.lat > activeRegionBounds.north ||
          d.lon < activeRegionBounds.west ||
          d.lon > activeRegionBounds.east
        ) {
          continue;
        }
      }
      if (detYear !== "all" && !d.date.startsWith(detYear)) continue;
      if (detSensor !== "all" && d.sensor !== detSensor) continue;
      if (d.frp < minFrp) continue;

      const cellSouth = Math.round(Math.floor(d.lat / step) * step * 10) / 10;
      const cellWest = Math.round(Math.floor(d.lon / step) * step * 10) / 10;
      const key = `${cellSouth.toFixed(1)},${cellWest.toFixed(1)}`;

      const curr = counts.get(key);
      if (curr) {
        curr.total += 1;
        if (d.sensor === "viirs") curr.viirs += 1;
        else if (d.sensor === "modis") curr.modis += 1;
      } else {
        counts.set(key, {
          total: 1,
          viirs: d.sensor === "viirs" ? 1 : 0,
          modis: d.sensor === "modis" ? 1 : 0,
        });
      }
    }
    return counts;
  }, [det, detLoading, detError, grid, detYear, detSensor, minFrp, activeRegionBounds]);

  const maxCount = useMemo(() => {
    let max = 0;
    for (const v of cellCountsByCoord.values()) {
      if (v.total > max) max = v.total;
    }
    return max;
  }, [cellCountsByCoord]);

  const cellsByCoordMap = useMemo(() => {
    const m = new Map<string, GridCell>();
    if (!grid) return m;
    for (const c of grid.cells) {
      m.set(`${c.south.toFixed(1)},${c.west.toFixed(1)}`, c);
    }
    return m;
  }, [grid]);

  const activeGridCellCount = useMemo(() => {
    let count = 0;
    for (const v of cellCountsByCoord.values()) {
      if (v.total === 0) continue;
      const intensity = maxCount > 0 ? Math.log1p(v.total) / Math.log1p(maxCount) : 0;
      if (riskFilter === "danger" && intensity < 0.66) continue;
      if (riskFilter === "alert" && intensity < 0.33) continue;
      count += 1;
    }
    return count;
  }, [cellCountsByCoord, riskFilter, maxCount]);

  // Render 0.1° density grid overlay across the full rectangular Indonesia bounds
  useEffect(() => {
    const map = mapRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!map || !canvasRenderer) return;
    gridLayerRef.current?.remove();
    gridLayerRef.current = null;
    if (!gridOn || !grid) return;

    // Dedicated grid canvas on gridPane (zIndex: 410)
    const layer = L.layerGroup();

    // 1. Full rectangular bounds of Indonesia & New Guinea (94°E to 152°E, 12°S to 8°N) - no cuts or gaps
    const bounds = grid.bounds ?? { south: -12.0, west: 94.0, north: 8.0, east: 152.0 };
    const step = grid.cell_deg ?? 0.1;

    // Full rectangular subtle white background overlay for unmonitored / base grid area
    const bgRect = L.rectangle(
      [[bounds.south, bounds.west], [bounds.north, bounds.east]],
      {
        renderer: canvasRenderer,
        color: "rgba(255, 255, 255, 0.40)",
        weight: 1.0,
        fillColor: "#FFFFFF",
        fillOpacity: 0.035,
        interactive: true,
        bubblingMouseEvents: false,
      },
    );
    bgRect.addTo(layer);

    // 2. Uniform 0.1° grid lines spanning the entire rectangle ("full persegi panjang")
    const gridLines: [number, number][][] = [];
    for (let lat = bounds.south; lat <= bounds.north + 1e-5; lat = Math.round((lat + step) * 10) / 10) {
      gridLines.push([[lat, bounds.west], [lat, bounds.east]]);
    }
    for (let lon = bounds.west; lon <= bounds.east + 1e-5; lon = Math.round((lon + step) * 10) / 10) {
      gridLines.push([[bounds.south, lon], [bounds.north, lon]]);
    }

    const linesLayer = L.polyline(gridLines, {
      renderer: canvasRenderer,
      color: "rgba(255, 255, 255, 0.20)",
      weight: 0.4,
      interactive: false,
    });
    linesLayer.addTo(layer);

    // 3. Render active / monitored observation cells with heat & risk colors
    const cellsByCoord = new Map<string, GridCell>();
    for (const cell of grid.cells) {
      if (activeRegionBounds) {
        if (
          cell.south < activeRegionBounds.south ||
          cell.north > activeRegionBounds.north ||
          cell.west < activeRegionBounds.west ||
          cell.east > activeRegionBounds.east
        ) {
          continue;
        }
      }
      const key = `${cell.south.toFixed(1)},${cell.west.toFixed(1)}`;
      cellsByCoord.set(key, cell);

      const cellData = cellCountsByCoord.get(key);
      const count = cellData?.total ?? 0;
      if (count === 0) continue; // Unpopulated cells in this year/filter remain in the base standby grid

      const intensity = maxCount > 0 ? Math.log1p(count) / Math.log1p(maxCount) : 0;
      if (riskFilter === "danger" && intensity < 0.66) continue;
      if (riskFilter === "alert" && intensity < 0.33) continue;

      const isSelected = selectedCell?.cell_id === cell.cell_id;
      const density = getCellDensity(count, maxCount);

      const area = L.rectangle(
        [[cell.south, cell.west], [cell.north, cell.east]],
        {
          renderer: canvasRenderer,
          color: isSelected ? "#FFFFFF" : density.color,
          weight: isSelected ? 2.5 : 0.65,
          fillColor: density.color,
          fillOpacity: isSelected
            ? 0.70
            : Math.min(0.85, gridOpacity * (0.60 + intensity * 0.75)),
          interactive: true,
          bubblingMouseEvents: false,
        },
      );
      const yearText = detYear === "all" ? (lang === "id" ? "Semua tahun" : "All years") : (lang === "id" ? `Tahun ${detYear}` : `Year ${detYear}`);
      const sensorText = detSensor === "all" ? (lang === "id" ? "Semua sensor" : "All sensors") : detSensor.toUpperCase();
      area.bindTooltip(
        `<div style="font-size:11px; line-height:1.4;">
          <div style="font-weight:700; color:${density.color}; margin-bottom:2px;">${lang === "id" ? "Kepadatan observasi" : "Observation density"}: ${density.label}</div>
          <div>${count.toLocaleString(lang === "id" ? "id-ID" : "en-US")} ${lang === "id" ? "observasi satelit" : "satellite observations"}</div>
          <div style="font-size:10px; color:#94A3B8;">${cell.cell_id} · ${yearText} (${sensorText})</div>
        </div>`
      );
      area.on("click", (e) => {
        if (detOn) {
          const nearest = findNearestDetectionRef.current(e.latlng, 22);
          if (nearest) {
            L.DomEvent.stopPropagation(e);
            openDetectionInspectionRef.current(nearest, [nearest.lat, nearest.lon]);
            return;
          }
        }
        L.DomEvent.stopPropagation(e);
        setSelectedCell(prev => (prev?.cell_id === cell.cell_id ? null : cell));
      });
      area.addTo(layer);
    }

    // 4. Click handler on the full rectangle to focus / inspect any 0.1° cell
    bgRect.on("click", (e) => {
      if (detOn) {
        const nearest = findNearestDetectionRef.current(e.latlng, 22);
        if (nearest) {
          L.DomEvent.stopPropagation(e);
          openDetectionInspectionRef.current(nearest, [nearest.lat, nearest.lon]);
          return;
        }
      }

      const clickedLat = Math.floor(e.latlng.lat / step) * step;
      const clickedLon = Math.floor(e.latlng.lng / step) * step;
      const cellSouth = Math.round(clickedLat * 10) / 10;
      const cellWest = Math.round(clickedLon * 10) / 10;
      const key = `${cellSouth.toFixed(1)},${cellWest.toFixed(1)}`;
      const existing = cellsByCoord.get(key);

      if (existing) {
        L.DomEvent.stopPropagation(e);
        setSelectedCell(prev => (prev?.cell_id === existing.cell_id ? null : existing));
      } else {
        // Clicking open ocean / unmonitored space releases focused cell selection
        setSelectedCell(null);
      }
    });

    // 5. If a cell is selected, render a prominent highlight rectangle over it
    if (selectedCell) {
      const selectedData = cellCountsByCoord.get(`${selectedCell.south.toFixed(1)},${selectedCell.west.toFixed(1)}`);
      const count = selectedData?.total ?? 0;
      const isObs = count > 0;
      const highlight = L.rectangle(
        [[selectedCell.south, selectedCell.west], [selectedCell.north, selectedCell.east]],
        {
          renderer: canvasRenderer,
          color: "#FFFFFF",
          weight: 2.5,
          fillColor: isObs ? getCellDensity(count, maxCount).color : "#FFFFFF",
          fillOpacity: 0.55,
          interactive: false,
        }
      );
      highlight.addTo(layer);
    }

    layer.addTo(map);
    gridLayerRef.current = layer;
    if (dotsLayerRef.current && map.hasLayer(dotsLayerRef.current)) {
      dotsLayerRef.current.remove();
      dotsLayerRef.current.addTo(map);
    }
  }, [grid, gridOn, selectedCell, maxCount, mapReady, aoi, presets, lang, riskFilter, gridOpacity, cellCountsByCoord, detYear, detSensor, activeRegionBounds]);

  const detRows = useMemo(() => {
    if (!det) return [];
    return det.detections.filter(d => {
      if (activeRegionBounds) {
        if (
          d.lat < activeRegionBounds.south ||
          d.lat > activeRegionBounds.north ||
          d.lon < activeRegionBounds.west ||
          d.lon > activeRegionBounds.east
        ) {
          return false;
        }
      }
      const matchTime = (detYear === "all" || d.date.startsWith(detYear));
      const matchSensor = (detSensor === "all" || d.sensor === detSensor);
      const matchFrp = d.frp >= minFrp;
      if (!matchTime || !matchSensor || !matchFrp) return false;
      if (selectedCell) {
        const inSelected = (
          d.lat >= selectedCell.south &&
          d.lat <= selectedCell.north &&
          d.lon >= selectedCell.west &&
          d.lon <= selectedCell.east
        );
        if (!inSelected) return false;
      }
      if (riskFilter !== "all" && grid && maxCount > 0) {
        const step = grid.cell_deg ?? 0.1;
        const cellSouth = Math.round(Math.floor(d.lat / step) * step * 10) / 10;
        const cellWest = Math.round(Math.floor(d.lon / step) * step * 10) / 10;
        const count = cellCountsByCoord.get(`${cellSouth.toFixed(1)},${cellWest.toFixed(1)}`)?.total ?? 0;
        if (count === 0) return false;
        const intensity = maxCount > 0 ? Math.log1p(count) / Math.log1p(maxCount) : 0;
        if (riskFilter === "danger" && intensity < 0.66) return false;
        if (riskFilter === "alert" && intensity < 0.33) return false;
      }
      return true;
    });
  }, [det, detYear, detSensor, minFrp, selectedCell, riskFilter, grid, maxCount, cellCountsByCoord, lang, activeRegionBounds]);

  const detYears = useMemo(() => {
    if (!det || det.detections.length === 0) {
      if (grid?.years && grid.years.length > 0) {
        return [...grid.years].map(String).sort((a, b) => b.localeCompare(a));
      }
      return [];
    }
    const targetDets = activeRegionBounds
      ? det.detections.filter(d =>
          d.lat >= activeRegionBounds.south &&
          d.lat <= activeRegionBounds.north &&
          d.lon >= activeRegionBounds.west &&
          d.lon <= activeRegionBounds.east
        )
      : det.detections;
    const years = [...new Set(targetDets.map(d => d.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
    return years.length > 0 ? years : [...new Set(det.detections.map(d => d.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  }, [det, grid, activeRegionBounds]);

  // Fallback to "all" if current year filter is not available in newly focused region
  useEffect(() => {
    if (detYear !== "all" && detYears.length > 0 && !detYears.includes(detYear)) {
      setDetYear("all");
    }
  }, [detYears, detYear]);

  // Render satellite detection dots at their true geographic coordinates with progressive disclosure
  useEffect(() => {
    const map = mapRef.current;
    const canvasRenderer = canvasRendererRef.current;
    if (!map || !canvasRenderer) return;

    if (dotsLayerRef.current) {
      dotsLayerRef.current.remove();
      dotsLayerRef.current = null;
    }

    if (!det || !detOn) {
      visibleRowsRef.current = [];
      return;
    }

    const rows = detRows;

    // Render VIIRS first, then MODIS on top so both sensors remain clearly visible when "all" is selected
    const displayRows = detSensor === "all"
      ? [...rows].sort((a, b) => (a.sensor === "modis" ? 1 : 0) - (b.sensor === "modis" ? 1 : 0))
      : rows;

    visibleRowsRef.current = displayRows;

    const maxFrp = Math.max(0, ...displayRows.map(d => d.frp));
    const g = L.layerGroup();
    const isMacroView = currentZoom < 7;

    for (let i = 0; i < displayRows.length; i++) {
      const d = displayRows[i];
      const t = maxFrp > 0 ? Math.min(1, d.frp / maxFrp) : 0;
      const isViirs = d.sensor === "viirs";

      // Dual-ring high contrast: dark silhouette ring + neon core
      // Guarantees maximum visibility across dark, muted, and street basemaps
      const dotRadius = isMacroView
        ? (isViirs ? 2.3 : 3.2)
        : (isViirs ? (2.9 + Math.sqrt(t) * 2.3) : (4.1 + Math.sqrt(t) * 2.7));
      const fillOpacity = isMacroView ? 0.70 : 0.95;
      const strokeWeight = isMacroView ? 0.9 : 1.3;

      L.circleMarker([d.lat, d.lon], {
        renderer: canvasRenderer,
        radius: dotRadius,
        color: "#0F172A",
        weight: strokeWeight,
        fillColor: isViirs ? "#FF2A3B" : "#2563EB",
        fillOpacity: fillOpacity,
        interactive: false,
      }).addTo(g);
    }

    g.addTo(map);
    dotsLayerRef.current = g;
  }, [det, detOn, detRows, mapReady, viewMode, currentZoom]);

  // Smoothly pan only when user explicitly switches AOI preset
  const lastAoiRef = useRef<string>(aoi);
  useEffect(() => {
    if (lastAoiRef.current !== aoi && mapRef.current) {
      lastAoiRef.current = aoi;
      setSelectedCell(null);
      const p = presets.find(pp => pp.id === aoi);
      if (p && (!selName || PRESET_NAMES[p.id] === selName || p.name === selName)) {
        mapRef.current.flyToBounds([[p.south, p.west], [p.north, p.east]], {
          padding: [50, 50],
          duration: 0.9,
        });
      }
    }
  }, [aoi, presets, selName]);

  const resetToAllRegions = () => {
    setSelName(null);
    setSelectedCell(null);
    mapRef.current?.fitBounds([[6.0, 95.0], [-11.0, 141.0]], { padding: [30, 30], duration: 0.8 });
  };

  const flyTo = (r: (typeof REGIONS)[number]) => {
    setSelName(r.name);
    setSelectedCell(null);
    const targetPreset = r.preset || PROVINCE_TO_PRESET[r.name] || PROVINCE_TO_PRESET[r.name.replace(/ \(.*\)/, "")];
    if (targetPreset) {
      lastAoiRef.current = targetPreset;
      setAoi(targetPreset);
      api.series(targetPreset).catch(() => { });
    }
    if (r.preset) {
      const p = presets.find(pp => pp.id === r.preset);
      if (p) {
        mapRef.current?.flyToBounds([[p.south, p.west], [p.north, p.east]], {
          padding: [50, 50],
          duration: 0.9,
        });
        return;
      }
    }
    mapRef.current?.flyTo(r.center, 7, { duration: 0.8 });
  };

  const list = useMemo(() => {
    return REGIONS.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
  }, [q]);
  const chipFor = (r: (typeof REGIONS)[number]) => {
    const presetId = r.preset || PROVINCE_TO_PRESET[r.name] || PROVINCE_TO_PRESET[r.name.replace(/ \(.*\)/, "")];
    const p = presets.find(pp => pp.id === presetId);
    if (!p) return null;
    return p.artifact_status === "available" ? t("map_status_ready") : t("map_status_queued");
  };
  // Calendar for the selected cell: current AOI if it covers the cell centre, else first ready preset that does.
  const cellPreset = useMemo(() => {
    if (!selectedCell) return undefined;
    const lat = (selectedCell.south + selectedCell.north) / 2;
    const lon = (selectedCell.west + selectedCell.east) / 2;
    const covers = (p: Preset) => p.artifact_status === "available" && lat >= p.south && lat <= p.north && lon >= p.west && lon <= p.east;
    return presets.find(p => p.id === aoi && covers(p)) ?? presets.find(covers);
  }, [selectedCell, presets, aoi]);

  return (
    <div
      ref={containerRef}
      className={basemapMode === "muted" ? "basemap-muted" : basemapMode === "dark" ? "basemap-dark" : ""}
      style={{
        position: "relative",
        height: isFs ? "100vh" : "100%",
        flex: 1,
        minHeight: isFs ? "100vh" : 0,
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      {/* Base Map Container */}
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />

      {/* Floating Map Filter HUD & Contrast Toolbar */}
      <div ref={filterBarRef} className="map-filter-bar" role="toolbar" aria-label="Kontrol Filter Peta">
        {/* Region Toggle Pill */}
        <button
          type="button"
          className={"map-segmented-btn" + (sidebarOpen ? " active" : "")}
          onClick={toggleSidebar}
          title={lang === "id" ? "Buka / sembunyikan daftar 38 provinsi" : "Open / close 38 provinces drawer"}
          style={{ fontWeight: 700, padding: "4px 10px", gap: 6 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>{selName ?? (lang === "id" ? "Seluruh Indonesia" : "All Indonesia")}</span>
          <span style={{ fontSize: 9 }}>{sidebarOpen ? "▲" : "▼"}</span>
        </button>

        <div style={{ width: 1, height: 18, background: "var(--line-strong)", margin: "0 2px" }} />

        {/* View Mode Segmented Control */}
        <div className="map-segmented-control" role="group" aria-label="Mode Lapisan">
          <button
            type="button"
            className={"map-segmented-btn" + (viewMode === "both" ? " active" : "")}
            onClick={() => { setViewMode("both"); setGridOn(true); setDetOn(true); }}
            title={lang === "id" ? "Tampilkan titik satelit dan grid kepadatan bersamaan" : "Show satellite points and density grid together"}
          >
            {lang === "id" ? "Kombinasi" : "Combined"}
          </button>
          <button
            type="button"
            className={"map-segmented-btn" + (viewMode === "dots" ? " active" : "")}
            onClick={() => { setViewMode("dots"); setGridOn(false); setDetOn(true); }}
            title={lang === "id" ? "Hanya tampilkan titik satelit FIRMS tanpa lapisan grid" : "Show only FIRMS satellite points without grid"}
          >
            {lang === "id" ? "Titik Api" : "Hotspots"}
          </button>
          <button
            type="button"
            className={"map-segmented-btn" + (viewMode === "grid" ? " active" : "")}
            onClick={() => { setViewMode("grid"); setGridOn(true); setDetOn(false); }}
            title={lang === "id" ? "Hanya tampilkan grid kepadatan 0,1° tanpa titik" : "Show only 0.1° density grid without points"}
          >
            {lang === "id" ? "Grid 0,1°" : "Density Grid"}
          </button>
        </div>

        {/* Dynamic Zoom & Resolution Badge */}
        <span
          className="state-chip chip-neutral mono"
          style={{ fontSize: 10, padding: "2px 7px", height: 26, display: "inline-flex", alignItems: "center", borderRadius: 6 }}
          title={lang === "id" ? "Level pembesaran peta & pengungkapan progresif data" : "Map zoom level & progressive disclosure telemetry"}
        >
          Z{currentZoom} · {viewMode === "grid" ? (lang === "id" ? "Grid 0,1°" : "Density") : (currentZoom < 7 ? (lang === "id" ? "Makro" : "Macro") : (lang === "id" ? "Mikro" : "Micro"))}
        </span>

        {/* Active Year Filter Pill */}
        <span
          className={"state-chip mono" + (detYear === "all" ? " chip-neutral" : " chip-amber")}
          style={{ fontSize: 10, padding: "2px 7px", height: 26, display: "inline-flex", alignItems: "center", borderRadius: 6, fontWeight: 700 }}
          title={lang === "id" ? `Tahun observasi aktif: ${detYear === "all" ? "Semua tahun" : detYear}` : `Active observation year: ${detYear === "all" ? "All years" : detYear}`}
        >
          {detYear === "all" ? (lang === "id" ? "Semua Tahun" : "All Years") : detYear}
        </span>

        <div style={{ width: 1, height: 18, background: "var(--line-strong)", margin: "0 2px" }} />

        {/* Advanced Settings Gear Button */}
        <button
          type="button"
          className={"map-segmented-btn" + (contrastPopoverOpen ? " active" : "")}
          onClick={toggleContrastPopover}
          title={lang === "id" ? "Pengaturan Lanjutan" : "Advanced Settings"}
          style={{ border: "1px solid var(--line-strong)", padding: "4px 8px" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          {(minFrp > 0 || riskFilter !== "all" || detSensor !== "all" || detYear !== "all" || basemapMode !== "osm" || Math.abs(gridOpacity - 0.32) > 0.04) && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ember)", display: "inline-block" }} />
          )}
        </button>
      </div>

      {/* Advanced Settings Popover */}
      {contrastPopoverOpen && (
        <div
          ref={contrastPopoverRef}
          className="map-contrast-popover"
          style={{ maxHeight: "min(460px, calc(100vh - 120px))", overflowY: "auto", overscrollBehavior: "contain" }}
        >
          <div className="map-contrast-popover-title">
            <span>{lang === "id" ? "Pengaturan Lanjutan" : "Advanced Settings"}</span>
            <button
              type="button"
              className="seg-btn"
              style={{ fontSize: 10, padding: "1px 6px" }}
              onClick={() => setContrastPopoverOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* Grid Opacity Slider & Presets */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Opasitas Grid Kepadatan:" : "Density Grid Opacity:"}</span>
              <span className="mono" style={{ color: "var(--ember)" }}>{Math.round(gridOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.80"
              step="0.05"
              value={gridOpacity}
              onChange={e => setGridOpacity(parseFloat(e.target.value))}
              className="map-range-slider"
            />
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { label: lang === "id" ? "Halus (20%)" : "Subtle (20%)", val: 0.20 },
                { label: lang === "id" ? "Optimal (35%)" : "Optimal (35%)", val: 0.35 },
                { label: lang === "id" ? "Pekat (60%)" : "Vivid (60%)", val: 0.60 },
              ].map(p => (
                <button
                  key={p.val}
                  type="button"
                  className={"map-segmented-btn" + (Math.abs(gridOpacity - p.val) < 0.04 ? " active" : "")}
                  style={{ flex: 1, fontSize: 10, height: 24, border: "1px solid var(--line)" }}
                  onClick={() => setGridOpacity(p.val)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="map-contrast-hint">
              {lang === "id"
                ? "Turunkan opasitas agar titik api FIRMS lebih menonjol di atas latar belakang grid."
                : "Lower opacity so FIRMS hotspots stand out clearly over background grid."}
            </div>
          </div>

          {/* Basemap Contrast Mode */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Peta Dasar (Basemap):" : "Basemap Contrast:"}</span>
            </div>
            <div className="map-segmented-control" style={{ width: "100%" }}>
              {[
                { id: "osm", label: lang === "id" ? "Standar OSM" : "Standard OSM" },
                { id: "muted", label: lang === "id" ? "Muted Kontras" : "Muted Contrast" },
                { id: "dark", label: lang === "id" ? "Mode Gelap" : "Dark Telemetry" },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={"map-segmented-btn" + (basemapMode === m.id ? " active" : "")}
                  style={{ flex: 1, fontSize: 10.5 }}
                  onClick={() => setBasemapMode(m.id as any)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="map-contrast-hint">
              {lang === "id"
                ? "Mode 'Muted Kontras' atau 'Mode Gelap' memaksimalkan keterbacaan warna termal satelit."
                : "Muted or Dark mode maximizes thermal satellite color readability."}
            </div>
          </div>

          {/* Satellite Sensor Filter - 3 Selectable Buttons */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Sensor Satelit:" : "Satellite Sensor:"}</span>
            </div>
            <div className="map-segmented-control" style={{ width: "100%" }}>
              {[
                { id: "all", label: lang === "id" ? "Semua Sensor" : "All Sensors" },
                { id: "viirs", label: "VIIRS 375m" },
                { id: "modis", label: "MODIS 1km" },
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={"map-segmented-btn" + (detSensor === s.id ? " active" : "")}
                  style={{ flex: 1, fontSize: 10.5 }}
                  onClick={() => setDetSensor(s.id as "all" | "modis" | "viirs")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observation Year Filter */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Tahun Observasi (Grid & Titik):" : "Observation Year (Grid & Dots):"}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink2)" }}>
                {detYear === "all" ? (lang === "id" ? "Semua tahun" : "All years") : detYear}
              </span>
            </div>
            <SearchableSelect
              className="glass-select"
              value={detYear}
              label={lang === "id" ? "Tahun Observasi (Grid & Titik)" : "Observation Year (Grid & Dots)"}
              options={[
                { value: "all", label: t("map_time_all") },
                ...detYears.map(year => ({
                  value: year,
                  label: lang === "id" ? `Tahun ${year}` : `Year ${year}`,
                })),
              ]}
              searchPlaceholder={t("select_search_placeholder")}
              noResultsMessage={t("select_no_results")}
              style={{ width: "100%", height: 32, fontSize: 11, cursor: "pointer" }}
              onChange={setDetYear}
            />
            <div className="map-contrast-hint">
              {lang === "id"
                ? "Memfilter kepadatan grid 0,1° dan sebaran titik api satelit berdasarkan tahun observasi yang dipilih."
                : "Filters both 0.1° density grid and satellite hotspot dots according to the selected observation year."}
            </div>
          </div>

          {/* Min FRP Threshold Filter */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Intensitas Termal Minimum (FRP):" : "Min Fire Radiative Power (FRP):"}</span>
              <span className="mono" style={{ color: "var(--ember)" }}>{minFrp > 0 ? `≥ ${minFrp} MW` : (lang === "id" ? "Semua" : "All")}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { label: lang === "id" ? "Semua" : "All", val: 0 },
                { label: "≥ 10 MW", val: 10 },
                { label: "≥ 25 MW", val: 25 },
                { label: "≥ 50 MW", val: 50 },
              ].map(f => (
                <button
                  key={f.val}
                  type="button"
                  className={"map-segmented-btn" + (minFrp === f.val ? " active" : "")}
                  style={{ flex: 1, fontSize: 10.5, height: 24, border: "1px solid var(--line)" }}
                  onClick={() => setMinFrp(f.val)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level Filter - 3 Selectable Buttons */}
          <div className="map-contrast-row">
            <div className="map-contrast-label">
              <span>{lang === "id" ? "Filter Tingkat Risiko:" : "Risk Level Filter:"}</span>
            </div>
            <div className="map-segmented-control" style={{ width: "100%" }}>
              {[
                { id: "all", label: lang === "id" ? "Semua Risiko" : "All Risk" },
                { id: "alert", label: lang === "id" ? "Siaga & Bahaya" : "Alert & Danger" },
                { id: "danger", label: lang === "id" ? "Bahaya Saja" : "Danger Only" },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={"map-segmented-btn" + (riskFilter === r.id ? " active" : "")}
                  style={{ flex: 1, fontSize: 10.5 }}
                  onClick={() => setRiskFilter(r.id as "all" | "danger" | "alert")}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Control Toolbar (Right side: Fullscreen & Controls) */}
      <div
        ref={toolbarRef}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 900,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          padding: 6,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          boxShadow: "var(--shadow-md)",
        }}
      >
        <button
          type="button"
          onClick={toggleFullscreen}
          className="seg-btn"
          style={{
            background: "transparent",
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          title={isFs ? t("map_exit_fullscreen") : t("map_fullscreen")}
        >
          {isFs ? t("map_exit_fullscreen") : t("map_fullscreen")}
        </button>
      </div>

      {/* Floating Sidebar Filter */}
      <div
        ref={sidebarRef}
        className="map-sidebar-drawer"
        style={{
          position: "absolute",
          left: 14,
          top: 62,
          bottom: 48,
          width: 320,
          background: "var(--surface)",
          borderRadius: 12,
          border: "1px solid var(--line-strong)",
          boxShadow: "var(--shadow-md)",
          display: sidebarOpen ? "flex" : "none",
          flexDirection: "column",
          zIndex: 920,
        }}
      >
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink2)" }}>
              {t("map_filter_title")}
            </span>
            <button
              type="button"
              className="seg-btn"
              style={{ fontSize: 10.5, padding: "2px 8px" }}
              onClick={() => setSidebarOpen(false)}
              title={lang === "id" ? "Sembunyikan panel ini" : "Hide this panel"}
            >
              ✕
            </button>
          </div>
        </div>

        {calFilter && (
          <div style={{
            margin: "0 14px 8px", fontSize: 11.5, color: "var(--ember)",
            background: "var(--ember-sub)", border: "1px solid var(--ember-border)",
            borderRadius: 8, padding: "6px 10px",
          }}>
            Temporal calendar scope: <b>{calFilter}</b>
          </div>
        )}

        {(gridLoading || gridError) && (
          <div style={{
            margin: "0 14px 8px", fontSize: 10.5, color: gridError ? "var(--danger, #dc2626)" : "var(--ink2)",
            background: "var(--sunken)", border: "1px solid var(--line)",
            borderRadius: 8, padding: "6px 10px",
          }}>
            {gridError ? `Intensitas peta gagal dimuat: ${gridError}` : "Memuat intensitas observasi per area…"}
          </div>
        )}

        {/* Titik Satelit FIRMS Control Card */}
        <div style={{
          margin: "0 14px 8px", padding: 10,
          background: "var(--sunken)", borderRadius: 8, border: "1px solid var(--line)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
              {lang === "id" ? "Titik Satelit FIRMS" : "FIRMS Satellite Hotspots"}
            </span>
            <button
              type="button"
              className={"seg-btn" + (detOn ? " active" : "")}
              onClick={() => setDetOn(o => !o)}
              aria-pressed={detOn}
              style={{
                background: detOn ? "var(--ember-sub)" : "var(--surface)",
                color: detOn ? "var(--ember)" : "var(--ink)",
                fontWeight: 600,
                fontSize: 11,
                padding: "3px 10px",
              }}
              title={detOn ? (lang === "id" ? "Sembunyikan titik satelit" : "Hide satellite hotspots") : (lang === "id" ? "Tampilkan titik satelit" : "Show satellite hotspots")}
            >
              {detOn ? (lang === "id" ? "Ditampilkan" : "Shown") : (lang === "id" ? "Disembunyikan" : "Hidden")}
            </button>
          </div>

          {!detOn ? (
            <div style={{ fontSize: 10.5, color: "var(--ink3)", lineHeight: 1.4 }}>
              {lang === "id" ? "Lapisan titik satelit dinonaktifkan." : "Satellite hotspot layer is disabled."}
            </div>
          ) : detLoading ? (
            <div style={{ fontSize: 10.5, color: "var(--ink3)" }}>{lang === "id" ? "Memuat titik satelit…" : "Loading satellite hotspots…"}</div>
          ) : detError ? (
            <div role="alert" style={{ fontSize: 10.5, color: "var(--danger, #dc2626)", lineHeight: 1.4 }}>
              {lang === "id" ? `Titik satelit gagal dimuat: ${detError}` : `Failed to load satellite hotspots: ${detError}`}
            </div>
          ) : det ? (
            <>
              {selectedCell && (
                <div style={{ fontSize: 10.5, color: "var(--ink2)", marginBottom: 6 }}>
                  {lang === "id"
                    ? `${detRows.length.toLocaleString("id-ID")} titik dalam sel ${selectedCell.cell_id} (${detYear === "all" ? "Semua tahun" : `Tahun ${detYear}`})`
                    : `${detRows.length.toLocaleString("en-US")} points in cell ${selectedCell.cell_id} (${detYear === "all" ? "All years" : `Year ${detYear}`})`}
                </div>
              )}
              {!selectedCell && (
                <div style={{ fontSize: 10.5, color: "var(--ink2)", marginBottom: 6 }}>
                  {lang === "id"
                    ? `${detRows.length.toLocaleString("id-ID")} observasi titik satelit (${detYear === "all" ? "Semua tahun" : `Tahun ${detYear}`})`
                    : `${detRows.length.toLocaleString("en-US")} satellite hotspot observations (${detYear === "all" ? "All years" : `Year ${detYear}`})`}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, fontSize: 11, color: "var(--ink2)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <i style={{ width: 10, height: 10, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} /> VIIRS 375m
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <i style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563EB", display: "inline-block" }} /> MODIS 1km
                </span>
                <span style={{ marginLeft: "auto", color: "var(--ink3)", fontSize: 10 }}>Radius ∝ √FRP</span>
              </div>

            </>
          ) : null}
        </div>

        {/* Selected Cell Inspection Card */}
        {selectedCell && (() => {
          const cellKey = `${selectedCell.south.toFixed(1)},${selectedCell.west.toFixed(1)}`;
          const cellData = cellCountsByCoord.get(cellKey);
          const isDataReady = det !== null && !detLoading && !detError;
          const cellCount = isDataReady ? (cellData?.total ?? 0) : null;
          const cellViirs = isDataReady ? (cellData?.viirs ?? 0) : null;
          const cellModis = isDataReady ? (cellData?.modis ?? 0) : null;
          const density = isDataReady
            ? getCellDensity(cellCount!, maxCount)
            : { label: detLoading ? (lang === "id" ? "Memuat..." : "Loading...") : (lang === "id" ? "Tidak Tersedia" : "Unavailable"), color: "#94A3B8", bg: "rgba(148, 163, 184, 0.15)" };
          const yearLabel = detYear === "all" ? (lang === "id" ? "Semua tahun" : "All years") : (lang === "id" ? `Tahun ${detYear}` : `Year ${detYear}`);
          const sensorLabel = detSensor === "all" ? (lang === "id" ? "Semua sensor" : "All sensors") : detSensor.toUpperCase();

          return (
            <div style={{
              margin: "0 14px 8px", padding: 10,
              background: "var(--sunken)", borderRadius: 8,
              border: "1px solid var(--line)",
              borderLeft: `4px solid ${density.color}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>
                  {lang === "id" ? "Inspeksi Sel Terfokus" : "Focused Cell Inspection"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: density.color,
                  background: density.bg,
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {lang === "id" ? "Kepadatan" : "Density"}: {density.label}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink2)", marginBottom: 4 }}>
                {lang === "id" ? "Sel:" : "Cell:"} <span className="mono">{selectedCell.cell_id}</span> (0,1° ≈ 11 km) · <span className="mono">{yearLabel} ({sensorLabel})</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink2)", marginBottom: 8 }}>
                {lang === "id" ? "Observasi Satelit:" : "Satellite Observations:"}{" "}
                {isDataReady ? (
                  <>
                    <b>{cellCount!.toLocaleString(lang === "id" ? "id-ID" : "en-US")}</b> {lang === "id" ? "titik" : "points"} ({cellViirs} VIIRS · {cellModis} MODIS)
                  </>
                ) : detLoading ? (
                  <span style={{ color: "var(--ink3)" }}>{lang === "id" ? "Memuat data telemetri..." : "Loading satellite telemetry..."}</span>
                ) : (
                  <span style={{ color: "#EF4444" }}>{lang === "id" ? "Telemetri satelit tidak tersedia" : "Satellite telemetry unavailable"}</span>
                )}
              </div>
              {cellPreset ? (
                <button
                  type="button"
                  className="seg-btn active"
                  onClick={() => { setAoi(cellPreset.id); goCalendar(); }}
                  style={{
                    width: "100%", padding: "6px 10px", fontSize: 10.5, marginBottom: 6,
                    fontWeight: 600, background: "var(--ember-sub)", color: "var(--ember)",
                    display: "block", textAlign: "center",
                  }}
                >
                  {lang === "id" ? "Buka Kalender Kebakaran" : "Open Fire Calendar"}: {cellPreset.name}
                </button>
              ) : (
                <div style={{ fontSize: 10, color: "var(--ink3)", marginBottom: 6 }}>
                  {lang === "id" ? "Belum ada kalender kebakaran untuk sel ini." : "No fire calendar covers this cell yet."}
                </div>
              )}
              <button
                type="button"
                className="seg-btn"
                onClick={() => {
                  setSelectedCell(null);
                  const p = presets.find(pp => pp.id === aoi);
                  if (p) {
                    mapRef.current?.flyToBounds([[p.south, p.west], [p.north, p.east]], { padding: [50, 50], duration: 0.8 });
                  }
                }}
                style={{
                  width: "100%", padding: "5px 10px", fontSize: 10.5,
                  fontWeight: 600, background: "var(--surface)", display: "block", textAlign: "center",
                }}
              >
                {lang === "id" ? "Lepas Fokus Sel (Tampilkan Semua)" : "Reset Cell Focus (Show All)"}
              </button>
            </div>
          );
        })()}

        {/* Grid Kepadatan Observasi 0.1° Card */}
        <div style={{
          margin: "0 14px 8px", padding: 10,
          background: "var(--sunken)", borderRadius: 8, border: "1px solid var(--line)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)" }}>
              {lang === "id" ? "Grid Kepadatan (0,1°)" : "Density Grid (0.1°)"}
            </span>
            <button
              type="button"
              className={"seg-btn" + (gridOn ? " active" : "")}
              onClick={() => setGridOn(g => !g)}
              aria-pressed={gridOn}
              style={{
                background: gridOn ? "var(--ember-sub)" : "var(--surface)",
                color: gridOn ? "var(--ember)" : "var(--ink)",
                fontWeight: 600,
                fontSize: 10.5,
                padding: "2px 8px",
              }}
              title={gridOn ? (lang === "id" ? "Sembunyikan lapisan grid kepadatan" : "Hide density grid layer") : (lang === "id" ? "Tampilkan lapisan grid kepadatan" : "Show density grid layer")}
            >
              {gridOn ? (lang === "id" ? "Aktif" : "Active") : (lang === "id" ? "Nonaktif" : "Off")}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, fontSize: 9.5, color: "var(--ink2)", textAlign: "center", marginTop: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: "100%", height: 4, borderRadius: 2, background: "#FFFFFF", border: "1px solid rgba(255, 255, 255, 0.6)" }} />
              <span>{lang === "id" ? "Belum Ada" : "No Data"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: "100%", height: 4, borderRadius: 2, background: "#94A3B8" }} />
              <span>{lang === "id" ? "0 rekaman" : "0 records"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: "100%", height: 4, borderRadius: 2, background: "#FACC15" }} />
              <span>{lang === "id" ? "Rendah" : "Low"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: "100%", height: 4, borderRadius: 2, background: "#F97316" }} />
              <span>{lang === "id" ? "Sedang" : "Medium"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ display: "inline-block", width: "100%", height: 4, borderRadius: 2, background: "#EF4444" }} />
              <span>{lang === "id" ? "Tinggi" : "High"}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 14px 8px" }}>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t("map_search_placeholder")}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, padding: "8px 12px" }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", scrollBehavior: "smooth", padding: "0 8px 8px" }}>
          {/* All Regions (Indonesia) button - always stays on the top of the province list, even when searching */}
          <button
            type="button"
            className={"region-item" + (selName === null ? " active" : "")}
            style={{ marginBottom: 4 }}
            onClick={resetToAllRegions}
            aria-pressed={selName === null}
          >
            <span style={{ fontWeight: 600 }}>
              {lang === "id" ? "Seluruh Wilayah (Indonesia)" : "All Regions (Indonesia)"}
            </span>
            <span className="chip ready">{t("map_status_ready")}</span>
          </button>

          {list.map(r => {
            const chip = chipFor(r);
            // Strict single selection: only one region can EVER be active at a time!
            const active = r.name === selName;
            return (
              <button
                key={r.name}
                className={"region-item" + (active ? " active" : "")}
                onClick={() => flyTo(r)}
                aria-pressed={active}
              >
                <span>{r.name}</span>
                {chip && (
                  <span className={"chip " + (chip === t("map_status_ready") ? "ready" : "pending")}>
                    {chip}
                  </span>
                )}
              </button>
            );
          })}
          {list.length === 0 && (
            <p style={{ padding: "8px 12px", fontSize: 12, color: "var(--ink3)" }}>
              {lang === "id" ? `Tidak ada wilayah yang cocok dengan "${q}".` : `No regions match "${q}".`}
            </p>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--line)", padding: "10px 14px", fontSize: 10.5, color: "var(--ink3)" }}>
          {lang === "id" ? "Wilayah Aktif: " : "Active Region: "}
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>
            {selName ?? (lang === "id" ? "Seluruh Kepulauan Indonesia" : "All Indonesian Archipelago")}
          </span>
          <span> · {t("map_status_ready")}</span>
        </div>
      </div>

      {/* Real-time Cursor Coordinate Tracker — pinned to bottom-left even with the filter search panel */}
      <div
        className="map-coord-tracker"
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          width: 320,
          boxSizing: "border-box",
          zIndex: 890,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-sm)",
          borderRadius: 8,
          padding: "5px 12px",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "var(--ink2)",
        }}
      >
        <span style={{ color: "var(--ink)", fontWeight: 600 }}>
          {selName
            ? (lang === "id" ? `Wilayah: ${selName}` : `Region: ${selName}`)
            : (lang === "id" ? "Wilayah: Seluruh Indonesia" : "Region: All Indonesia")}
        </span>
        <span ref={coordRef} className="mono" style={{ fontSize: 10.5 }}>
          {lang === "id" ? "Arahkan kursor ke peta" : "Hover cursor over map"}
        </span>
      </div>





      {/* Floating Shortcut to Open AI Drawer if Hotspot is Selected and Drawer is Closed */}
      {selectedDetection && !isAiDrawerOpen && (
        <button
          type="button"
          className="ai-floating-trigger"
          onClick={() => {
            setIsAiDrawerOpen(true);
            triggerAiAnalysis(selectedDetection);
          }}
          title={lang === "id" ? "Buka panel analisis telemetri satelit AI untuk titik ini" : "Open AI satellite telemetry analysis panel for this hotspot"}
        >
          <span>
            {lang === "id" ? "Titik Terpilih" : "Selected Hotspot"}: {selectedDetection.sensor === "viirs" ? "VIIRS" : "MODIS"} {selectedDetection.frp.toFixed(1)} MW
          </span>
          <span>·</span>
          <span>{lang === "id" ? "Tanya tentang deteksi →" : "Ask about this detection →"}</span>
        </button>
      )}

      {/* AI Telemetry Context Drawer (xAI Grok & Heuristic) */}
      {isAiDrawerOpen && selectedDetection && (
        <div ref={aiDrawerRef} className="ai-drawer-container">
          <div className="ai-drawer-header">
            <div>
              <div className="ai-drawer-title">
                {lang === "id" ? "Ringkasan deteksi satelit" : "Satellite detection summary"}
              </div>
              <div className="ai-drawer-subtitle">
                {lang === "id" ? "Menggunakan metadata deteksi yang dipilih" : "Uses metadata from the selected detection"}
              </div>
            </div>
            <div className="ai-header-actions">
              {aiResponse?.provider && aiResponse.provider !== "heuristic" && (
                <span
                  className="state-chip mono"
                  style={{
                    fontSize: 10.5,
                    padding: "3px 8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#059669",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  {aiResponse.provider === "groq" ? "Groq Cloud" : "xAI Grok"}
                </span>
              )}
              <button
                type="button"
                className="ai-btn-close"
                onClick={closeAiDrawer}
                title={lang === "id" ? "Tutup Panel Analisis" : "Close Analysis Panel"}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="ai-drawer-body">
            {/* Hotspot details badge card */}
            <div className="ai-hotspot-card">
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)" }}>
                {lang === "id" ? "Rincian deteksi" : "Detection details"}
              </div>
              <div className="ai-badge-row">
                <span className={"ai-badge " + (selectedDetection.sensor === "viirs" ? "ai-badge-viirs" : "ai-badge-modis")}>
                  {selectedDetection.sensor === "viirs" ? "VIIRS (~375 m)" : "MODIS (~1 km)"}
                </span>
                <span className="ai-badge ai-badge-frp">
                  FRP: {selectedDetection.frp.toFixed(2)} MW
                </span>
                <span className="ai-badge ai-badge-dim">
                  {selectedDetection.date} · {selectedDetection.daynight === "D" ? (lang === "id" ? "Siang (Day)" : "Day Overpass") : (lang === "id" ? "Malam (Night)" : "Night Overpass")}
                </span>
                <span className="ai-badge ai-badge-dim">
                  Lat: {selectedDetection.lat.toFixed(5)}° · Lon: {selectedDetection.lon.toFixed(5)}°
                </span>
                <span className="ai-badge ai-badge-dim">
                  {lang === "id" ? `Keyakinan: ${selectedDetection.conf}` : `Confidence: ${selectedDetection.conf}`}
                </span>
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="ai-prompt-container">
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink2)" }}>
                {lang === "id" ? "Pertanyaan tentang data:" : "Questions about this record:"}
              </div>
              <div className="ai-chips-list">
                {(lang === "id" ? [
                  "Ringkas deteksi ini",
                  "Apa arti nilai FRP?",
                  "Apa yang bisa diketahui dari rekaman ini?",
                  "Informasi apa yang belum tersedia?",
                ] : [
                  "Summarize this detection",
                  "What does the FRP value mean?",
                  "What can this record tell me?",
                  "What information is missing?",
                ]).map((promptChip) => (
                  <button
                    key={promptChip}
                    type="button"
                    className="ai-chip-prompt"
                    onClick={() => {
                      setAiQuestion(promptChip);
                      submitAiQuestion(promptChip);
                    }}
                    disabled={aiLoading}
                  >
                    {promptChip}
                  </button>
                ))}
              </div>

              <div className="ai-form-row">
                <input
                  type="text"
                  className="ai-text-input"
                  placeholder={lang === "id" ? "Tanyakan tentang informasi dalam rekaman ini..." : "Ask about the information in this record..."}
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !aiLoading) {
                      e.preventDefault();
                      submitAiQuestion(aiQuestion);
                    }
                  }}
                />
                <button
                  type="button"
                  className="ai-submit-btn"
                  onClick={() => submitAiQuestion(aiQuestion)}
                  disabled={aiLoading}
                >
                  {aiLoading ? (lang === "id" ? "Memproses..." : "Processing...") : (lang === "id" ? "Kirim" : "Send")}
                </button>
              </div>
            </div>

            {/* AI Response Output */}
            {aiLoading && (
              <div className="ai-response-box" style={{ textAlign: "center", padding: "28px 16px" }}>
                <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
                  {lang === "id" ? "Menyiapkan jawaban..." : "Preparing a response..."}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink3)" }}>
                  {lang === "id"
                    ? "Jawaban menggunakan metadata deteksi yang tersedia."
                    : "The response uses the available detection metadata."}
                </div>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="ai-response-box" style={{ borderColor: "#EF4444", background: "rgba(239,68,68,0.06)" }}>
                <div style={{ fontWeight: 600, color: "#EF4444", marginBottom: 4 }}>
                  {lang === "id" ? "Kendala Komunikasi AI" : "AI Communication Issue"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink2)", marginBottom: 8 }}>
                  {aiError}
                </div>
                <button
                  type="button"
                  className="seg-btn"
                  style={{ background: "var(--surface)", border: "1px solid var(--line)", fontSize: 11, padding: "4px 10px" }}
                  onClick={() => triggerAiAnalysis(selectedDetection, aiSubmittedQuestion || undefined)}
                >
                  {lang === "id" ? "Coba Lagi" : "Retry"}
                </button>
              </div>
            )}

            {aiResponse && !aiLoading && (
              <div className="ai-response-box">
                <div className="ai-status-bar">
                  <span className={"ai-provider-badge " + (aiResponse.provider === "groq" || aiResponse.provider === "grok" ? "ai-provider-grok" : "ai-provider-heuristic")}>
                    {aiResponse.provider === "groq"
                      ? `Groq Cloud (${aiResponse.model})`
                      : aiResponse.provider === "grok"
                        ? `xAI Grok (${aiResponse.model})`
                        : (lang === "id" ? "Ringkasan metadata satelit" : "Satellite metadata summary")}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--ink3)" }}>
                    {aiResponse.provider === "groq" || aiResponse.provider === "grok"
                      ? (lang === "id" ? "Dibuat AI; periksa sumber data" : "AI-generated; check the source data")
                      : (lang === "id" ? "Berdasarkan metadata deteksi" : "Based on detection metadata")}
                  </span>
                </div>

                <div className="ai-direct-answer-container" ref={aiAnswerRef}>
                  <div className="ai-direct-answer-header">
                    <span className="ai-direct-answer-badge">
                      {lang === "id" ? "Jawaban" : "Response"}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--ink3)" }}>
                      {aiSubmittedQuestion
                        ? (lang === "id" ? `Pertanyaan: "${aiSubmittedQuestion}"` : `Inquiry: "${aiSubmittedQuestion}"`)
                        : (lang === "id" ? "Analisis Telemetri" : "Telemetry Analysis")}
                    </span>
                  </div>
                  <div className="ai-direct-answer-body">
                    <MarkdownView content={aiResponse.analysis} />
                  </div>
                </div>

                {aiResponse.telemetry_context && (
                  <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink2)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>{lang === "id" ? "Data yang tersedia dan batasnya" : "Available data and limits"}</span>
                    </div>
                    <div className="ai-context-grid">
                      <div className="ai-context-tile">
                        <div className="ai-context-label">{lang === "id" ? "Data bioma" : "Biome data"}</div>
                        <div className="ai-context-value">{aiResponse.telemetry_context.biome}</div>
                      </div>
                      <div className="ai-context-tile">
                        <div className="ai-context-label">{lang === "id" ? "Data gambut" : "Peatland data"}</div>
                        <div className="ai-context-value">{aiResponse.telemetry_context.peatland_susceptibility}</div>
                      </div>
                      <div className="ai-context-tile">
                        <div className="ai-context-label">{lang === "id" ? "Data iklim" : "Climate data"}</div>
                        <div className="ai-context-value">{aiResponse.telemetry_context.seasonal_climate}</div>
                      </div>
                      <div className="ai-context-tile">
                        <div className="ai-context-label">{lang === "id" ? "Sensor dan FRP" : "Sensor and FRP"}</div>
                        <div className="ai-context-value">{aiResponse.telemetry_context.sensor_resolution}; {aiResponse.telemetry_context.frp_interpretation}</div>
                      </div>
                    </div>
                  </div>
                )}

                {aiResponse.note && (
                  <div style={{ fontSize: 10.5, color: "var(--ink3)", marginTop: 10, fontStyle: "italic", borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                    {lang === "id" ? "Catatan:" : "Note:"} {aiResponse.note}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: "8px 14px", background: "var(--sunken)", borderTop: "1px solid var(--line)", fontSize: 10, color: "var(--ink3)", lineHeight: 1.3 }}>
            {lang === "id"
              ? "Deteksi satelit tidak menunjukkan penyebab. Konfirmasi penyebab memerlukan pemeriksaan lapangan."
              : "A satellite detection does not identify a cause. Confirming the cause requires field investigation."}
          </div>
        </div>
      )}
    </div>
  );
}
