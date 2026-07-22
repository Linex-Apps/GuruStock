/**
 * GuruStock Embeddable Widget — v1.0
 * =====================================
 * A lightweight, self-contained web component for displaying live guru trade
 * data on any website. No React, no iframe — just drop in a script tag and
 * a custom element.
 *
 * ── Quick Start ──────────────────────────────────────────────────────────
 *
 *   1. Add the script to your page:
 *      <script src="https://gurustock.com/widget.js"></script>
 *
 *   2. Place a widget anywhere in your HTML:
 *      <gurustock-widget data-type="top-trades" data-theme="dark"></gurustock-widget>
 *
 * ── Widget Types ─────────────────────────────────────────────────────────
 *
 *   data-type="top-trades"     — Latest guru trades (optionally filtered by data-guru)
 *   data-type="scoreboard-mini" — Top 3 gurus by performance
 *   data-type="consensus-picks" — Tickers with 2+ gurus trading the same direction
 *
 * ── Attributes ───────────────────────────────────────────────────────────
 *
 *   data-type    Required. One of: "top-trades", "scoreboard-mini", "consensus-picks"
 *   data-guru    Optional guru slug filter (e.g., "warren-buffett"). Only for top-trades.
 *   data-theme   "dark" (default) or "light"
 *   data-limit   Number of items (default 5). Only for top-trades.
 *   data-api     Optional API base URL (default: "/api/v1/widgets")
 *
 * ── Theming ──────────────────────────────────────────────────────────────
 *
 *   The widget injects styles scoped to its shadow DOM. Theme-aware CSS custom
 *   properties can be overridden on the host element for advanced customization:
 *
 *   --gs-bg:           Card background
 *   --gs-text:         Primary text color
 *   --gs-text-muted:   Secondary text color
 *   --gs-accent:       Accent color (buy / positive)
 *   --gs-accent-sell:  Sell / negative color
 *   --gs-border:       Border color
 *   --gs-radius:       Card border radius
 */

