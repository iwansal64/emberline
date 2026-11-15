"""EmberLine API (D-03/D-04) — serves versioned artifacts from artifacts/.

RULES (repo README / DEV-S05):
- never imports pipeline/ or recomputes science at request time;
- payloads follow contracts/*.example.json; every payload carries run_id,
  model_version and a `fixture` passthrough (UI shows MOCK when set);
- null means explicit gap WITH a reason — never a silent 0;
- statuses: queued · running · complete · failed · insufficient_data ·
  unsupported · expired;
- sanitized errors only; FIRMS_MAP_KEY never leaves the server.

Run:  python -m uvicorn api.app:app --port 8300   (from repo root)
"""
from __future__ import annotations

import csv
import json
import math
import os
import re
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
AOIS_PATH = ROOT / "config" / "aois.yaml"

app = FastAPI(title="EmberLine API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# In-process job store (bounded; DEV-S05 — no queue, no DB)
JOBS: dict = {}
JOB_TTL_MIN = 30
MAX_JOBS = 4


def _aoi_meta(aoi: str):
    """Parse the minimal YAML subset of config/aois.yaml (never imports pipeline)."""
    if not AOIS_PATH.exists():
        raise HTTPException(500, detail="config/aois.yaml missing")
    current = None
    for raw in AOIS_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].rstrip()
        s = line.strip()
        if s.startswith("- id:"):
            current = {"id": s.split(":", 1)[1].strip()}
            if current["id"] == aoi:
                continue
        if current and current.get("id") == aoi:
            if s.startswith("- "):
                break
            if s and ":" in s:
                k, v = s.split(":", 1)
                if k.strip() in ("name", "sources", "start", "end", "west", "south", "east", "north"):
                    try:
                        current[k.strip()] = float(v.strip())
                    except ValueError:
                        current[k.strip()] = v.strip().strip('"')
            if current.get("end"):
                return current
    return None


def _load(aoi: str, name: str):
    p = ARTIFACTS / aoi / name
    if not p.exists():
        raise HTTPException(404, detail=f"Data artefak '{name}' untuk wilayah '{aoi}' belum tersedia. Silakan pilih wilayah lain yang sudah siap.")
    return json.loads(p.read_text(encoding="utf-8"))


def _number(value: str | None) -> float | None:
    return None if value in (None, "") else float(value)


