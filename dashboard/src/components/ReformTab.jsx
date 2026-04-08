"use client";

import { useMemo, useState } from "react";
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
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We assume full pass-through of the NICs saving to wages; the OBR assumes only 60–76% is passed through, so these estimates are an upper bound. Many inactive people also face health, accessibility, and skills barriers that financial incentives alone will not overcome, and the model does not account for deadweight, substitution, or displacement effects.
        </p>
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
            The elasticity measures how responsive inactive people are to higher pay. A higher elasticity means more people enter work for a given wage increase.
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
                    {netCost > 0 ? "-" : "+"}{formatBn(Math.abs(netCost))}
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
  const byWealthDecileBehav = data?.reform?.nics_exemption?.by_wealth_decile_behavioural || [];
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

  const [breakdownDim, setBreakdownDim] = useState("age");
  const [behaviouralDim, setBehaviouralDim] = useState("age");

  const totalRecentlyActive = useMemo(() => {
    return byAge
      .filter((d) => d.age_group !== "65+")
      .reduce((sum, d) => sum + (d.n_recently_active || 0), 0);
  }, [byAge]);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="NICs exemption reform analysis"
        description={<>Estimated cost of exempting employers from NICs on employees who already transitioned from economic inactivity into work within the last 5 quarters (15 months), regardless of disability status. Behavioural estimates are separate: they estimate additional entries from the currently inactive pool. Figures are based on PolicyEngine UK microsimulation with <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">LFS longitudinal data</a> imputed onto the Enhanced FRS.</>}
      />

      {/* ================================================================ */}
      {/* STATIC COST — METRIC CARDS                                       */}
      {/* ================================================================ */}
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
      <div className="border-t border-slate-200 pt-4">
        <SectionHeading
          title="Behavioural impact (labour supply response)"
          description={<>If employers pass the NICs saving on as higher wages, some currently inactive people may enter work. We model this in five steps: <strong>(1)</strong> impute a potential wage for each working-age inactive person using the weighted median wage of employed people in the same age band and gender from the FRS; <strong>(2)</strong> calculate employer NICs on that wage using the rate and secondary threshold from PolicyEngine parameters; <strong>(3)</strong> assume full pass-through, so gross pay rises by the employer NICs saving; <strong>(4)</strong> convert that saving to a net income gain using the effective marginal rate specified for the run, which combines income tax, employee NICs, and benefit withdrawal; <strong>(5)</strong> express the gain as a share of household net income if working without the exemption and apply an extensive-margin participation elasticity: <em>P(enter work) = elasticity &times; %&Delta; net income</em>, clipped to [0,&thinsp;1]. This is an extensive-margin estimate only: hours responses are not modelled, and already-employed workers have no behavioural response. The fiscal offset is approximated as extra tax revenue plus reduced benefit entitlement using the same effective marginal rate.</>}
        />
        <CaveatsToggle />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            New entrants (central)
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
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
          <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
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
          <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
            {central.net_cost_bn != null
              ? `${displayNetCost > 0 ? "-" : "+"}${formatBn(Math.abs(displayNetCost))}`
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
          <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
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
            <div className="mt-2 text-3xl font-bold tracking-tight text-emerald-700">
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
            { id: "wealth_decile", label: "Wealth decile" },
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

        {behaviouralDim === "wealth_decile" && byWealthDecileBehav.length > 0 && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byWealthDecileBehav}>
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
          <div className="border-t border-slate-200 pt-4">
            <SectionHeading
              title="Comparison: NICs exemption vs disability benefit cuts"
              description={<>The government&apos;s <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">proposed disability benefit reforms</a> (PIP eligibility tightening, UC health element freeze, projected to save &pound;4.8bn by 2029/30) compared with the NICs exemption. We approximate the benefit cuts as a 10% reduction in PIP/DLA payments for modelling purposes. <strong>Note:</strong> static NICs exemption figures cover workers who already transitioned from inactivity into work; behavioural figures estimate additional entries from the currently inactive pool. The NICs fiscal cost is net of the fiscal offset from new workers (static cost minus extra tax and benefit savings); the benefit cuts saving is gross. Employment figures for the NICs exemption use participation elasticities (probabilistic); benefit cuts use the same framework but with an income-effect elasticity of 0.22, from <a href="https://doi.org/10.1016/j.jpubeco.2012.01.006" target="_blank" rel="noreferrer" className="underline">Marie &amp; Vall Castell&oacute; (2012)</a>.</>}
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
