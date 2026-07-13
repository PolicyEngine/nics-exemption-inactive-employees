"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { colors } from "../lib/colors";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SectionHeading from "./SectionHeading";
import {
  getReformSummary,
  getNicsExemption,
  getByAgeGroup,
} from "../lib/dataHelpers";
import { formatBn, formatCount, formatPct } from "../lib/formatters";
import ChartLogo from "./ChartLogo";

const AXIS_STYLE = {
  fontSize: 12,
  fill: colors.gray[500],
};

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
      {label !== undefined ? (
        <div className="mb-2 font-semibold text-slate-800">{label}</div>
      ) : null}
      {payload.map((entry) => (
        <div className="flex items-center justify-between gap-4" key={entry.name}>
          <span className="flex items-center gap-2 text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.name}
          </span>
          <span className="font-medium text-slate-800">
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DecileCharts({ data, dimension }) {
  const dimData = data?.reform?.nics_exemption?.[`by_${dimension}`] || [];
  if (!dimData.length) {
    return <p className="text-sm text-slate-500">Decile data not yet available. Re-run the pipeline to generate.</p>;
  }
  const label = dimension === "income_decile" ? "Income decile" : "Wealth decile";
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <div>
        <SectionHeading
          title={`Recently active within 5Q by ${label.toLowerCase()}`}
          description=""
        />
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dimData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
              <XAxis dataKey="group" tick={{ ...AXIS_STYLE, fontSize: 11 }} tickLine={false} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => formatCount(v)} />
              <Tooltip content={<CustomTooltip formatter={(v) => formatCount(v)} />} />
              <Bar dataKey="n_recently_active" name="Active within 5Q" fill={colors.primary[600]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartLogo />
      </div>
      <div>
        <SectionHeading
          title={`Exemption cost by ${label.toLowerCase()}`}
          description=""
        />
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dimData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
              <XAxis dataKey="group" tick={{ ...AXIS_STYLE, fontSize: 11 }} tickLine={false} />
              <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `\u00A3${v}bn`} />
              <Tooltip content={<CustomTooltip formatter={(v) => formatBn(v)} />} />
              <Bar dataKey="nics_exemption_cost_bn" name="Exemption cost" fill={colors.primary[700]} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartLogo />
      </div>
    </div>
  );
}

function BehaviouralStepsToggle() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <p>
        If employers pass the NICs saving on as higher wages, some currently inactive people may enter work. We model the extensive-margin participation response only (whether to work, not hours), using a single population-wide elasticity of <strong>0.25</strong> from{" "}
        <a href="https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf" target="_blank" rel="noreferrer" className="underline">Chetty, Guren, Manoli &amp; Weber (2013)</a>. The pipeline reports three scenarios (low 0.1 / central 0.25 / high 0.4) bracketing the wider literature range; their sensitivity is shown in the expandable table below the headline metrics.{" "}
        <button
          className="font-semibold text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide steps ▾" : "Show steps ▸"}
        </button>
      </p>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>Impute a potential wage for each working-age inactive person from the FRS median wage of employed people in the same age band and gender.</li>
          <li>Compute the firm&apos;s employer-NICs saving on that wage as <em>max(0, wage − £5,000) × 15%</em>. Both the rate and the secondary threshold are statutory, set by the{" "}
            <a href="https://www.legislation.gov.uk/ukpga/2025/11/contents" target="_blank" rel="noreferrer" className="underline">National Insurance Contributions (Secondary Class 1 Contributions) Act 2025</a>{" "}
            (effective 6 April 2025), and pulled at runtime from{" "}
            <a href="https://policyengine.org" target="_blank" rel="noreferrer" className="underline">PolicyEngine UK</a>&apos;s parameter database, which mirrors{" "}
            <a href="https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026" target="_blank" rel="noreferrer" className="underline">HMRC&apos;s published rates</a>{" "}
            for the modelled tax year.
          </li>
          <li>Under full pass-through, the worker&apos;s gross pay rises by that saving.</li>
          <li>Convert the gross-pay uplift to a net income gain using the effective marginal rate (income tax + employee NICs + benefit withdrawal).</li>
          <li>Apply the participation elasticity to the net-income gain expressed as a share of household net income if working: <em>P(enter work) = elasticity × %Δ net income</em>, clipped to [0,&thinsp;1].</li>
          <li>
            Aggregate across the inactive working-age population to obtain:
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>expected new entrants — the sum of per-person entry probabilities scaled to the population;</li>
              <li>fiscal offset from those new earners — extra income tax, employee NICs, and reduced benefit entitlement;</li>
              <li>net fiscal cost — static cost minus fiscal offset;</li>
              <li>poverty impact — a new entrant counts as lifted out when their net wage gain exceeds their household&apos;s BHC poverty gap.</li>
            </ul>
          </li>
        </ol>
      )}
    </div>
  );
}

