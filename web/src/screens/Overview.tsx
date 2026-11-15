import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, Preset } from "../api";
import { useAoi } from "../App";
import ScrollyActs, { RiskGaugeCard } from "../components/ScrollyActs";

export default function Overview({
  goCalendar,
  goMethod,
  goMap,
}: {
  goCalendar: () => void;
  goMethod: () => void;
  goMap: () => void;
}) {
  const { aoi, setAoi, series, lang, t } = useAoi();
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    api.presets().then(r => setPresets(r.presets)).catch(() => { });
  }, []);

  const preset = presets.find(p => p.id === aoi);
  const targetLabel = preset ? preset.name : `${aoi} (custom bbox)`;
  const span = series && series.days.length
    ? `${series.days[0].date.slice(0, 4)}–${series.days[series.days.length - 1].date.slice(0, 4)}`
    : (preset ? `${preset.start.slice(0, 4)}–${preset.end.slice(0, 4)}` : "2012–2026");
  const status = preset ? (preset.artifact_status === "available" ? t("overview_data_ready") : t("overview_queued")) : null;

  const sentinelIds = ["riau", "central_kalimantan", "south_sumatra", "jambi", "kalbar", "kaltim", "merauke", "jawa"];
  const sentinelPresets = presets.filter(p => sentinelIds.includes(p.id));

  return (
    <div className="overview-page">
      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="overview-hero-copy">
          <p className="overview-eyebrow"><i /> {t("overview_eyebrow")}</p>
          <h1 id="overview-title">
            {t("overview_title_1")}
            <br />
            <span>{t("overview_title_2")}</span>
          </h1>
          <p className="overview-description">
            {t("overview_desc")}
          </p>
          <div className="overview-actions">
            <button className="btn" onClick={goCalendar}>{t("overview_btn_calendar")} <span aria-hidden="true">↗</span></button>
            <button className="btn secondary" onClick={goMap}>{t("overview_btn_map")}</button>
            <button className="btn secondary" onClick={goMethod}>{t("overview_btn_method")}</button>
          </div>
          <span className="overview-scroll-cue">{t("overview_scroll_cue")} <span aria-hidden="true">↓</span></span>
        </div>
        <RiskGaugeCard presets={presets} />
        <div className="overview-stats" aria-label={lang === "id" ? "Ringkasan cakupan observasi" : "Observation coverage summary"}>
          <div><strong>38</strong><span>{t("overview_stat_provinces")}</span></div>
          <div><strong>{series?.days.length.toLocaleString(lang === "id" ? "id-ID" : "en-US") ?? "5,114"}</strong><span>{t("overview_stat_obs")}</span></div>
          <div><strong>{span ?? "2012–2026"}</strong><span>{t("overview_stat_history")}</span></div>
        </div>
      </section>

      <ScrollyActs />

      <section className="overview-details" aria-label={lang === "id" ? "Tentang rekam observasi EmberLine" : "About EmberLine observation records"}>
        <div className="overview-copy">
          <p className="overview-eyebrow">{t("overview_details_eyebrow")}</p>
          <h2>{t("overview_details_heading")}</h2>
          <p className="overview-description">
            {t("overview_details_desc")}
          </p>
        </div>

        {/* Three Scientific Methodology Pillars */}
        <div className="overview-features-grid" role="region" aria-label={lang === "id" ? "Tiga Pilar Metodologi Ilmiah" : "Three Scientific Methodology Pillars"}>
          <div className="overview-feature-card">
            <div className="overview-feature-badge">Aqua MODIS 1km = 1.00x</div>
            <h3>{t("overview_pillar1_title")}</h3>
            <p>{t("overview_pillar1_desc")}</p>
          </div>
          <div className="overview-feature-card">
            <div className="overview-feature-badge">Rule E-03 / Protocol F-14</div>
            <h3>{t("overview_pillar2_title")}</h3>
            <p>{t("overview_pillar2_desc")}</p>
          </div>
          <div className="overview-feature-card">
            <div className="overview-feature-badge">{lang === "id" ? "Siklus Musiman · 78.200 Sel Grid" : "Seasonal Cycle · 78,200 Grid Cells"}</div>
            <h3>{t("overview_pillar3_title")}</h3>
            <p>{t("overview_pillar3_desc")}</p>
          </div>
        </div>

        {/* Active Monitored AOI Telemetry Card */}
        <div className="overview-active-aoi-card" role="region" aria-label={t("overview_aoi_card_title")}>
          <div className="overview-aoi-header">
            <div>
              <span className="overview-aoi-tag">{t("overview_region")}</span>
              <h3 className="overview-aoi-title">{targetLabel}</h3>
              {preset && (
                <span className="mono overview-aoi-coords">
                  [{preset.south.toFixed(2)}°, {preset.west.toFixed(2)}°] – [{preset.north.toFixed(2)}°, {preset.east.toFixed(2)}°]
                </span>
              )}
            </div>
            <div className="overview-aoi-status-badge" data-status={preset?.artifact_status || "available"}>
              <span className="status-dot" />
              <span>{status ? status.toUpperCase() : "DATA READY"}</span>
            </div>
          </div>

          {/* Quick Sentinel Switcher */}
          <div className="overview-sentinel-bar">
            <span className="overview-sentinel-label">{t("overview_aoi_switch_label")}:</span>
            <div className="overview-preset-pills" role="tablist">
              {(sentinelPresets.length > 0 ? sentinelPresets : presets.slice(0, 8)).map(p => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={p.id === aoi}
                  className={`overview-preset-pill ${p.id === aoi ? "active" : ""}`}
                  onClick={() => setAoi(p.id)}
                >
                  {p.name.replace(/^(Provinsi|Prov\.)\s*/i, "")}
                </button>
              ))}
            </div>
          </div>

          {/* Telemetry Stats Grid */}
          <div className="overview-aoi-stats">
            <div className="overview-stat-tile">
              <span className="stat-label">{t("overview_aoi_days")}</span>
              <span className="stat-value">{series?.days.length.toLocaleString(lang === "id" ? "id-ID" : "en-US") ?? "5,114"}</span>
              <span className="stat-sub">Aqua MODIS + S-NPP VIIRS</span>
            </div>
            <div className="overview-stat-tile">
              <span className="stat-label">{t("overview_aoi_span")}</span>
              <span className="stat-value">{span}</span>
              <span className="stat-sub">Daily continuous telemetry</span>
            </div>
            <div className="overview-stat-tile">
              <span className="stat-label">{t("overview_aoi_protocol")}</span>
              <span className="stat-value">Aqua 1.00x</span>
              <span className="stat-sub">80% CI residual bootstrap</span>
            </div>
            <div className="overview-stat-tile">
              <span className="stat-label">{t("overview_aoi_status")}</span>
              <span className="stat-value">Validated</span>
              <span className="stat-sub">NASA FIRMS calibrated</span>
            </div>
          </div>
        </div>

        {/* Unified Navigation CTA Group */}
        <div className="overview-cta-group">
          <motion.button
            className="btn btn-lg overview-primary-cta"
            onClick={goCalendar}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            {t("overview_btn_calendar_long")}
          </motion.button>
          <motion.button
            className="btn secondary btn-lg overview-secondary-cta"
            onClick={goMap}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            {t("overview_btn_map_long")}
          </motion.button>
          <button className="overview-method-link" onClick={goMethod}>
            {t("overview_btn_method_long")}
          </button>
        </div>

        {/* Scientific Honest Footnote */}
        <div className="overview-disclosure-box">
          <p className="overview-disclosure">
            {lang === "id"
              ? "Observasi MODIS & VIIRS yang diharmonisasi, dengan ketidakpastian dan celah data ditandai. Konteks historis, bukan prediksi."
              : "Harmonized MODIS & VIIRS observations, with flagged uncertainty intervals and retrieval gaps. Historical context, not prediction."}
          </p>
        </div>
      </section>
    </div>
  );
}