def _series(aoi: str):
    aoi_dir = ARTIFACTS / aoi
    accepted_path = aoi_dir / "accepted_series.csv"
    if not accepted_path.exists():
        raise HTTPException(404, detail=f"Data deret waktu untuk wilayah '{aoi}' belum tersedia. Silakan pilih wilayah lain yang sudah siap.")

    intervals_by_date = {}
    intervals_path = aoi_dir / "harmonized_daily.csv"
    if intervals_path.exists():
        with intervals_path.open(newline="", encoding="utf-8") as fh:
            for interval in csv.DictReader(fh):
                intervals_by_date.setdefault(interval["date"], []).append(interval)

    # VIIRS daily FRP lookup from baseline_series.csv or harmonized_daily.csv
    viirs_by_date = {}
    baseline_path = aoi_dir / "baseline_series.csv"
    if baseline_path.exists():
        with baseline_path.open(newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                val = _number(r.get("viirs_frp_sum_mw"))
                if val is not None:
                    viirs_by_date[r["date"]] = viirs_by_date.get(r["date"], 0.0) + val
    elif intervals_path.exists():
        for dt, inters in intervals_by_date.items():
            vals = [_number(i.get("raw_viirs_frp_mw")) for i in inters if i.get("raw_viirs_frp_mw") is not None]
            if vals:
                viirs_by_date[dt] = sum(vals)

    rows = []
    with accepted_path.open(newline="", encoding="utf-8") as fh:
        for accepted in csv.DictReader(fh):
            intervals = intervals_by_date.get(accepted["date"], [])

            def sum_bound(field: str):
                values = [_number(interval.get(field)) for interval in intervals]
                if not values or any(value is None for value in values):
                    return None
                return sum(value for value in values if value is not None)

            flags = []
            for raw_flags in [accepted.get("flags", "")] + [
                interval.get("flags", "") for interval in intervals
            ]:
                for flag in raw_flags.split("|"):
                    if flag and flag not in flags:
                        flags.append(flag)

            raw_viirs = _number(accepted.get("observed_viirs_mw"))
            if raw_viirs is None and accepted["date"] in viirs_by_date:
                raw_viirs = round(viirs_by_date[accepted["date"]], 2)

            rows.append({
                "date": accepted["date"],
                "source_flag": accepted.get("source_flag") or "gap",
                "raw_modis_frp_mw": _number(accepted.get("observed_modis_mw")),
                "raw_modis_n": None,
                "raw_viirs_frp_mw": raw_viirs,
                "raw_viirs_n": None,
                "harmonized_lo_mw": sum_bound("lo_mw"),
                "harmonized_estimate_mw": _number(accepted.get("harmonized_mw")),
                "harmonized_hi_mw": sum_bound("hi_mw"),
                "flags": flags,
                "gap_reason": accepted.get("gap_reason") or None,
            })
    return rows


def _envelope(aoi: str):
    man = _load(aoi, "run_manifest.json")
    try:
        model_version = _load(aoi, "model.json").get("method")
    except HTTPException:
        model_version = None
    return {"run_id": man["run_id"], "model_version": model_version,
            "fixture": man.get("fixture"),
            "mock": bool(man.get("fixture")),
            "boundary": "Historical & descriptive — not predictive."}


# ---------------- endpoints ----------------

@app.get("/api/health")
def health():
    aois = sorted(p.name for p in ARTIFACTS.glob("*") if p.is_dir() and (p / "run_manifest.json").is_file() and (p / "accepted_series.csv").is_file())
    return {"status": "ok", "aois_with_artifacts": aois,
            "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}


@app.get("/api/aoi/presets")
def presets():
    out = []
    if AOIS_PATH.exists():
        cur = None
        for raw in AOIS_PATH.read_text(encoding="utf-8").splitlines():
            line = raw.split("#", 1)[0].rstrip()
            s = line.strip()
            if s.startswith("- id:"):
                if cur:
                    out.append(cur)
                cur = {"id": s.split(":", 1)[1].strip()}
                continue
            if cur is not None:
                if s.startswith("- "):
                    out.append(cur); cur = None
                    continue
                if s and ":" in s:
                    k, v = s.split(":", 1)
                    k = k.strip()
                    try:
                        cur[k] = float(v.strip())
                    except ValueError:
                        cur[k] = v.strip().strip('"')
        if cur:
            out.append(cur)
    for p in out:
        manifest_file = ARTIFACTS / p["id"] / "run_manifest.json"
        accepted_file = ARTIFACTS / p["id"] / "accepted_series.csv"
        has = manifest_file.is_file() and accepted_file.is_file()
        p["artifact_status"] = "available" if has else "queued"
        if has:
            try:
                p["mock"] = json.loads(manifest_file.read_text(encoding="utf-8")).get("fixture")
            except Exception:
                p["mock"] = None
        else:
            p["mock"] = None
    return {"presets": out}


@app.get("/api/aoi/{aoi}/series")
def series(aoi: str, mock: bool | None = Query(default=None)):
    env = _envelope(aoi)
    rows = _series(aoi)
    return {"aoi_id": aoi, **env, "n_days": len(rows), "days": rows}


@app.get("/api/aoi/{aoi}/calendar")
def calendar(aoi: str):
    cal = _load(aoi, "calendar.json")
    return {**_envelope(aoi), **cal}


@app.get("/api/aoi/{aoi}/climatology")
def climatology(aoi: str):
    cal = _load(aoi, "calendar.json")
    return {**_envelope(aoi),
            "smoothing_days": 7,
            "positions": cal["climatology"],
            "smoothed_median_mw": cal["climatology_smoothed_median_mw"]}


@app.get("/api/aoi/{aoi}/windows")
def windows(aoi: str):
    return {**_envelope(aoi), **_load(aoi, "windows.json")}


@app.get("/api/aoi/{aoi}/stress")
def stress(aoi: str):
    return {**_envelope(aoi), **_load(aoi, "stress_test.json")}


_CACHED_INDONESIA_MOSAIC_GRID = None


def _generate_indonesia_mosaic_grid():
    global _CACHED_INDONESIA_MOSAIC_GRID
    if _CACHED_INDONESIA_MOSAIC_GRID is not None:
        return _CACHED_INDONESIA_MOSAIC_GRID

    cell_deg = 0.1
    bounds = {"south": -12.0, "west": 94.0, "north": 8.0, "east": 152.0}
    scale_note = "0.1-degree full rectangular grid across Indonesia and New Guinea (94°E to 152°E, 12°S to 8°N). Areas without observations are white standby."

    # 1. Merge artifact observation counts where available across monitored regions
    merged_cells = {}
    years = set()
    if ARTIFACTS.exists() and ARTIFACTS.is_dir():
        for path in sorted(ARTIFACTS.iterdir()):
            if not path.is_dir() or path.name in ("all", "indonesia"):
                continue
            g_path = path / "grid.json"
            d_path = path / "detections.json"
            if not g_path.is_file() or not d_path.is_file():
                continue
            try:
                g = json.loads(g_path.read_text(encoding="utf-8"))
                dets = json.loads(d_path.read_text(encoding="utf-8")).get("detections", [])
                years.update(g.get("years", []))

                d_counts = {}
                for d in dets:
                    l_idx = math.floor(d["lat"] / cell_deg + 1e-9)
                    o_idx = math.floor(d["lon"] / cell_deg + 1e-9)
                    d_counts[(l_idx, o_idx)] = d_counts.get((l_idx, o_idx), 0) + 1

                for c in g.get("cells", []):
                    l_idx = math.floor(c["south"] / cell_deg + 1e-9)
                    o_idx = math.floor(c["west"] / cell_deg + 1e-9)
                    cid = f"R{l_idx:05d}C{o_idx:05d}"
                    cnt = d_counts.get((l_idx, o_idx), 0)
                    if cid in merged_cells:
                        target = merged_cells[cid]
                        target["has_data"] = True
                        target["detection_count"] += cnt
                        target["total_modis"] += c.get("total_modis", 0.0)
                        target["total_viirs"] += c.get("total_viirs", 0.0)
                        target["n_days"] = max(target["n_days"], c.get("n_days", 0))
                    else:
                        merged_cells[cid] = {
                            "cell_id": cid,
                            "south": c["south"],
                            "west": c["west"],
                            "north": c["north"],
                            "east": c["east"],
                            "detection_count": cnt,
                            "total_modis": c.get("total_modis", 0.0),
                            "total_viirs": c.get("total_viirs", 0.0),
                            "n_days": c.get("n_days", 0),
                            "has_data": True,
                        }
            except Exception:
                pass

    cell_list = sorted(merged_cells.values(), key=lambda c: (c["south"], c["west"]))
    _CACHED_INDONESIA_MOSAIC_GRID = {
        "cell_deg": cell_deg,
        "bounds": bounds,
        "years": sorted(years),
        "n_cells": 78200,
        "n_monitored_cells": len(cell_list),
        "scale_note": scale_note,
        "cells": cell_list,
    }
    return _CACHED_INDONESIA_MOSAIC_GRID


@app.get("/api/aoi/{aoi}/grid")
def api_grid(aoi: str, coverage: str | None = None):
    """Per-cell observation counts and yearly raw FRP totals for the map."""
    if aoi in ("indonesia", "nasional") or (aoi == "all" and coverage == "full"):
        return _generate_indonesia_mosaic_grid()

    if aoi not in ("all", "indonesia"):
        return _grid_with_detection_counts(aoi)

    merged_cells = {}
    years = set()
    cell_deg = None
    scale_note = None
    if ARTIFACTS.exists() and ARTIFACTS.is_dir():
        for path in sorted(ARTIFACTS.iterdir()):
            if (
                not path.is_dir()
                or path.name in ("all", "indonesia")
                or not (path / "grid.json").is_file()
                or not (path / "detections.json").is_file()
            ):
                continue
            grid = _grid_with_detection_counts(path.name)
            cell_deg = grid["cell_deg"] if cell_deg is None else cell_deg
            scale_note = grid.get("scale_note", scale_note)
            years.update(grid.get("years", []))
            for cell in grid["cells"]:
                existing = merged_cells.get(cell["cell_id"])
                if existing is None:
                    merged_cells[cell["cell_id"]] = cell
                    continue
                existing["total_modis"] += cell["total_modis"]
                existing["total_viirs"] += cell["total_viirs"]
                existing["detection_count"] += cell["detection_count"]
                existing["n_days"] = max(existing["n_days"], cell["n_days"])
                for year, values in cell.get("years", {}).items():
                    target = existing["years"].setdefault(
                        year, {"modis": 0, "viirs": 0, "n_days": 0}
                    )
                    target["modis"] += values.get("modis", 0)
                    target["viirs"] += values.get("viirs", 0)
                    target["n_days"] = max(target["n_days"], values.get("n_days", 0))

    if cell_deg is None:
        raise HTTPException(404, detail="Data grid untuk wilayah Indonesia belum tersedia.")

    cells = sorted(merged_cells.values(), key=lambda cell: (cell["south"], cell["west"]))
    return {
        "cell_deg": cell_deg,
        "years": sorted(years),
        "n_cells": len(cells),
        "scale_note": scale_note,
        "cells": cells,
    }


def _grid_with_detection_counts(aoi: str):
    grid = _load(aoi, "grid.json")
    cell_deg = grid["cell_deg"]
    cells_by_index = {}
    for cell in grid["cells"]:
        lat_index = math.floor(cell["south"] / cell_deg + 1e-9)
        lon_index = math.floor(cell["west"] / cell_deg + 1e-9)
        cell["detection_count"] = 0
        cells_by_index[(lat_index, lon_index)] = cell

    detections = _load(aoi, "detections.json").get("detections", [])
    for detection in detections:
        lat_index = math.floor(detection["lat"] / cell_deg + 1e-9)
        lon_index = math.floor(detection["lon"] / cell_deg + 1e-9)
        cell = cells_by_index.get((lat_index, lon_index))
        if cell is not None:
            cell["detection_count"] += 1
    return grid


def _filter_detections(detections: list[dict], bounds: tuple[float, float, float, float]):
    west, south, east, north = bounds
    return [
        detection for detection in detections
        if west <= detection["lon"] < east and south <= detection["lat"] < north
    ]


@app.get("/api/aoi/{aoi}/detections")
def api_detections(
    aoi: str,
    west: float | None = None,
    south: float | None = None,
    east: float | None = None,
    north: float | None = None,
):
    """Validated hotspot detections — one entry = one satellite pixel, not one fire."""
    bounds_values = (west, south, east, north)
    if any(value is not None for value in bounds_values):
        if west is None or south is None or east is None or north is None:
            raise HTTPException(422, detail="west, south, east, and north must be provided together.")
        if not all(math.isfinite(value) for value in (west, south, east, north)):
            raise HTTPException(422, detail="Detection bounds must be finite numbers.")
        if west >= east or south >= north:
            raise HTTPException(422, detail="Bounds must satisfy west < east and south < north.")
        bounds = (west, south, east, north)
    else:
        bounds = None

    if aoi in ("all", "indonesia"):
        p = ARTIFACTS / "all" / "detections.json"
        if p.exists() and bounds is None:
            data = json.loads(p.read_text(encoding="utf-8"))
        else:
            all_dets = []
            seen = set()
            for d in sorted(ARTIFACTS.glob("*")):
                if d.is_dir() and d.name != "all" and (d / "detections.json").exists():
                    try:
                        for item in json.loads((d / "detections.json").read_text(encoding="utf-8")).get("detections", []):
                            key = (item.get("date", ""), round(item["lat"], 4), round(item["lon"], 4), item.get("sensor", ""))
                            if key not in seen:
                                seen.add(key)
                                all_dets.append(item)
                    except Exception:
                        pass
            data = {
                "n_detections": len(all_dets),
                "note": "Aggregated FIRMS satellite detections across all monitored Indonesian sentinel regions.",
                "detections": all_dets,
            }
    else:
        det_path = ARTIFACTS / aoi / "detections.json"
        if not det_path.is_file():
            p_match = None
            try:
                for p_item in presets().get("presets", []):
                    if p_item.get("id") == aoi:
                        p_match = p_item
                        break
            except Exception:
                pass
            all_dets = []
            all_path = ARTIFACTS / "all" / "detections.json"
            if all_path.exists():
                try:
                    all_dets = json.loads(all_path.read_text(encoding="utf-8")).get("detections", [])
                except Exception:
                    pass
            if not all_dets:
                for d in sorted(ARTIFACTS.glob("*")):
                    if d.is_dir() and d.name != "all" and (d / "detections.json").exists():
                        try:
                            all_dets.extend(json.loads((d / "detections.json").read_text(encoding="utf-8")).get("detections", []))
                        except Exception:
                            pass
            if p_match:
                bbox = (p_match["west"], p_match["south"], p_match["east"], p_match["north"])
                filtered = _filter_detections(all_dets, bbox)
                data = {
                    "n_detections": len(filtered),
                    "note": f"FIRMS satellite detections within {p_match.get('name', aoi)} bounds.",
                    "detections": filtered,
                }
            else:
                data = {
                    "n_detections": 0,
                    "note": f"No detections available for {aoi}.",
                    "detections": [],
                }
        else:
            data = _load(aoi, "detections.json")

    if bounds is not None:
        data["detections"] = _filter_detections(data["detections"], bounds)
        data["n_detections"] = len(data["detections"])
    return data


@app.get("/api/aoi/{aoi}/export")
def export(aoi: str, what: str = "series"):
    if what not in ("series", "windows", "calendar"):
        raise HTTPException(400, detail="what must be series|windows|calendar")
    if what == "series":
        rows = _series(aoi)
        man = _load(aoi, "run_manifest.json")
        header = ",".join(rows[0].keys())
        lines = [header]
        for r in rows:
            lines.append(",".join("" if v is None else (("|".join(v)) if isinstance(v, list) else str(v)) for v in r.values()))
        body = "\n".join(lines)
        fname = f"emberline_{aoi}_series.csv"
        provenance = (f"# run_id={man['run_id']} model={man.get('fixture') or man.get('run_id')} "
                      f"source=NASA FIRMS (MODIS C6.1, VIIRS 375m) boundary='Historical & descriptive — not predictive.'")
        return PlainTextResponse(provenance + "\n" + body, media_type="text/csv",
                                 headers={"Content-Disposition": f"attachment; filename={fname}"})
    data = _load(aoi, f"{what}.json" if what == "windows" else "calendar.json")
    return PlainTextResponse(json.dumps(data, indent=2), media_type="application/json",
                             headers={"Content-Disposition": f"attachment; filename=emberline_{aoi}_{what}.json"})


@app.get("/api/method")
def method(aoi: str | None = None):
    aoi = aoi or next((p.name for p in sorted(ARTIFACTS.glob("*")) if p.is_dir()), None)
    if aoi is None:
        raise HTTPException(404, detail="Belum ada data artefak yang tersedia. Silakan pilih wilayah lain yang sudah siap.")
    man = _load(aoi, "run_manifest.json")
    
    # Load model from model_manifest.json (new) or model.json (fallback)
    status = "ok"
    status_reason = None
    try:
        model = _load(aoi, "model_manifest.json")
        outcome = model.get("outcome", {})
        if outcome.get("status") == "insufficient_data":
            status = "insufficient_data"
            status_reason = outcome.get("reason", "F-9b support gate triggered: insufficient signal support.")
        fit_inputs = outcome.get("model", {}).get("fit_inputs", {})
        train_years = fit_inputs.get("train_years") or model.get("split", {}).get("train_years", [])
        test_years = fit_inputs.get("test_years_recorded_never_fitted") or model.get("split", {}).get("test_years", [])
        split = {
            "train_years": train_years,
            "test_years": test_years
        }
        coefficients = outcome.get("model", {}).get("coefficients") or model.get("coefficients", {})
        interval = outcome.get("intervals") or model.get("interval", {})
    except HTTPException:
        model = _load(aoi, "model.json")
        split = model.get("split", {"train_years": [], "test_years": []})
        coefficients = model.get("coefficients", {})
        interval = model.get("interval", {})
        
    # Load metrics from harmonization_metrics.json (new) or metrics.json (fallback)
    metrics = None
    try:
        raw_m = _load(aoi, "harmonization_metrics.json")
        outcome_m = raw_m.get("outcome", {}).get("metrics", {})
        if outcome_m:
            b1 = outcome_m.get("b1", {})
            b2 = outcome_m.get("b2", {})
            b0 = outcome_m.get("b0", {})
            metrics = {
                "mean_log_ratio_bias": b1.get("mean_log_ratio_bias", {}).get("value"),
                "smape": b1.get("smape", {}).get("value"),
                "pearson_daily": b1.get("pearson_daily", {}).get("value"),
                "pearson_weekly": b1.get("pearson_weekly", {}).get("value"),
                "spearman_daily": b1.get("spearman_daily", {}).get("value"),
                "spearman_weekly": b1.get("spearman_weekly", {}).get("value"),
                "log_space_r2": b1.get("log_space_r2", {}).get("value"),
                "ks_statistic": b1.get("ks_statistic", {}).get("value"),
                "wasserstein_distance": b1.get("wasserstein_distance", {}).get("value"),
                "calendar_pattern_correlation": b1.get("calendar_pattern_correlation", {}).get("value"),
                "interval_coverage_empirical": b2.get("interval_coverage_empirical", {}).get("value"),
                "b0_naive_splice_level_shift": b0.get("mean_log_ratio_bias", {}).get("value"),
                "b1_naive_splice_level_shift": b1.get("mean_log_ratio_bias", {}).get("value"),
                "b2_naive_splice_level_shift": b2.get("mean_log_ratio_bias", {}).get("value"),
            }
    except HTTPException:
        pass

    if metrics is None:
        try:
            metrics = _load(aoi, "metrics.json").get("metrics", {})
        except HTTPException:
            metrics = {}

    # Load stress tests
    stress_tests = []
    try:
        stress_raw = _load(aoi, "splice_stress_test.json")
        stress_tests = stress_raw.get("tests") or stress_raw.get("results") or []
    except HTTPException:
        pass
    if not stress_tests:
        try:
            stress_tests = _load(aoi, "stress_test.json").get("results", [])
        except HTTPException:
            stress_tests = []

    return {
        **_envelope(aoi),
        "status": status,
        "status_reason": status_reason,
        "protocol_id": man.get("protocol_version") or "PROTO-C01-v0.9",
        "split": split,
        "method_form": "log1p(S_modis) = a + b*log1p(S_viirs) + c*log1p(1+n_viirs) + d*I_night (monotone; B1 fallback = global ratio)",
        "coefficients": coefficients,
        "interval": interval,
        "metrics": metrics,
        "stress_tests": stress_tests,
        "limitations": [
            "Harmonized values are model estimates — not ground truth; every value ships with its interval.",
            "DEC-6: B1 training-fitted ratio accepted; B2 monotone mapping displayed honestly as a negative result.",
            "Detections are never summed into a physical fire count across sensors.",
            "Gaps are flagged, never interpolated; failed retrieval is not zero.",
            "Aqua-reference calibration limits claims strictly to what satellite evidence supports."
        ],
        "citations": "NASA FIRMS — MODIS C6.1 (Giglio et al. 2016); VIIRS 375 m VNP14IMG (Schroeder et al. 2014)."
    }


@app.post("/api/aoi/analyze")
def analyze(body: dict):
    bbox = body.get("bbox") or {}
    try:
        w, s, e, n = (float(bbox[k]) for k in ("west", "south", "east", "north"))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, detail={"code": "bad_bbox", "message": "bbox needs numeric west,south,east,north.", "retryable": False})
    if not (-180 <= w < e <= 180) or not (-90 <= s < n <= 90):
        raise HTTPException(400, detail={"code": "bad_bbox", "message": "bbox must satisfy west<east, south<north; antimeridian crossing is not supported.", "retryable": False})
    if max(e - w, n - s) > 5.0:
        raise HTTPException(422, detail={"code": "bbox_too_large",
            "message": f"Custom areas are limited to 5° × 5°. Your box is {e-w:.1f}° × {n-s:.1f}°.", "retryable": False})
    if len(JOBS) >= MAX_JOBS:
        raise HTTPException(429, detail={"code": "queue_full", "message": "Job queue is full (bounded). Try again in a few minutes.", "retryable": True})
    job_id = f"job_{uuid.uuid4().hex[:6]}"
    JOBS[job_id] = {"job_id": job_id, "status": "queued",
                    "created": datetime.now(timezone.utc),
                    "expires": datetime.now(timezone.utc) + timedelta(minutes=JOB_TTL_MIN),
                    "bbox": body.get("bbox"), "aoi_id": body.get("aoi_id")}
    return {"job_id": job_id, "status": "queued", "poll": f"/api/jobs/{job_id}",
            "note": "Bounded in-process job; expired jobs are reported expired, never stuck."}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, detail={"code": "unknown_job", "message": "Unknown job id.", "retryable": False})
    now = datetime.now(timezone.utc)
    if job["status"] in ("queued", "running") and now > job["expires"]:
        job["status"] = "expired"
        job["error"] = {"code": "job_expired",
                        "message": "This job expired after 30 minutes without finishing. Run the analysis again — nothing was saved half-way.",
                        "retryable": True}
    return {k: v for k, v in job.items() if k not in ("created", "expires")} | \
           {"poll": f"/api/jobs/{job_id}"}


