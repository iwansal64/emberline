import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import type { ReactNode } from "react";
import { stageState } from "./stageState";
import { useAoi } from "../App";
import { api, Preset } from "../api";
import { PRESET_NAMES } from "../presets";
import SearchableRegionSelect from "./SearchableRegionSelect";

type ActWindow = [number, number, number, number];

const PEATLAND_BASE_OFFSETS: Record<string, { offset: number; peakMonthId: string; peakMonthEn: string }> = {
  riau: { offset: -13, peakMonthId: "Agu", peakMonthEn: "Aug" },
  jambi: { offset: -7, peakMonthId: "Sep", peakMonthEn: "Sep" },
  central_kalimantan: { offset: 0, peakMonthId: "Sep", peakMonthEn: "Sep" },
  south_sumatra: { offset: +7, peakMonthId: "Okt", peakMonthEn: "Oct" },
  merauke: { offset: +25, peakMonthId: "Nov", peakMonthEn: "Nov" },
};

export function RiskGaugeCard({ presets: propPresets }: { presets?: Preset[] }) {
  const { aoi, setAoi, lang, t } = useAoi();
  const [presets, setPresets] = useState<Preset[]>(propPresets ?? []);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{ score: number; peakMonth: string; label: string; color: string } | null>(null);
  const score = useMotionValue(24);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * (260 / 360);

  useEffect(() => {
    if (propPresets && propPresets.length > 0) {
      setPresets(propPresets);
      return;
    }
    api.presets().then(r => setPresets(r.presets)).catch(() => { });
  }, [propPresets]);

  useEffect(() => {
    let cancelled = false;
    api.calendar(aoi).then(cal => {
      if (cancelled || !cal?.years?.length) return;
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayMd = `${mm}-${dd}`;

      const todayIndexes: number[] = [];
      const monthTotals = new Map<string, number>();

      for (const y of cal.years) {
        for (const p of y.positions) {
          if (p.month_day === todayMd && p.index != null) {
            todayIndexes.push(p.index);
          }
          const m = p.month_day.slice(0, 2);
          monthTotals.set(m, (monthTotals.get(m) ?? 0) + (p.value_mw ?? 0));
        }
      }

      const avgIdx = todayIndexes.length
        ? todayIndexes.reduce((a, b) => a + b, 0) / todayIndexes.length
        : 0.20;
      let targetScore = Math.min(100, Math.max(0, Math.round(avgIdx * 100)));

      let maxMonth = "08";
      let maxVal = -1;
      monthTotals.forEach((val, m) => {
        if (val > maxVal) { maxVal = val; maxMonth = m; }
      });
      const monthNames = lang === "en"
        ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      let peakName = monthNames[Number(maxMonth) - 1] ?? "Agu";

      const isEn = lang === "en";

      // Regional differentiation for synthetic benchmark baselines
      if (PEATLAND_BASE_OFFSETS[aoi]) {
        targetScore = Math.min(100, Math.max(5, targetScore + PEATLAND_BASE_OFFSETS[aoi].offset));
        peakName = isEn ? PEATLAND_BASE_OFFSETS[aoi].peakMonthEn : PEATLAND_BASE_OFFSETS[aoi].peakMonthId;
      }

      if (selectedProvince) {
        let hash = 0;
        for (let i = 0; i < selectedProvince.length; i++) hash = (hash * 31 + selectedProvince.charCodeAt(i)) & 0xff;
        const provDelta = (hash % 7) - 3;
        targetScore = Math.min(100, Math.max(5, targetScore + provDelta));
      }

      const label = targetScore >= 75
        ? (isEn ? "Danger" : "Bahaya")
        : targetScore >= 50
        ? (isEn ? "Alert" : "Siaga")
        : targetScore >= 25
        ? (isEn ? "Advisory" : "Waspada")
        : (isEn ? "Safe" : "Aman");
      const color = targetScore >= 75
        ? "#EF4444"
        : targetScore >= 50
        ? "#F97316"
        : targetScore >= 25
        ? "#FACC15"
        : "var(--safe)";

      setTelemetry({ score: targetScore, peakMonth: peakName, label, color });
    }).catch(() => {
      setTelemetry({ score: 24, peakMonth: "Agu", label: lang === "en" ? "Safe" : "Aman", color: "var(--safe)" });
    });
    return () => { cancelled = true; };
  }, [aoi, lang, selectedProvince]);

  const currentScore = telemetry?.score ?? 24;
  const statusColor = telemetry?.color ?? "var(--safe)";
  const statusLabel = telemetry?.label ?? t("hud_safe");
  const peakMonth = telemetry?.peakMonth ?? (lang === "en" ? "Aug" : "Ags");
  const activeRegionName = selectedProvince || (PRESET_NAMES[lang]?.[aoi] ?? presets.find(p => p.id === aoi)?.name ?? aoi);

  const [displayScore, setDisplayScore] = useState<number>(currentScore);

  useEffect(() => {
    const controls = animate(score.get(), currentScore, {
      duration: 1.0,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: latest => {
        score.set(latest);
        setDisplayScore(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [score, currentScore]);

  return (
    <div
      className="hero-hud-card"
      role="region"
      aria-label={t("hud_aria")}
    >
      <div className="hero-hud-heading">
        <span className="hero-hud-kicker">{t("hud_kicker")}</span>
        <span className="hero-hud-live"><i /> {t("hud_demo")}</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <SearchableRegionSelect
          value={aoi}
          onChange={(newAoi, provName) => {
            setAoi(newAoi);
            setSelectedProvince(provName ?? null);
          }}
          presets={presets}
          lang={lang}
          compact
          style={{ width: "100%" }}
        />
      </div>

      <div className="hero-hud-main">
        <div className="hero-gauge">
          <svg viewBox="0 0 128 128" aria-hidden="true">
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="var(--hud-track)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference}`}
            />
            <motion.circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke={statusColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${arc * (displayScore / 100)} ${circumference}`}
              animate={{ strokeDasharray: `${arc * (displayScore / 100)} ${circumference}` }}
              transition={{ duration: 0.1, ease: "linear" }}
            />
          </svg>
          <div className="hero-gauge-value">
            <strong>{displayScore.toString().padStart(2, "0")}</strong>
            <span>/100</span>
            <b style={{ color: statusColor }}><span style={{ background: statusColor }} /> {statusLabel}</b>
          </div>
        </div>

        <div className="hero-hud-metrics">
          <div><span>{t("hud_concept_coverage")}</span><strong>{displayScore}/100</strong></div>
          <div><span>{t("hud_obs_label")}</span><strong>{peakMonth}</strong></div>
          <div><span>{lang === "id" ? "Wilayah Pantau" : "Monitored Region"}</span><strong style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={activeRegionName}>{activeRegionName}</strong></div>
        </div>
      </div>

      <p className="hero-hud-note">
        {t("hud_note")}
      </p>
    </div>
  );
}

function RiskLevel({
  progress,
  reduced,
  label,
  color,
  border,
  range,
}: {
  progress: MotionValue<number>;
  reduced: boolean;
  label: string;
  color: string;
  border?: string;
  range: [number, number];
}) {
  const scaleX = useTransform(progress, range, reduced ? [1, 1] : [0.28, 1]);
  const opacity = useTransform(progress, range, reduced ? [1, 1] : [0.35, 1]);

  return (
    <div className="story-risk-level">
      <motion.span
        style={{
          backgroundColor: color,
          border: border ?? "none",
          boxShadow: color === "#FFFFFF" ? "0 0 13px rgba(255, 255, 255, 0.4)" : `0 0 13px ${color}55`,
          scaleX: reduced ? 1 : scaleX,
          opacity: reduced ? 1 : opacity,
        }}
      />
      <small>{label}</small>
    </div>
  );
}

function RiskScale({ progress, reduced }: { progress: MotionValue<number>; reduced: boolean }) {
  const { t } = useAoi();
  const riskLevels = [
    { label: t("story_density_no_data"), color: "#FFFFFF", border: "1px solid rgba(255, 255, 255, 0.6)", range: [0.37, 0.42] as [number, number] },
    { label: t("story_density_zero"), color: "#94A3B8", range: [0.41, 0.46] as [number, number] },
    { label: t("story_density_low"), color: "#FACC15", range: [0.45, 0.50] as [number, number] },
    { label: t("story_density_medium"), color: "#F97316", range: [0.49, 0.54] as [number, number] },
    { label: t("story_density_high"), color: "#EF4444", range: [0.53, 0.58] as [number, number] },
  ];

  return (
    <div className="story-risk-scale" aria-label={t("story_risk_scale_aria")}>
      {riskLevels.map(level => (
        <RiskLevel {...level} key={level.label} progress={progress} reduced={reduced} />
      ))}
    </div>
  );
}

function ActPanel({
  progress,
  range,
  index,
  eyebrow,
  title,
  emphasis,
  body,
  align,
  reduced,
  children,
}: {
  progress: MotionValue<number>;
  range: ActWindow;
  index: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  body: string;
  align: "left" | "right";
  reduced: boolean;
  children?: ReactNode;
}) {
  const [fadeIn, fullIn, fullOut, fadeOut] = range;
  const opacity = useTransform(progress, [fadeIn, fullIn, fullOut, fadeOut], [0, 1, 1, reduced ? 1 : 0]);
  const y = useTransform(progress, [fadeIn, fullIn, fullOut, fadeOut], [reduced ? 0 : 32, 0, 0, reduced ? 0 : -32]);
  const blur = useTransform(
    progress,
    [fadeIn, fullIn, fullOut, fadeOut],
    reduced ? ["blur(0px)", "blur(0px)", "blur(0px)", "blur(0px)"] : ["blur(6px)", "blur(0px)", "blur(0px)", "blur(6px)"],
  );

  return (
    <motion.article
      className={`story-act story-act-${align}`}
      style={{ opacity: reduced ? 1 : opacity, y: reduced ? 0 : y, filter: reduced ? "none" : blur }}
      aria-label={`${index} ${eyebrow}`}
    >
      <p className="story-act-kicker"><span>{index}</span> {eyebrow}</p>
      <h2>{title} <em>{emphasis}</em></h2>
      <p className="story-act-copy">{body}</p>
      {children}
    </motion.article>
  );
}

function StoryProgress({ progress }: { progress: MotionValue<number> }) {
  const { t } = useAoi();
  const scaleY = useTransform(progress, [0.02, 0.98], [0.02, 1]);
  return (
    <div className="story-progress" aria-hidden="true">
      <span>{t("story_progress_label")}</span>
      <div className="story-progress-track">
        <motion.i style={{ scaleY, transformOrigin: "top" }} />
      </div>
      <div className="story-progress-dots"><i /><i /><i /></div>
    </div>
  );
}

export default function ScrollyActs() {
  const { t } = useAoi();
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const reduced = prefersReducedMotion ?? false;
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", value => {
    stageState.progress = reduced ? 0 : value;
  });

  useEffect(() => {
    stageState.progress = 0;
    stageState.smoothProgress = 0;
    if (reduced) stageState.progress = 0;
  }, [reduced]);

  return (
    <section
      className={`overview-story${reduced ? " overview-story-static" : ""}`}
      id="cerita"
      ref={sectionRef}
      style={{ height: reduced ? "auto" : "800svh" }}
      aria-label={t("story_aria_section")}
    >
      <StoryProgress progress={scrollYProgress} />
      <div className="overview-story-sticky">
        <ActPanel
          progress={scrollYProgress}
          range={[0, 0.06, 0.27, 0.36]}
          index="01"
          eyebrow={t("story_act1_eyebrow")}
          title={t("story_act1_title")}
          emphasis={t("story_act1_emphasis")}
          body={t("story_act1_body")}
          align="left"
          reduced={reduced}
        >
          <div className="story-chip-row"><span>MODIS C6.1</span><span>VIIRS 375 m</span><span>FIRMS</span></div>
        </ActPanel>
        <ActPanel
          progress={scrollYProgress}
          range={[0.32, 0.4, 0.6, 0.68]}
          index="02"
          eyebrow={t("story_act2_eyebrow")}
          title={t("story_act2_title")}
          emphasis={t("story_act2_emphasis")}
          body={t("story_act2_body")}
          align="right"
          reduced={reduced}
        >
          <RiskScale progress={scrollYProgress} reduced={reduced} />
        </ActPanel>
        <ActPanel
          progress={scrollYProgress}
          range={[0.64, 0.72, 0.95, 1]}
          index="03"
          eyebrow={t("story_act3_eyebrow")}
          title={t("story_act3_title")}
          emphasis={t("story_act3_emphasis")}
          body={t("story_act3_body")}
          align="left"
          reduced={reduced}
        >
          <div className="story-chip-row">
            <span className="story-safe-chip"><i /> {t("story_act3_chip_historical")}</span>
            <span>{t("story_act3_chip_agency")}</span>
          </div>
        </ActPanel>
      </div>
    </section>
  );
}
