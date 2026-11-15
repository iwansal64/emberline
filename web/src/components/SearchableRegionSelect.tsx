import { useEffect, useMemo, useRef, useState } from "react";
import { Preset } from "../api";
import { PRESET_NAMES, PROVINCES_38, ProvinceEntry } from "../presets";

export interface SearchableRegionSelectProps {
  value: string;
  onChange: (aoi: string, provinceName?: string) => void;
  presets: Preset[];
  lang: "id" | "en";
  className?: string;
  style?: React.CSSProperties;
  label?: string;
  compact?: boolean;
}

export default function SearchableRegionSelect({
  value,
  onChange,
  presets,
  lang,
  className = "",
  style,
  label,
  compact = false,
}: SearchableRegionSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "presets" | "provinces">("all");
  const [selectedProvinceName, setSelectedProvinceName] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  // Determine current active display label
  const activeLabel = useMemo(() => {
    if (selectedProvinceName) {
      const parentPreset = PRESET_NAMES[lang]?.[value];
      return parentPreset ? `${selectedProvinceName} (${parentPreset.split(" ")[0]})` : selectedProvinceName;
    }
    return PRESET_NAMES[lang]?.[value] ?? presets.find(p => p.id === value)?.name ?? value;
  }, [value, selectedProvinceName, lang, presets]);

  // Filtered lists
  const filteredPresets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(p => {
      const nameId = (PRESET_NAMES.id[p.id] || "").toLowerCase();
      const nameEn = (PRESET_NAMES.en[p.id] || "").toLowerCase();
      const id = p.id.toLowerCase();
      return nameId.includes(q) || nameEn.includes(q) || id.includes(q);
    });
  }, [presets, query]);

  const filteredProvinces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROVINCES_38;
    return PROVINCES_38.filter(prov => {
      const name = prov.name.toLowerCase();
      const island = (lang === "id" ? prov.island : prov.islandEn).toLowerCase();
      const parentName = (PRESET_NAMES[lang]?.[prov.preset] || "").toLowerCase();
      return name.includes(q) || island.includes(q) || parentName.includes(q);
    });
  }, [query, lang]);

  const totalResults = (filterMode !== "provinces" ? filteredPresets.length : 0) +
                       (filterMode !== "presets" ? filteredProvinces.length : 0);

  const handleSelectPreset = (presetId: string) => {
    setSelectedProvinceName(null);
    onChange(presetId);
    setIsOpen(false);
  };

  const handleSelectProvince = (prov: ProvinceEntry) => {
    setSelectedProvinceName(prov.name);
    onChange(prov.preset, prov.name);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`region-picker-container ${className}`}
      style={{
        position: "relative",
        display: "inline-block",
        zIndex: isOpen ? 1000 : 1,
        ...style,
      }}
    >
      {label && (
        <span
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--ink2)",
            marginBottom: 6,
          }}
        >
          {label}
        </span>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        className="glass-select region-picker-btn"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          cursor: "pointer",
          textAlign: "left",
          minWidth: compact ? 200 : 280,
          maxWidth: "100%",
          width: style?.width === "100%" ? "100%" : undefined,
          boxSizing: "border-box",
          padding: compact ? "6px 12px" : "8px 14px",
          fontWeight: 600,
          fontSize: compact ? 12 : 13,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          boxShadow: isOpen ? "0 0 0 2px var(--ember-sub)" : "var(--shadow-sm)",
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--ember)", flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeLabel}
          </span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--ink3)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div
          role="listbox"
          className="region-picker-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 9999,
            width: "min(360px, calc(100vw - 32px))",
            maxWidth: "92vw",
            boxSizing: "border-box",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Search Header Bar */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              background: "var(--sunken)",
              borderRadius: 6,
              border: "1px solid var(--line)",
              padding: "2px 8px",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--ink3)", marginRight: 6 }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={lang === "id" ? "Cari 17 wilayah atau 38 provinsi…" : "Search 17 regions or 38 provinces…"}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "var(--ink)",
                padding: "6px 0",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink3)",
                  fontSize: 12,
                  padding: "2px 4px",
                }}
                title={lang === "id" ? "Hapus pencarian" : "Clear search"}
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs: All / Sentinel AOI / 38 Provinces */}
          <div
            style={{
              display: "flex",
              gap: 4,
              borderBottom: "1px solid var(--line)",
              paddingBottom: 6,
            }}
          >
            <button
              type="button"
              className={"map-segmented-btn" + (filterMode === "all" ? " active" : "")}
              onClick={() => setFilterMode("all")}
              style={{ flex: 1, padding: "3px 6px", fontSize: 10.5 }}
            >
              {lang === "id" ? "Semua" : "All"} ({presets.length + PROVINCES_38.length})
            </button>
            <button
              type="button"
              className={"map-segmented-btn" + (filterMode === "presets" ? " active" : "")}
              onClick={() => setFilterMode("presets")}
              style={{ flex: 1, padding: "3px 6px", fontSize: 10.5 }}
            >
              {lang === "id" ? "17 Sentinel" : "17 Sentinels"}
            </button>
            <button
              type="button"
              className={"map-segmented-btn" + (filterMode === "provinces" ? " active" : "")}
              onClick={() => setFilterMode("provinces")}
              style={{ flex: 1, padding: "3px 6px", fontSize: 10.5 }}
            >
              {lang === "id" ? "38 Provinsi" : "38 Provinces"}
            </button>
          </div>

          {/* Results List */}
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingRight: 2,
            }}
          >
            {totalResults === 0 && (
              <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--ink3)", fontSize: 11.5 }}>
                {lang === "id" ? `Tidak ada wilayah yang cocok dengan "${query}".` : `No regions match "${query}".`}
              </div>
            )}

            {/* Section: Sentinel Presets */}
            {filterMode !== "provinces" && filteredPresets.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--ink3)",
                    padding: "4px 8px 2px",
                  }}
                >
                  {lang === "id" ? "17 Wilayah Pantauan Utama (Sentinel AOI)" : "17 Primary Sentinel AOIs"}
                </div>
                {filteredPresets.map(p => {
                  const isSelected = p.id === value && !selectedProvinceName;
                  const labelStr = PRESET_NAMES[lang]?.[p.id] ?? p.name;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: isSelected ? "var(--ember-sub)" : "transparent",
                        color: isSelected ? "var(--ember)" : "var(--ink)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s ease",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = "var(--sunken)";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: isSelected ? "var(--ember)" : "var(--line-strong)",
                          }}
                        />
                        <span>{labelStr}</span>
                      </span>
                      <span className="mono" style={{ fontSize: 9.5, color: "var(--ink3)" }}>
                        {p.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Section: 38 Provinces */}
            {filterMode !== "presets" && filteredProvinces.length > 0 && (
              <div style={{ marginTop: filterMode === "all" ? 6 : 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--ink3)",
                    padding: "4px 8px 2px",
                  }}
                >
                  {lang === "id" ? "38 Provinsi di Indonesia (Terpetakan ke Sentinel)" : "38 Indonesian Provinces (Mapped to Sentinel)"}
                </div>
                {filteredProvinces.map(prov => {
                  const isSelected = selectedProvinceName === prov.name || (prov.preset === value && selectedProvinceName === null && filteredPresets.length === 0);
                  const targetSentinel = PRESET_NAMES[lang]?.[prov.preset]?.split(" ")[0] ?? prov.preset;
                  return (
                    <button
                      key={prov.name}
                      type="button"
                      onClick={() => handleSelectProvince(prov)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: isSelected ? "var(--ember-sub)" : "transparent",
                        color: isSelected ? "var(--ember)" : "var(--ink)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 12,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s ease",
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = "var(--sunken)";
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: isSelected ? "var(--ember)" : "var(--line-strong)",
                          }}
                        />
                        <span>{prov.name}</span>
                        <span style={{ fontSize: 10, color: "var(--ink3)" }}>
                          ({lang === "id" ? prov.island : prov.islandEn})
                        </span>
                      </span>
                      <span
                        className="state-chip mono"
                        style={{
                          fontSize: 9,
                          padding: "1px 6px",
                          background: "var(--sunken)",
                          border: "1px solid var(--line)",
                          color: "var(--ink2)",
                        }}
                      >
                        → {targetSentinel}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