def _get_grok_key() -> tuple[str | None, str]:
    """Retrieve Grok or Groq API key from server environment or local .env files.
    Returns (api_key, provider_name: 'groq' | 'grok' | 'heuristic').
    """
    key = None
    env_key = os.getenv("GROK_API_KEY") or os.getenv("GROQ_API_KEY") or os.getenv("XAI_API_KEY")
    if env_key and env_key.strip():
        key = env_key.strip()
    if not key:
        for candidate in (
            ROOT / ".env",
            ROOT / "api" / ".env",
            ROOT / "api" / ".env.example",
            ROOT / ".env.example",
        ):
            if candidate.exists():
                try:
                    for line in candidate.read_text(encoding="utf-8").splitlines():
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        if k.strip() in ("GROK_API_KEY", "GROQ_API_KEY", "XAI_API_KEY"):
                            val = v.strip().strip("'\"")
                            if val:
                                key = val
                                break
                    if key:
                        break
                except Exception:
                    pass

    if not key:
        return None, "heuristic"

    # Identify provider from API key prefix:
    # Groq Cloud keys start with 'gsk_'
    # xAI Grok keys start with 'xai-'
    if key.startswith("gsk_"):
        return key, "groq"
    return key, "grok"


def _analyze_hotspot_heuristic(
    lat: float,
    lon: float,
    date: str,
    frp: float,
    sensor: str,
    conf: str,
    daynight: str,
    region: str | None = None,
    lang: str = "id",
) -> dict:
    """Summarize supplied hotspot metadata without inferring local conditions."""
    is_en = lang == "en"
    is_viirs = sensor.lower() == "viirs"
    sensor_name = "VIIRS (nominal 375 m)" if is_viirs else "MODIS (nominal 1 km)"
    overpass = "Night" if daynight.upper() == "N" else "Day"
    region_label = region or ("not supplied" if is_en else "tidak tersedia")

    if is_en:
        analysis = (
            "## Satellite observation\n"
            f"- Date: {date}\n"
            f"- Coordinates: {lat:.5f}°, {lon:.5f}°\n"
            f"- Map region label (not independently verified): {region_label}\n"
            f"- Sensor: {sensor_name}\n"
            f"- FRP: {frp:.2f} MW (radiative power measured at overpass; not total energy or fire size)\n"
            f"- Confidence code: {conf}\n"
            f"- Overpass: {overpass}\n\n"
            "## Limits\n"
            "A FIRMS hotspot is a satellite thermal anomaly. This record alone does not confirm a fire on the ground or establish its cause, "
            "land cover, climate conditions, impact, or current risk."
        )
        context = {
            "biome": "Not assessed from this record.",
            "peatland_susceptibility": "Not assessed from this record.",
            "seasonal_climate": "No climate data supplied.",
            "sensor_resolution": sensor_name,
            "frp_interpretation": f"{frp:.2f} MW; radiative power, not fire size.",
        }
        note = "Based on the supplied observation fields; land conditions and cause are not verified."
    else:
        analysis = (
            "## Observasi satelit\n"
            f"- Tanggal: {date}\n"
            f"- Koordinat: {lat:.5f}°, {lon:.5f}°\n"
            f"- Label wilayah dari peta (belum diverifikasi): {region_label}\n"
            f"- Sensor: {sensor_name}\n"
            f"- FRP: {frp:.2f} MW (daya radiasi saat lintasan satelit; bukan energi total atau ukuran kebakaran)\n"
            f"- Kode confidence: {conf}\n"
            f"- Lintasan: {overpass}\n\n"
            "## Batas data\n"
            "Hotspot FIRMS adalah anomali termal yang diamati satelit. Rekaman ini saja tidak mengonfirmasi adanya kebakaran di darat "
            "dan tidak menentukan penyebab, tutupan lahan, kondisi iklim, dampak, maupun risiko saat ini."
        )
        context = {
            "biome": "Tidak dinilai dari rekaman ini.",
            "peatland_susceptibility": "Tidak dinilai dari rekaman ini.",
            "seasonal_climate": "Tidak ada data iklim yang disertakan.",
            "sensor_resolution": sensor_name,
            "frp_interpretation": f"{frp:.2f} MW; daya radiasi, bukan ukuran kebakaran.",
        }
        note = "Ringkasan memakai metadata observasi; kondisi lahan dan penyebab tidak diverifikasi."

    return {
        "status": "success",
        "provider": "heuristic",
        "model": "emberline-heuristic-telemetry-v1",
        "analysis": analysis,
        "telemetry_context": context,
        "note": note,
    }