function ComparisonMethodologyToggle({ counterfactual, year }) {
  const [open, setOpen] = useState(false);
  const cutRatePct = counterfactual?.cut_rate_pct;
  const pipDlaTotal = counterfactual?.pip_dla_working_age_total_bn;
  return (
    <div className="mt-2">
      <p>
        A side-by-side comparison of two policies aimed at moving inactive people into work: the <strong>NICs exemption</strong> proposed here, and the{" "}
        <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">government&apos;s announced disability-benefit reforms</a>{" "}
        (PIP eligibility tightening + UC health element freeze, projected to save <strong>£4.8bn by 2029–30</strong>).{" "}
        <button
          className="font-semibold text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide methodology ▾" : "Show methodology ▸"}
        </button>
      </p>
      {open && (
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong>Target.</strong> £4.8bn is the headline fiscal saving in the{" "}
            <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">Spring Statement 2025 Pathways to Work green paper</a>.
          </li>
          <li>
            <strong>How we model the cut.</strong> We use{" "}
            <a href="https://policyengine.org" target="_blank" rel="noreferrer" className="underline">PolicyEngine UK</a>{" "}
            to compute total working-age PIP+DLA spending in the modelled year ({pipDlaTotal ? `£${pipDlaTotal.toFixed(1)}bn` : "~£26bn"} for {year || "2026"}), then cut every recipient&apos;s PIP and DLA payments by the same percentage. The percentage is <strong>back-solved</strong> so the modelled fiscal saving equals £4.8bn — for {year || "2026"} that comes out at <strong>{cutRatePct != null ? `${cutRatePct}%` : "~19%"}</strong>. In plain terms, someone currently receiving £100/week in PIP+DLA would receive about £{cutRatePct != null ? Math.round(100 * (1 - cutRatePct / 100)) : 81}/week after the cut. This matches the policy&apos;s headline fiscal saving but understates its selectivity — the real reform targets specific sub-groups via activity-level eligibility scoring rather than cutting everyone the same.
          </li>
          <li>
            <strong>Static vs behavioural rows.</strong> The static NICs row covers workers who already moved from inactivity into work; the behavioural row estimates additional entries from the currently inactive pool.
          </li>
          <li>
            <strong>Net vs gross fiscal cost.</strong> The NICs fiscal cost is net (static cost minus the fiscal offset from new workers); the benefit-cuts saving is gross.
          </li>
          <li>
            <strong>Benefit-cuts elasticity (income effect).</strong> The NICs side reuses the elasticity already described in the Behavioural impact section above. The benefit-cuts side operates through a different channel: a PIP/DLA cut reduces out-of-work income, which pushes some disabled inactive people to seek work to make up the loss. For each disabled inactive recipient the cut reduces household income, and we apply <em>P(enter work) = 0.22 × |%Δ household income|</em>, clipped to [0,&thinsp;1], then aggregate. The 0.22 is the income-effect elasticity for disabled people from{" "}
            <a href="https://eprints.lse.ac.uk/40085/" target="_blank" rel="noreferrer" className="underline">Marie &amp; Vall Castell&oacute; (2012)</a>.
          </li>
        </ul>
      )}
    </div>
  );
}