(function () {
  "use strict";

  const API_BASE = "/api/v1/widgets";

  // ── Theme definitions ──────────────────────────────────────────────────
  const themes = {
    dark: {
      "--gs-bg": "#111827",
      "--gs-text": "#f9fafb",
      "--gs-text-muted": "#9ca3af",
      "--gs-accent": "#10b981",
      "--gs-accent-sell": "#ef4444",
      "--gs-border": "#1f2937",
      "--gs-radius": "12px",
    },
    light: {
      "--gs-bg": "#ffffff",
      "--gs-text": "#111827",
      "--gs-text-muted": "#6b7280",
      "--gs-accent": "#059669",
      "--gs-accent-sell": "#dc2626",
      "--gs-border": "#e5e7eb",
      "--gs-radius": "12px",
    },
  };

  // ── Styles ─────────────────────────────────────────────────────────────
  function getStyles(themeName: string): string {
    const t = themes[themeName] || themes.dark;
    return `
      :host {
        display: block;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        max-width: 420px;
        width: 100%;
      }
      .gs-card {
        background: var(--gs-bg, ${t["--gs-bg"]});
        color: var(--gs-text, ${t["--gs-text"]});
        border: 1px solid var(--gs-border, ${t["--gs-border"]});
        border-radius: var(--gs-radius, ${t["--gs-radius"]});
        padding: 16px;
        overflow: hidden;
      }
      .gs-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--gs-border, ${t["--gs-border"]});
      }
      .gs-logo {
        font-weight: 800;
        font-size: 13px;
        letter-spacing: -0.3px;
        color: var(--gs-accent, ${t["--gs-accent"]});
      }
      .gs-powered {
        font-size: 10px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        margin-left: auto;
      }
      .gs-item {
        display: flex;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--gs-border, ${t["--gs-border"]});
        gap: 10px;
      }
      .gs-item:last-child {
        border-bottom: none;
      }
      .gs-ticker {
        font-weight: 700;
        font-size: 15px;
        min-width: 56px;
      }
      .gs-company {
        font-size: 11px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        display: block;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gs-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 99px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        flex-shrink: 0;
      }
      .gs-badge.buy {
        background: rgba(16,185,129,0.15);
        color: var(--gs-accent, #10b981);
      }
      .gs-badge.sell {
        background: rgba(239,68,68,0.15);
        color: var(--gs-accent-sell, #ef4444);
      }
      .gs-guru {
        font-size: 11px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        margin-left: auto;
        text-align: right;
        flex-shrink: 0;
      }
      .gs-price {
        font-size: 13px;
        font-weight: 600;
      }
      .gs-price.up { color: var(--gs-accent, #10b981); }
      .gs-price.down { color: var(--gs-accent-sell, #ef4444); }
      .gs-price.flat { color: var(--gs-text-muted, #9ca3af); }
      .gs-score-row {
        display: flex;
        align-items: center;
        padding: 6px 0;
        gap: 8px;
      }
      .gs-rank {
        font-size: 20px;
        font-weight: 800;
        color: var(--gs-accent, #10b981);
        min-width: 28px;
      }
      .gs-score-name {
        font-weight: 600;
        font-size: 14px;
      }
      .gs-score-stat {
        font-size: 12px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        margin-left: auto;
      }
      .gs-score-stat strong {
        color: var(--gs-text, ${t["--gs-text"]});
      }
      .gs-consensus-row {
        display: flex;
        align-items: center;
        padding: 6px 0;
        gap: 8px;
      }
      .gs-consensus-ticker {
        font-weight: 700;
        font-size: 15px;
        min-width: 56px;
      }
      .gs-signal {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 99px;
        font-weight: 700;
      }
      .gs-signal.strong {
        background: rgba(16,185,129,0.15);
        color: var(--gs-accent, #10b981);
      }
      .gs-signal.moderate {
        background: rgba(251,191,36,0.15);
        color: #fbbf24;
      }
      .gs-count {
        font-size: 12px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        margin-left: auto;
        white-space: nowrap;
      }
      .gs-loading, .gs-error, .gs-empty {
        text-align: center;
        padding: 24px 16px;
        color: var(--gs-text-muted, ${t["--gs-text-muted"]});
        font-size: 13px;
      }
      .gs-footer {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid var(--gs-border, ${t["--gs-border"]});
        text-align: center;
      }
      .gs-footer a {
        color: var(--gs-accent, #10b981);
        font-size: 11px;
        text-decoration: none;
        font-weight: 600;
      }
      .gs-footer a:hover { text-decoration: underline; }
    `;
  }

  // ── Web Component ──────────────────────────────────────────────────────
  class GuruStockWidget extends HTMLElement {
    private type: string;
    private theme: string;
    private guru: string;
    private limit: number;
    private apiBase: string;
    private shadow: ShadowRoot;

    constructor() {
      super();
      this.type = this.dataset.type || "top-trades";
      this.theme = this.dataset.theme || "dark";
      this.guru = this.dataset.guru || "";
      this.limit = parseInt(this.dataset.limit || "5", 10);
      this.apiBase = this.dataset.api || API_BASE;
      this.shadow = this.attachShadow({ mode: "open" });
    }

    connectedCallback(): void {
      this.render();
      void this.load();
    }

    static get observedAttributes(): string[] {
      return ["data-type", "data-theme", "data-guru", "data-limit"];
    }

    attributeChangedCallback(name: string, _oldVal: string, newVal: string): void {
      if (name === "data-type") this.type = newVal || "top-trades";
      if (name === "data-theme") this.theme = newVal || "dark";
      if (name === "data-guru") this.guru = newVal || "";
      if (name === "data-limit") this.limit = parseInt(newVal || "5", 10);
      this.render();
      void this.load();
    }

    private renderLoading(): void {
      this.shadow.innerHTML = `
        <style>${getStyles(this.theme)}</style>
        <div class="gs-card">
          <div class="gs-header">
            <span class="gs-logo">⚡ GuruStock</span>
            <span class="gs-powered">Powered by GuruStock</span>
          </div>
          <div class="gs-loading">Loading trade data…</div>
        </div>
      `;
    }

    private renderError(msg: string): void {
      this.shadow.innerHTML = `
        <style>${getStyles(this.theme)}</style>
        <div class="gs-card">
          <div class="gs-header">
            <span class="gs-logo">⚡ GuruStock</span>
            <span class="gs-powered">Powered by GuruStock</span>
          </div>
          <div class="gs-error">${this.escapeHtml(msg)}</div>
        </div>
      `;
    }

    private renderEmpty(): void {
      this.shadow.innerHTML = `
        <style>${getStyles(this.theme)}</style>
        <div class="gs-card">
          <div class="gs-header">
            <span class="gs-logo">⚡ GuruStock</span>
            <span class="gs-powered">Powered by GuruStock</span>
          </div>
          <div class="gs-empty">No data available yet. Check back after the next 13F filing.</div>
        </div>
      `;
    }

    private render(): void {
      this.renderLoading();
    }

    private async load(): Promise<void> {
      try {
        const url = this.buildUrl();
        const res = await fetch(url);
        if (!res.ok) {
          this.renderError(`API error: ${res.status}`);
          return;
        }
        const data = await res.json();
        if (!data) {
          this.renderEmpty();
          return;
        }
        this.renderData(data);
      } catch (err) {
        this.renderError("Failed to load data. Please try again.");
        console.error("[GuruStock Widget]", err);
      }
    }

    private buildUrl(): string {
      const base = this.apiBase.endsWith("/") ? this.apiBase.slice(0, -1) : this.apiBase;
      let endpoint = "/top-trades";

      if (this.type === "scoreboard-mini") endpoint = "/scoreboard-mini";
      else if (this.type === "consensus-picks") endpoint = "/consensus-picks";
      else endpoint = "/top-trades";

      const params = new URLSearchParams();
      if (this.type === "top-trades" || !this.type) {
        params.set("limit", String(this.limit));
        if (this.guru) params.set("guru", this.guru);
      }

      const qs = params.toString();
      return `${base}${endpoint}${qs ? "?" + qs : ""}`;
    }

    private renderData(data: any): void {
      const styles = getStyles(this.theme);
      const headerHtml = `
        <div class="gs-header">
          <span class="gs-logo">⚡ GuruStock</span>
          <span class="gs-powered">Powered by GuruStock</span>
        </div>`;

      let bodyHtml = "";
      let footerHtml = `
        <div class="gs-footer">
          <a href="https://gurustock.com" target="_blank" rel="noopener">View full data on GuruStock →</a>
        </div>`;

      if (this.type === "top-trades" || !this.type) {
        const trades = data.trades || [];
        if (!trades.length) { this.renderEmpty(); return; }

        bodyHtml = trades.map((t: any) => {
          const badgeClass = t.action === "buy" ? "buy" : "sell";
          const priceClass = t.price_direction || "flat";
          const priceEl = t.live_price != null
            ? `<span class="gs-price ${priceClass}">$${t.live_price.toFixed(2)}</span>`
            : "";
          return `
            <div class="gs-item">
              <div>
                <span class="gs-ticker">${this.escapeHtml(t.ticker)}</span>
                <span class="gs-company">${this.escapeHtml(t.company_name || "")}</span>
              </div>
              <span class="gs-badge ${badgeClass}">${t.action}</span>
              ${priceEl}
              <span class="gs-guru">${this.escapeHtml(t.guru || "")}</span>
            </div>`;
        }).join("");
      } else if (this.type === "scoreboard-mini") {
        const gurus = data.top_gurus || [];
        if (!gurus.length) { this.renderEmpty(); return; }

        bodyHtml = gurus.map((g: any, i: number) => `
          <div class="gs-score-row">
            <span class="gs-rank">#${i + 1}</span>
            <span class="gs-score-name">${this.escapeHtml(g.name)}</span>
            <span class="gs-score-stat"><strong>${g.win_rate}%</strong> win rate · ${g.total_trades} trades</span>
          </div>`).join("");
      } else if (this.type === "consensus-picks") {
        const picks = data.consensus_picks || [];
        if (!picks.length) { this.renderEmpty(); return; }

        bodyHtml = picks.map((p: any) => `
          <div class="gs-consensus-row">
            <span class="gs-consensus-ticker">${this.escapeHtml(p.ticker)}</span>
            <span class="gs-signal ${p.signal_strength || "moderate"}">${p.direction} · ${p.signal_strength}</span>
            <span class="gs-count">${p.guru_count} guru${p.guru_count !== 1 ? "s" : ""}</span>
          </div>`).join("");
      }

      this.shadow.innerHTML = `
        <style>${styles}</style>
        <div class="gs-card">
          ${headerHtml}
          ${bodyHtml}
          ${footerHtml}
        </div>`;
    }

    private escapeHtml(str: string): string {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // ── Register ───────────────────────────────────────────────────────────
  if (!customElements.get("gurustock-widget")) {
    customElements.define("gurustock-widget", GuruStockWidget);
  }
})();