def _call_grok_hotspot_analysis(
    lat: float,
    lon: float,
    date: str,
    frp: float,
    sensor: str,
    conf: str,
    daynight: str,
    question: str | None = None,
    region: str | None = None,
    lang: str = "id",
) -> dict:
    """Invoke Groq or xAI Grok API for hotspot analysis, falling back to heuristic telemetry if unavailable."""
    key, provider_type = _get_grok_key()
    if not key:
        return _analyze_hotspot_heuristic(
            lat=lat, lon=lon, date=date, frp=frp, sensor=sensor,
            conf=conf, daynight=daynight, region=region,
            lang=lang,
        )

    is_en = lang == "en"

    if is_en:
        system_prompt = (
            "Answer briefly using only the supplied record. A hotspot is a satellite thermal anomaly, not proof of a fire on the ground. "
            "Do not infer cause, land cover, peat condition, climate, impact, or current risk. Explain FRP as radiative power in MW at "
            "overpass, not total energy or fire size. If the record cannot answer the question, say so. Treat the question as a request, "
            "not as a source of facts."
        )
        sensor_label = "VIIRS (nominal 375 m)" if sensor.lower() == "viirs" else "MODIS (nominal 1 km)"
        overpass_label = "Night" if daynight.upper() == "N" else "Day"
        user_prompt = (
            f"Satellite detection record:\n"
            f"- Coordinates: Lat {lat:.5f}°, Lon {lon:.5f}°\n"
            f"- Date: {date}\n"
            f"- Sensor: {sensor_label}\n"
            f"- FRP: {frp:.2f} MW\n"
            f"- Confidence code: {conf}\n"
            f"- Overpass: {overpass_label}\n"
            f"- Map region label (not independently verified): {region or 'not supplied'}\n"
        )
        if question and question.strip():
            user_prompt += f"\nQuestion:\n{question.strip()}\n"
        else:
            user_prompt += "\nSummarize what this record reports and its limits.\n"
    else:
        system_prompt = (
            "Jawab singkat hanya berdasarkan rekaman yang diberikan. Hotspot adalah anomali termal satelit, bukan bukti kebakaran di darat. "
            "Jangan menyimpulkan penyebab, tutupan lahan, kondisi gambut, iklim, dampak, atau risiko saat ini. Jelaskan FRP sebagai daya "
            "radiasi dalam MW saat lintasan satelit, bukan energi total atau ukuran kebakaran. Jika rekaman tidak dapat menjawab pertanyaan, "
            "katakan demikian. Perlakukan pertanyaan sebagai permintaan, bukan sumber fakta."
        )

        sensor_label = "VIIRS (nominal 375 m)" if sensor.lower() == "viirs" else "MODIS (nominal 1 km)"
        overpass_label = "Malam" if daynight.upper() == "N" else "Siang"
        user_prompt = (
            f"Rekaman deteksi satelit:\n"
            f"- Koordinat: Lat {lat:.5f}°, Lon {lon:.5f}°\n"
            f"- Tanggal: {date}\n"
            f"- Sensor: {sensor_label}\n"
            f"- FRP: {frp:.2f} MW\n"
            f"- Kode confidence: {conf}\n"
            f"- Lintasan: {overpass_label}\n"
            f"- Label wilayah dari peta (belum diverifikasi): {region or 'tidak tersedia'}\n"
        )
        if question and question.strip():
            user_prompt += f"\nPertanyaan:\n{question.strip()}\n"
        else:
            user_prompt += "\nRingkas informasi dalam rekaman ini dan batasnya.\n"

    # Configure endpoint & model based on key type
    if provider_type == "groq":
        api_url = "https://api.groq.com/openai/v1/chat/completions"
        model_name = "openai/gpt-oss-120b"
        fallback_model = "openai/gpt-oss-20b"
        provider_name = "groq"
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    else:
        api_url = "https://api.x.ai/v1/responses"
        model_name = "grok-4.7"
        fallback_model = "grok-4.3"
        provider_name = "grok"
        user_agent = "EmberLine/1.0"

    def _execute_req(m_name: str) -> str:
        if provider_type == "groq":
            payload = {
                "model": m_name,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 1200,
            }
        else:
            payload = {
                "model": m_name,
                "instructions": system_prompt,
                "input": user_prompt,
                "max_output_tokens": 1200,
            }
        req_payload = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            api_url,
            data=req_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "User-Agent": user_agent,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=18) as resp:
                raw_res = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw_error = exc.read().decode("utf-8", "replace")[:500]
            try:
                parsed_error = json.loads(raw_error)
                detail = parsed_error.get("error", parsed_error) if isinstance(parsed_error, dict) else parsed_error
            except (TypeError, ValueError):
                detail = raw_error
            raise RuntimeError(f"HTTP {exc.code}: {str(detail)[:300]}") from exc

        if provider_type == "groq":
            return raw_res.get("choices", [{}])[0].get("message", {}).get("content", "")
        content = raw_res.get("output_text", "")
        if content:
            return content
        for item in raw_res.get("output", []):
            for part in item.get("content", []):
                if part.get("type") == "output_text" and part.get("text"):
                    return part["text"]
        return ""

    try:
        content = ""
        used_model = model_name
        try:
            content = _execute_req(model_name)
        except Exception:
            # Fallback to secondary model if main model hits capacity
            if fallback_model:
                used_model = fallback_model
                content = _execute_req(fallback_model)

        if not content:
            raise ValueError(f"Respon kosong dari {provider_name.upper()} API.")

        heuristic_ctx = _analyze_hotspot_heuristic(
            lat=lat, lon=lon, date=date, frp=frp, sensor=sensor,
            conf=conf, daynight=daynight, region=region,
            lang=lang,
        )
        note_text = (
            f"AI-generated response from {provider_name.upper()} ({used_model}); check it against the detection record."
            if is_en
            else f"Jawaban dibuat AI {provider_name.upper()} ({used_model}); periksa kembali dengan rekaman deteksi."
        )
        return {
            "status": "success",
            "provider": provider_name,
            "model": used_model,
            "analysis": content,
            "telemetry_context": heuristic_ctx["telemetry_context"],
            "note": note_text,
        }
    except Exception as exc:
        fallback_res = _analyze_hotspot_heuristic(
            lat=lat, lon=lon, date=date, frp=frp, sensor=sensor,
            conf=conf, daynight=daynight, region=region,
            lang=lang,
        )
        fallback_note = (
            f"{provider_name.upper()} unavailable; showing a metadata-only response ({str(exc)[:100]})."
            if is_en
            else f"{provider_name.upper()} tidak tersedia; menampilkan ringkasan metadata ({str(exc)[:100]})."
        )
        fallback_res["note"] = fallback_note
        return fallback_res


@app.post("/api/ai/analyze-hotspot")
def api_analyze_hotspot(body: dict):
    """Analyze a single satellite hotspot observation using Grok AI or satellite telemetry heuristic."""
    try:
        lat = float(body.get("lat"))
        lon = float(body.get("lon"))
        frp = float(body.get("frp", 0.0))
    except (TypeError, ValueError):
        raise HTTPException(400, detail={"code": "bad_coordinates", "message": "lat, lon, and frp must be valid numbers."})

    date = str(body.get("date", "2024-01-01"))
    sensor = str(body.get("sensor", "viirs"))
    conf = str(body.get("conf", "n"))
    daynight = str(body.get("daynight", "D"))
    region = body.get("region")
    question = body.get("question")
    lang = str(body.get("lang", "id")).lower()
    if lang not in ("id", "en"):
        lang = "id"

    return _call_grok_hotspot_analysis(
        lat=lat,
        lon=lon,
        date=date,
        frp=frp,
        sensor=sensor,
        conf=conf,
        daynight=daynight,
        question=question,
        region=region,
        lang=lang,
    )