function CaveatsToggle() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        className="text-sm font-semibold text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
        onClick={() => setOpen(!open)}
      >
        Caveats {open ? "▾" : "▸"}
      </button>
      {open && (
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
          <li>
            Full-pass-through assumption: the{" "}
            <a href="https://obr.uk/efo/economic-and-fiscal-outlook-october-2024/" target="_blank" rel="noreferrer" className="underline">OBR (October 2024 EFO, ¶3.11)</a>{" "}
            assumes about 60% pass-through in the short run rising to 76% by 2027–28, so our numbers are an upper bound.
          </li>
          <li>Hours responses are not modelled; already-employed workers have no behavioural response.</li>
          <li>Health, accessibility, and skills barriers limit the policy&apos;s reach beyond what financial incentives alone capture.</li>
          <li>Deadweight, substitution, and displacement effects are excluded.</li>
        </ul>
      )}
    </div>
  );
}

function SensitivityToggle({ behavioural }) {
  const [open, setOpen] = useState(false);
  function displayNetCost(row) {
    if (!row) return null;
    const staticCost = row.static_cost_bn;
    if (staticCost == null || row.fiscal_offset_bn == null) {
      return row.net_cost_bn;
    }
    return Number((staticCost - row.fiscal_offset_bn).toFixed(1));
  }
  return (
    <div className="section-card overflow-x-auto">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            <span className="mr-2 text-slate-400">{open ? "▾" : "▸"}</span>
            Sensitivity to participation elasticity
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            How the headline numbers move under low (0.1) / central (0.25, <a href="https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf" target="_blank" rel="noreferrer" className="underline">Chetty et al. 2013</a>) / high (0.4) elasticity scenarios.
          </p>
        </div>
      </button>
      {open && (
        <table className="data-table mt-4" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Scenario</th>
              <th style={{ textAlign: "right" }}>Elasticity</th>
              <th style={{ textAlign: "right" }}>New entrants</th>
              <th style={{ textAlign: "right" }}>Fiscal offset</th>
              <th style={{ textAlign: "right" }}>Net impact</th>
            </tr>
          </thead>
          <tbody>
            {["low", "central", "high"].map((key) => {
              const row = behavioural[key];
              if (!row) return null;
              const netCost = displayNetCost(row);
              return (
                <tr key={key} className={key === "central" ? "bg-slate-50 font-semibold" : ""}>
                  <td className="font-medium capitalize">{key}</td>
                  <td style={{ textAlign: "right" }}>{row.elasticity}</td>
                  <td style={{ textAlign: "right" }}>{formatCount(row.n_new_entrants)}</td>
                  <td style={{ textAlign: "right" }}>{formatBn(row.fiscal_offset_bn)}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatBn(Math.abs(netCost))} {netCost > 0 ? "cost" : "saving"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function BreakdownTable({ dimension, byAge, data, totalRecentlyActive, costBn }) {
  const dimData = useMemo(() => {
    if (dimension === "age" || dimension === "income_decile" || dimension === "wealth_decile") return null;
    const key = `by_${dimension}`;
    return data?.reform?.nics_exemption?.[key] || [];
  }, [dimension, data]);

  if (dimension === "income_decile" || dimension === "wealth_decile") {
    return <DecileCharts data={data} dimension={dimension} />;
  }

  if (dimension === "age") {
    return (
      <table className="data-table" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "40%" }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: "30%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Age group</th>
            <th style={{ textAlign: "right" }}>Active within 5Q</th>
            <th style={{ textAlign: "right" }}>Exemption cost</th>
          </tr>
        </thead>
        <tbody>
          {byAge.map((row) => (
            <tr key={row.age_group}>
              <td className="font-medium">{row.age_group}</td>
              <td style={{ textAlign: "right" }}>{formatCount(row.n_recently_active)}</td>
              <td style={{ textAlign: "right" }}>{formatBn(row.nics_exemption_cost_bn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (!dimData || dimData.length === 0) {
    return <p className="text-sm text-slate-500">Breakdown data not yet available. Re-run the pipeline to generate.</p>;
  }

  const dimLabel = dimension === "gender" ? "Gender"
    : dimension === "country" ? "Country"
    : "Household type";

  return (
    <table className="data-table" style={{ tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "40%" }} />
        <col style={{ width: "30%" }} />
        <col style={{ width: "30%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>{dimLabel}</th>
          <th style={{ textAlign: "right" }}>Active within 5Q</th>
          <th style={{ textAlign: "right" }}>Exemption cost</th>
        </tr>
      </thead>
      <tbody>
        {dimData.map((row) => (
          <tr key={row.group}>
            <td className="font-medium">{row.group}</td>
            <td style={{ textAlign: "right" }}>{formatCount(row.n_recently_active)}</td>
            <td style={{ textAlign: "right" }}>{formatBn(row.nics_exemption_cost_bn)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ReformTab({ data }) {
  const summary = getReformSummary(data);
  const nicsExemption = getNicsExemption(data);
  const byAge = getByAgeGroup(data, "reform");
  const behavioural = data?.reform?.nics_exemption?.behavioural || {};
  const central = behavioural.central || {};
  const povertyImpact = data?.reform?.nics_exemption?.poverty_impact || {};
  const counterfactual = data?.reform?.counterfactual_benefit_cuts || {};
  const byDecileBehav = data?.reform?.nics_exemption?.by_income_decile_behavioural || [];
  const nInactive = data?.baseline?.summary?.n_economically_inactive || 0;
  const displayNetCost =
    summary?.cost_bn != null && central.fiscal_offset_bn != null
      ? Number((summary.cost_bn - central.fiscal_offset_bn).toFixed(1))
      : central.net_cost_bn;
  const behaviouralWithStatic = useMemo(() => {
    if (!summary || summary.cost_bn == null) return behavioural;
    return Object.fromEntries(
      Object.entries(behavioural).map(([key, value]) => [
        key,
        { ...value, static_cost_bn: summary.cost_bn },
      ])
    );
  }, [behavioural, summary]);

  const searchParams = useSearchParams();
  const [breakdownDim, setBreakdownDim] = useState("age");
  const [behaviouralDim, setBehaviouralDim] = useState("age");
  const [fullTimeOnly, setFullTimeOnly] = useState(
    () => searchParams?.get("ft") === "1"
  );

  const totalRecentlyActive = useMemo(() => {
    return byAge
      .filter((d) => d.age_group !== "65+")
      .reduce((sum, d) => sum + (d.n_recently_active || 0), 0);
  }, [byAge]);

  // Full-time-only variant: restricts the exemption to employees working
  // >= 30h/week (ONS threshold), read directly from the Enhanced FRS.
  const ftOnly = summary?.full_time_only || null;
  const showFt = fullTimeOnly && ftOnly != null;
  const displayCost = showFt ? ftOnly.cost_bn : summary?.cost_bn;
  const displayCount = showFt ? ftOnly.n_recently_active : totalRecentlyActive;
  const displayAvg = showFt
    ? ftOnly.avg_nics_per_recent_worker
    : summary?.avg_nics_per_recent_worker;

  return (
    <div className="space-y-8">
      <SectionHeading
        title="NICs exemption reform analysis"
        description={<>Estimated cost of exempting employers from NICs on employees who already transitioned from economic inactivity into work within the last 5 quarters (15 months), regardless of disability status. Behavioural estimates are separate: they estimate additional entries from the currently inactive pool. Figures are based on PolicyEngine UK microsimulation with <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">LFS longitudinal data</a> imputed onto the Enhanced FRS.</>}
      />

      {/* ================================================================ */}
      {/* STATIC COST — METRIC CARDS                                       */}
      {/* ================================================================ */}
      {ftOnly != null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={fullTimeOnly}
            onClick={() => setFullTimeOnly((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              fullTimeOnly ? "bg-primary-600" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                fullTimeOnly ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-slate-700">
            Full-time employees only (&ge;{ftOnly.hours_cut ?? 30}h/week)
          </span>
          <span className="text-sm text-slate-500">
            {fullTimeOnly
              ? `Restricting to full-time hires lowers the static cost by ~${Math.round((1 - (ftOnly.cost_share_of_all ?? 0)) * 100)}% (part-time NIC-payers are a small share of the base).`
              : "Toggle to price the exemption for full-time hires only."}
            {ftOnly.estimated ? " Estimate pending a full pipeline re-run." : ""}
          </span>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static cost of exemption
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {displayCost != null ? formatBn(displayCost) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Foregone employer NICs revenue on workers who already transitioned into work
            {showFt ? " (full-time hires only)" : ""}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static: recently-active employees (5Q)
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {displayCount > 0 ? formatCount(displayCount) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Working-age people who transitioned from inactivity within the last 5 quarters.{" "}
            <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourforcesurveyflowsestimatesx02" target="_blank" rel="noreferrer" className="underline">
              ONS X02 flows
            </a>{" "}
            shows 578k moving from inactivity to employment per quarter (Oct{"\u2013"}Dec 2025)
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static: avg saving per exempt hire
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {displayAvg != null
              ? `\u00A3${displayAvg.toLocaleString()}`
              : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Average annual employer NICs per recently-active worker
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* DETAILED BREAKDOWN TABLE (STATIC)                                */}
      {/* ================================================================ */}
      {byAge.length > 0 && (
        <>
          <div>
            <SectionHeading
              title="Detailed breakdown (static)"
              description="Summary table of the NICs exemption cost and workers who became active within 5 quarters, by selected dimension."
            />
          </div>

          <div className="section-card overflow-x-auto">
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                { id: "age", label: "Age group" },
                { id: "gender", label: "Gender" },
                { id: "country", label: "Country" },
                { id: "family_type", label: "Household type" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    breakdownDim === opt.id
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => setBreakdownDim(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <BreakdownTable
              dimension={breakdownDim}
              byAge={byAge}
              data={data}
              totalRecentlyActive={totalRecentlyActive}
              costBn={summary?.cost_bn}
            />
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* BEHAVIOURAL RESPONSE                                             */}
      {/* ================================================================ */}
      <div>
        <SectionHeading
          title="Behavioural impact"
          description={<BehaviouralStepsToggle />}
        />
        <CaveatsToggle />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            New entrants (central)
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {central.n_new_entrants ? formatCount(central.n_new_entrants) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {central.n_new_entrants && nInactive
              ? `${(central.n_new_entrants / nInactive * 100).toFixed(1)}% of ${formatCount(nInactive)} currently inactive people`
              : "Inactive people entering work"}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Fiscal offset
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {central.fiscal_offset_bn != null ? formatBn(central.fiscal_offset_bn) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Extra tax revenue + benefit savings from new workers
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Net fiscal impact
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {central.net_cost_bn != null
              ? (displayNetCost < 0 ? `−${formatBn(Math.abs(displayNetCost))}` : formatBn(Math.abs(displayNetCost)))
              : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            {summary?.cost_bn != null && central.fiscal_offset_bn != null
              ? `${formatBn(summary.cost_bn)} static cost − ${formatBn(central.fiscal_offset_bn)} offset`
              : "Static cost minus fiscal offset"}
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Poverty reduction
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {povertyImpact.n_lifted_out_of_poverty
              ? formatCount(povertyImpact.n_lifted_out_of_poverty)
              : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            People lifted out of poverty (BHC)
          </div>
        </div>
        {central.n_neets_baseline > 0 && (
          <div className="metric-card">
            <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
              NEETs entering work
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {formatCount(central.n_neets_entering_work)}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              of {formatCount(central.n_neets_baseline)} NEETs aged 16–24 ({(central.n_neets_entering_work / central.n_neets_baseline * 100).toFixed(1)}%). NEETs are a subset of the 16–24 age group (excludes students)
            </div>
          </div>
        )}
      </div>

      {/* Sensitivity table — expandable */}
      {Object.keys(behavioural).length > 0 && (
        <SensitivityToggle behavioural={behaviouralWithStatic} />
      )}


      {/* ================================================================ */}
      {/* BEHAVIOURAL BREAKDOWN BY DIMENSION                               */}
      {/* ================================================================ */}
      <div className="section-card">
        <SectionHeading
          title="New entrants by dimension"
          description="Estimated number of inactive people entering work under the exemption (central estimate), broken down by selected dimension."
        />
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { id: "age", label: "Age group" },
            { id: "income_decile", label: "Income decile" },
          ].map((opt) => (
            <button
              key={opt.id}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                behaviouralDim === opt.id
                  ? "bg-primary-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => setBehaviouralDim(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {behaviouralDim === "age" && central.by_age && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={central.by_age}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                <XAxis dataKey="age_group" tick={AXIS_STYLE} tickLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => formatCount(v)} />
                <Tooltip content={<CustomTooltip formatter={(v) => formatCount(v)} />} />
                <Bar dataKey="n_new_entrants" name="New entrants" fill={colors.primary[600]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {behaviouralDim === "income_decile" && byDecileBehav.length > 0 && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDecileBehav}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                <XAxis dataKey="decile" tick={AXIS_STYLE} tickLine={false} />
                <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => formatCount(v)} />
                <Tooltip content={<CustomTooltip formatter={(v) => formatCount(v)} />} />
                <Bar dataKey="n_entering_work" name="New entrants" fill={colors.primary[600]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <ChartLogo />
      </div>

      {/* ================================================================ */}
      {/* COUNTERFACTUAL: BENEFIT CUTS                                     */}
      {/* ================================================================ */}
      {counterfactual.name && (
        <>
          <div>
            <SectionHeading
              title="Comparison: NICs exemption vs disability benefit cuts"
              description={<ComparisonMethodologyToggle counterfactual={counterfactual} year={data?.year} />}
            />
          </div>

          <div className="section-card overflow-x-auto">
            <table className="data-table" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th style={{ textAlign: "right" }}>NICs exemption</th>
                  <th style={{ textAlign: "right" }}>Benefit cuts</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">People affected <span className="text-xs font-normal text-slate-400">(static)</span></td>
                  <td style={{ textAlign: "right" }} className="text-emerald-700 font-semibold">
                    {formatCount(totalRecentlyActive)} recently-inactive workers
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {counterfactual.n_affected ? formatCount(counterfactual.n_affected) : "--"} PIP/DLA recipients
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">Additional people entering work <span className="text-xs font-normal text-slate-400">(behavioural)</span></td>
                  <td style={{ textAlign: "right" }} className="text-emerald-700 font-semibold">
                    {formatCount(central.n_new_entrants)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatCount(counterfactual.n_entering_work)}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">Net fiscal cost / saving <span className="text-xs font-normal text-slate-400">(behavioural)</span></td>
                  <td style={{ textAlign: "right" }} className="text-emerald-700 font-semibold">
                    {displayNetCost != null ? `${formatBn(displayNetCost)} cost` : "--"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatBn(counterfactual.fiscal_saving_bn)} saving
                  </td>
                </tr>
                <tr>
                  <td className="font-medium">People lifted out of poverty <span className="text-xs font-normal text-slate-400">(behavioural)</span></td>
                  <td style={{ textAlign: "right" }} className="text-emerald-700 font-semibold">
                    {formatCount(povertyImpact.n_lifted_out_of_poverty)}
                  </td>
                  <td style={{ textAlign: "right" }} className="text-red-600">
                    {formatCount(counterfactual.n_pushed_into_poverty)} pushed in
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
