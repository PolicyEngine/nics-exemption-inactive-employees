"use client";

import { useMemo, useState } from "react";
import { colors } from "../lib/colors";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SectionHeading from "./SectionHeading";
import { getReformSummary, getByAgeGroup } from "../lib/dataHelpers";
import { formatBn, formatCount, formatCurrency } from "../lib/formatters";
import ChartLogo from "./ChartLogo";

const AXIS_STYLE = {
  fontSize: 12,
  fill: colors.gray[500],
};

function CustomTooltip({ active, payload, label, formatter, labelFormatter, totalLabel }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, e) => s + (Number(e.value) || 0), 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg">
      {label !== undefined ? (
        <div className="mb-2 font-semibold text-slate-800">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
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
      {totalLabel ? (
        <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-200 pt-2">
          <span className="font-semibold text-slate-700">{totalLabel}</span>
          <span className="font-semibold text-slate-900">
            {formatter ? formatter(total) : total}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function BehaviouralStepsToggle({ data }) {
  const [open, setOpen] = useState(false);
  const ni = data.nics_parameters;
  const stAnnual = ni.secondary_threshold_annual.toLocaleString("en-GB");
  const ratePct = `${Math.round(ni.employer_rate * 100)}%`;
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
          <li>Compute the firm&apos;s employer-NICs saving on that wage as <em>max(0, wage − £{stAnnual}) × {ratePct}</em>. Both the rate and the secondary threshold are statutory, set by the{" "}
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
  const cutRatePct = counterfactual.cut_rate_pct;
  const pipDlaTotal = counterfactual.pip_dla_working_age_total_bn;
  const postCutPerWeek = Math.round(100 * (1 - cutRatePct / 100));
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
            to compute total working-age PIP+DLA spending in the modelled year (£{pipDlaTotal.toFixed(1)}bn for {year}), then cut every recipient&apos;s PIP and DLA payments by the same percentage. The percentage is <strong>back-solved</strong> so the modelled fiscal saving equals £4.8bn — for {year} that comes out at <strong>{cutRatePct}%</strong>. In plain terms, someone currently receiving £100/week in PIP+DLA would receive about £{postCutPerWeek}/week after the cut. This matches the policy&apos;s headline fiscal saving but understates its selectivity — the real reform targets specific sub-groups via activity-level eligibility scoring rather than cutting everyone the same.
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
            assumes about 60% pass-through in the short run rising to 76% from 2026–27, so our numbers are an upper bound.
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

// Normalise every static breakdown dimension to {label, count, cost}. Income
// quintiles are derived by summing income-decile pairs (counts and costs are
// additive, so the aggregation is exact).
function getStaticBreakdownRows(data, dimension, workingAgeByAge) {
  const ne = data.reform.nics_exemption;
  const norm = (label, count, cost) => ({ label, count, cost });

  if (dimension === "age") {
    return workingAgeByAge.map((d) =>
      norm(d.age_group, d.n_recently_active, d.nics_exemption_cost_bn)
    );
  }
  if (dimension === "income_quintile") {
    const dec = ne.by_income_decile || [];
    const get = (g) => dec.find((d) => Number(d.group) === g);
    return [1, 2, 3, 4, 5].map((q) => {
      const a = get(2 * q - 1);
      const b = get(2 * q);
      return norm(
        String(q),
        (a?.n_recently_active || 0) + (b?.n_recently_active || 0),
        Number(((a?.nics_exemption_cost_bn || 0) + (b?.nics_exemption_cost_bn || 0)).toFixed(2))
      );
    });
  }
  const arr = ne[`by_${dimension}`] || [];
  return arr.map((d) => norm(d.group, d.n_recently_active, d.nics_exemption_cost_bn));
}

function StaticBreakdownChart({ rows, metric }) {
  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500">
        Breakdown data not yet available. Re-run the pipeline to generate.
      </p>
    );
  }
  const isCost = metric === "cost";
  return (
    <>
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 16, left: 6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
            <XAxis dataKey="label" tick={{ ...AXIS_STYLE, fontSize: 11 }} tickLine={false} />
            <YAxis
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (isCost ? `£${Number(v).toFixed(1)}bn` : formatCount(v))}
            />
            <Tooltip
              content={<CustomTooltip formatter={(v) => (isCost ? formatBn(v) : formatCount(v))} />}
            />
            <Bar
              dataKey={isCost ? "cost" : "count"}
              name={isCost ? "Exemption cost" : "Active within 5Q"}
              fill={isCost ? colors.primary[700] : colors.primary[600]}
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLogo />
    </>
  );
}

function PolicyChangeTable({ data }) {
  const [open, setOpen] = useState(false);
  // Rate and threshold come from the PolicyEngine parameter tree (emitted by
  // the pipeline as `nics_parameters`), so nothing here is hard-coded.
  const ni = data.nics_parameters;
  const employerRatePct = `${Math.round(ni.employer_rate * 100)}%`;
  const stAnnual = ni.secondary_threshold_annual.toLocaleString("en-GB");
  const stWeekly = ni.secondary_threshold_weekly.toLocaleString("en-GB");
  const threshold = `£${stAnnual}/yr (£${stWeekly}/wk)`;

  const rows = [
    {
      aspect: "Employer NICs rate on a qualifying hire's pay above the secondary threshold",
      current: `${employerRatePct} (employer rate)`,
      reform: "0% — exempt",
      changed: true,
    },
    {
      aspect: "Which employees the rate applies to",
      current: "Every employee",
      reform:
        "Only employees who moved from economic inactivity into work within the last 5 quarters (~15 months)",
      changed: true,
    },
    {
      aspect: "Disability requirement",
      current: "—",
      reform: "None — disabled and non-disabled recently-inactive hires alike",
      changed: true,
    },
    {
      aspect: "Secondary threshold (annual pay below which no employer NICs are due)",
      current: threshold,
      reform: `${threshold} — unchanged`,
      changed: false,
    },
  ];

  return (
    <div className="section-card overflow-x-auto">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            <span className="mr-2 text-slate-400">{open ? "▾" : "▸"}</span>
            Policy at a glance
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            What the reform changes, and what stays the same — in short, for a recently-inactive
            worker the employer pays no NICs on their pay, instead of the employer rate.
          </p>
        </div>
      </button>
      {open && (
        <>
          <table className="data-table mt-4" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "33%" }} />
              <col style={{ width: "33%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Policy lever</th>
                <th>Current policy</th>
                <th>Under the NICs exemption</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.aspect}>
                  <td className="font-medium text-slate-700">{row.aspect}</td>
                  <td className="text-slate-600">{row.current}</td>
                  <td className={row.changed ? "font-semibold text-emerald-700" : "text-slate-500"}>
                    {row.reform}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            Under the full pass-through assumption used throughout this analysis, the employer&apos;s
            NICs saving is handed to the worker as higher gross pay — which is what drives the
            behavioural and poverty effects shown below.
          </p>
        </>
      )}
    </div>
  );
}

function Choice({ label, info, options, value, set }) {
  // Index-based value so mixed option types (string / boolean / number) round-trip
  // cleanly through the native <select>.
  const selectedIndex = options.findIndex((o) => o.value === value);
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
        {info && (
          <span className="group relative inline-flex">
            <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold italic text-slate-600">
              i
            </span>
            <span className="pointer-events-none absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal normal-case leading-5 tracking-normal text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              {info}
            </span>
          </span>
        )}
      </div>
      <select
        aria-label={label}
        value={selectedIndex}
        onChange={(e) => set(options[Number(e.target.value)].value)}
        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >
        {options.map((opt, i) => (
          <option key={i} value={i}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const YES_NO = [
  { label: "No", value: false },
  { label: "Yes", value: true },
];

function PersonCalculator({ data }) {
  // Real PolicyEngine UK household net-income curves, precomputed per profile
  // by the pipeline (`reform.person_calculator`). Picking a profile + salary
  // gives the exact net-income change from the pass-through — reflecting income
  // tax, employee NICs and the Universal Credit taper, not a flat assumption.
  const pc = data.reform.person_calculator;
  const rate = pc.employer_rate;
  const stAnnual = pc.secondary_threshold_annual;
  const ratePct = `${Math.round(rate * 100)}%`;
  const grid = pc.gross_grid;
  // The grid extends above salary_max for interpolation headroom; only show
  // salaries up to salary_max.
  const salaryMax = pc.salary_max;

  const [country, setCountry] = useState("England");
  const [overSpa, setOverSpa] = useState(false);
  const [couple, setCouple] = useState(false);
  const [children, setChildren] = useState(0);
  const [renter, setRenter] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [chartMode, setChartMode] = useState("amount");

  // England, Wales & Northern Ireland share income-tax rates → "ruk"; only
  // Scotland is modelled separately.
  const regionGroup = country === "Scotland" ? "scotland" : "ruk";
  const key = `${regionGroup}|spa${+overSpa}|cpl${+couple}|ch${children}|rent${+renter}|dis${+disabled}`;
  const curve = pc.profiles[key];

  // Linear interpolation of a component curve at gross pay x.
  const interp = (arr, x) => {
    if (x <= grid[0]) return arr[0];
    if (x >= grid[grid.length - 1]) return arr[arr.length - 1];
    let j = 0;
    while (grid[j + 1] < x) j += 1;
    const f = (x - grid[j]) / (grid[j + 1] - grid[j]);
    return arr[j] + f * (arr[j + 1] - arr[j]);
  };

  // Means-tested benefit that drives the taper for this profile: above state
  // pension age it's Pension Credit, otherwise Universal Credit.
  const benefitName = overSpa ? "Pension Credit" : "Universal Credit";

  // Decompose the policy's effect across salaries. The employer-NICs saving is
  // the gross gain that exists only if the policy applies; for each salary we
  // split it (PolicyEngine UK, before vs after the pass-through) into what the
  // worker keeps and what is clawed back by income tax, employee NICs and
  // benefit withdrawal. The stacked bands sum to the gross saving.
  // Only show salaries above the secondary threshold — below it the employer
  // owes no NICs, so there is no saving to decompose (every band would be 0).
  const rows = grid
    .filter((g) => g > stAnnual && g <= salaryMax)
    .map((g) => {
      const saved = Math.max(0, g - stAnnual) * rate;
      const up = g + saved;
      const keeps = Math.max(0, interp(curve.net, up) - interp(curve.net, g));
      const incomeTax = Math.max(0, interp(curve.income_tax, up) - interp(curve.income_tax, g));
      const empNI = Math.max(0, interp(curve.employee_ni, up) - interp(curve.employee_ni, g));
      const benefitWithdrawal = Math.max(0, interp(curve.benefits, g) - interp(curve.benefits, up));
      const other = Math.max(0, saved - keeps - incomeTax - empNI - benefitWithdrawal);
      return { salary: g, keeps, benefitWithdrawal, incomeTax, empNI, other };
    });

  const isShare = chartMode === "share";
  // £ view shows the rounded component amounts; % view shows each component as a
  // share of that salary's total saving, so the bands always fill to 100% and
  // the green band's height reads directly as "the % the worker keeps".
  const chartData = rows.map((r) => {
    const fields = ["keeps", "benefitWithdrawal", "incomeTax", "empNI", "other"];
    if (!isShare) {
      const out = { salary: r.salary };
      fields.forEach((k) => (out[k] = Math.round(r[k])));
      return out;
    }
    const total = fields.reduce((s, k) => s + r[k], 0);
    const out = { salary: r.salary };
    fields.forEach((k) => (out[k] = total > 0 ? Number(((r[k] / total) * 100).toFixed(1)) : 0));
    return out;
  });

  // PolicyEngine Scottish-budget palette — distinguishable teal + gray mix:
  // bright teal for the worker's gain, dark teal + charcoal for the two big
  // claw-backs, then mid/light gray.
  const BANDS = [
    { key: "keeps", label: "Worker keeps (net gain)", color: "#4FD1C5" },
    { key: "benefitWithdrawal", label: `${benefitName} withdrawn`, color: "#285E61" },
    { key: "incomeTax", label: "Income tax", color: "#1E293B" },
    { key: "empNI", label: "Employee NICs", color: "#64748B" },
    { key: "other", label: "Other (council tax, indirect)", color: "#CBD5E1" },
  ];

  return (
    <div>
      <SectionHeading
        title="What the exemption is worth to one worker"
        description="Pick a recently-inactive person's household to see how the exemption changes their take-home across salaries, under full pass-through. Unlike the population headline (which uses one flat marginal rate), this runs each profile through PolicyEngine UK, so income tax, employee NICs and the Universal Credit / Pension Credit taper all show up. In the chart below, the total height is the gross employer-NICs saving (what the policy adds vs not applying); the green band is what the worker keeps and the bands above are clawed back by tax and benefit withdrawal. Use the £/% toggle to switch between absolute amounts and shares — where green nearly vanishes, a means-tested benefit is taking almost the whole pass-through (an effective marginal rate close to 100%)."
      />
      <div className="section-card">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Choice
            label="Country"
            info="England, Wales and Northern Ireland share the same income-tax rates and bands; Scotland sets its own (more bands, higher top rate). So the slice of a pay rise lost to income tax can differ in Scotland — small at low pay, larger higher up the curve."
            value={country}
            set={setCountry}
            options={[
              { label: "England", value: "England" },
              { label: "Scotland", value: "Scotland" },
              { label: "Wales", value: "Wales" },
              { label: "N. Ireland", value: "Northern Ireland" },
            ]}
          />
          <Choice
            label="Household"
            info="A couple is assessed jointly for Universal Credit. That joint assessment changes the household's benefit entitlement and where the UC taper bites, so it shifts how much of the pass-through the household keeps."
            value={couple}
            set={setCouple}
            options={[
              { label: "Single", value: false },
              { label: "Couple", value: true },
            ]}
          />
          <Choice
            label="Children"
            info="Children add Universal Credit child elements and Child Benefit. That raises entitlement, so the household stays on the UC taper up to a higher salary — more of a pay rise is withdrawn at 55p in the £ over a wider range (the 'keeps' curve sits lower for longer)."
            value={children}
            set={setChildren}
            options={[
              { label: "0", value: 0 },
              { label: "1", value: 1 },
              { label: "2", value: 2 },
            ]}
          />
          <Choice
            label="Private renter"
            info="Renting adds the Universal Credit housing element (rent assumed £9,000/yr). That extra entitlement keeps the household on the UC taper higher up the salary range, so more of the pass-through is clawed back — pulling the 'keeps' curve down."
            value={renter}
            set={setRenter}
            options={YES_NO}
          />
          <Choice
            label="Disabled (for benefits)"
            info="Being disabled for benefits adds disability elements/premiums to Universal Credit, raising entitlement and extending the taper — so the worker typically keeps less of a pay rise across the middle of the salary range."
            value={disabled}
            set={setDisabled}
            options={YES_NO}
          />
          <Choice
            label="Over state pension age"
            info="Above state pension age there are no employee NICs, so more of a pay rise is kept at moderate pay. But the household is on Pension Credit, which withdraws support roughly £1 for £1 (a ~100% taper) at low earnings — so a small rise can be fully clawed back. That flattens the 'keeps' curve near the bottom."
            value={overSpa}
            set={setOverSpa}
            options={YES_NO}
          />
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-700">
              {isShare
                ? "Share of each £1 of the saving, by salary"
                : "Where each £ of the saving goes, by salary"}{" "}
              ({pc.year}–{(pc.year + 1) % 100} tax year)
            </div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {[
                { id: "amount", label: "£" },
                { id: "share", label: "%" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setChartMode(opt.id)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    chartMode === opt.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 10, right: 20, top: 6, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                <XAxis
                  dataKey="salary"
                  type="number"
                  domain={[chartData[0]?.salary ?? grid[0], salaryMax]}
                  ticks={chartData.map((d) => d.salary).filter((s) => s % 20000 === 0)}
                  tick={AXIS_STYLE}
                  tickLine={false}
                  tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
                  label={{
                    value: "Annual salary (gross)",
                    position: "insideBottom",
                    offset: -10,
                    style: { fontSize: 11, fill: colors.gray[500] },
                  }}
                />
                <YAxis
                  tick={AXIS_STYLE}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                  domain={isShare ? [0, 100] : undefined}
                  allowDataOverflow={isShare}
                  ticks={isShare ? [0, 20, 40, 60, 80, 100] : undefined}
                  tickFormatter={(v) => (isShare ? `${Math.round(v)}%` : `£${Math.round(v / 1000)}k`)}
                  label={{
                    value: isShare ? "share of the saving" : "£/yr of the saving",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: colors.gray[500], textAnchor: "middle" },
                  }}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      formatter={(v) => (isShare ? `${Math.round(v)}%` : formatCurrency(v))}
                      labelFormatter={(v) => `Salary ${formatCurrency(v)}`}
                      totalLabel={isShare ? "Total" : "Total saving"}
                    />
                  }
                />
                {BANDS.map((b) => (
                  <Area
                    key={b.key}
                    type="monotone"
                    dataKey={b.key}
                    name={b.label}
                    stackId="1"
                    stroke={b.color}
                    fill={b.color}
                    fillOpacity={0.85}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
            {BANDS.map((b) => (
              <span key={b.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        <button
          className="mt-5 text-sm font-semibold text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
          onClick={() => setShowSteps(!showSteps)}
        >
          {showSteps ? "Hide the maths ▾" : "Show the maths ▸"}
        </button>
        {showSteps && (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>
              Employer NICs saved = max(0, salary − {formatCurrency(stAnnual)} secondary threshold) ×{" "}
              {ratePct}. That is the total height of the stack.
            </li>
            <li>Under full pass-through, the worker&apos;s gross pay rises by that saving.</li>
            <li>
              PolicyEngine UK computes the household&apos;s net income, income tax, employee NICs and
              benefits at the original and the uplifted gross pay. The change in each splits the saving
              into the stacked bands: the green band is the rise in net income the worker keeps; the
              others are the extra income tax and employee NICs paid and the benefits withdrawn.
            </li>
            <li>
              The green band, as a share of net income, is the kind of gain the participation
              elasticity multiplies to get a person&apos;s probability of entering work.
            </li>
          </ol>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-400">
          Single-household calculations (a couple&apos;s partner has no earnings; renters pay
          {" "}{formatCurrency(pc.assumptions.renter_annual_rent)}/yr rent). England, Wales and Northern
          Ireland share income-tax rates; the model treats Scotland separately.
        </p>
      </div>
    </div>
  );
}

const REFORM_SUBTABS = [
  { id: "household", label: "Household" },
  { id: "static", label: "Population (static)" },
  { id: "dynamic", label: "Population (behavioural)" },
];

export default function ReformTab({ data }) {
  const summary = getReformSummary(data);
  const byAge = getByAgeGroup(data, "reform");
  // Working-age bands only. The pipeline labels the post–state-pension-age band
  // dynamically (e.g. "66+"), so exclude any band whose label ends in "+"
  // rather than matching a fixed string. This keeps the headline headcount,
  // the age table, and the gender/country breakdowns on the same population.
  const workingAgeByAge = byAge.filter((d) => !d.age_group?.endsWith("+"));
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

  const [subTab, setSubTab] = useState("household");
  const [breakdownDim, setBreakdownDim] = useState("age");
  const [breakdownMetric, setBreakdownMetric] = useState("count");
  const [behaviouralDim, setBehaviouralDim] = useState("age");

  const breakdownRows = useMemo(
    () => getStaticBreakdownRows(data, breakdownDim, workingAgeByAge),
    [data, breakdownDim, workingAgeByAge]
  );

  const totalRecentlyActive = useMemo(() => {
    return workingAgeByAge.reduce((sum, d) => sum + (d.n_recently_active || 0), 0);
  }, [workingAgeByAge]);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="NICs exemption reform analysis"
        description={<>Estimated cost of exempting employers from NICs on employees who already transitioned from economic inactivity into work within the last 5 quarters (15 months), regardless of disability status. Behavioural estimates are separate: they estimate additional entries from the currently inactive pool. Figures are based on PolicyEngine UK microsimulation with <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">LFS longitudinal data</a> imputed onto the Enhanced FRS.</>}
      />

      {/* ================================================================ */}
      {/* SUB-TAB NAVIGATION                                               */}
      {/* ================================================================ */}
      <div className="flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {REFORM_SUBTABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              subTab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* HOUSEHOLD                                                        */}
      {/* ================================================================ */}
      {subTab === "household" && (
        <div className="space-y-8">
          <PolicyChangeTable data={data} />
          <PersonCalculator data={data} />
        </div>
      )}

      {/* ================================================================ */}
      {/* POPULATION (STATIC)                                              */}
      {/* ================================================================ */}
      {subTab === "static" && (
        <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static cost of exemption
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {summary?.cost_bn != null ? formatBn(summary.cost_bn) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Foregone employer NICs revenue on workers who already transitioned into work
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static: recently-active employees (5Q)
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {totalRecentlyActive > 0 ? formatCount(totalRecentlyActive) : "--"}
          </div>
          <div className="mt-2 text-sm text-slate-500">
            Modelled stock currently in work who entered within the last 5 quarters. For scale,{" "}
            <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourforcesurveyflowsestimatesx02" target="_blank" rel="noreferrer" className="underline">
              ONS X02 flows
            </a>{" "}
            show 578k moving from inactivity to employment per quarter (Oct{"\u2013"}Dec 2025) \u2014 a gross
            flow that isn&apos;t directly comparable, since many later leave work again
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Static: avg saving per exempt hire
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {summary?.avg_nics_per_recent_worker != null
              ? `\u00A3${summary.avg_nics_per_recent_worker.toLocaleString()}`
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
              description="NICs exemption cost and the number of workers who became active within 5 quarters, by selected dimension. Switch the bars between headcount and cost with the toggle on the right."
            />
          </div>

          <div className="section-card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
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
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {[
                  { id: "count", label: "Active within 5Q" },
                  { id: "cost", label: "Exemption cost" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                      breakdownMetric === opt.id
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setBreakdownMetric(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <StaticBreakdownChart rows={breakdownRows} metric={breakdownMetric} />
          </div>
        </>
      )}
        </div>
      )}

      {/* ================================================================ */}
      {/* POPULATION (DYNAMIC)                                             */}
      {/* ================================================================ */}
      {subTab === "dynamic" && (
        <div className="space-y-8">
      <div>
        <SectionHeading
          title="Behavioural impact"
          description={<BehaviouralStepsToggle data={data} />}
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
      )}
    </div>
  );
}
