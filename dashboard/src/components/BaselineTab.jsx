"use client";

import { useMemo } from "react";
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
import { getBaselineSummary, getByAgeGroup, getInactivityReasons, getCombinedPctActiveByAge } from "../lib/dataHelpers";
import { formatBn, formatCount } from "../lib/formatters";
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
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BaselineTab({ data }) {
  const summary = getBaselineSummary(data);
  const byAge = getByAgeGroup(data, "baseline");
  const inactivityReasons = getInactivityReasons(data);
  const combinedPctActive = getCombinedPctActiveByAge(data);

  // Employer Class 1 NICs structure. The secondary threshold and employer rate
  // come straight from the PolicyEngine parameter tree (emitted by the pipeline
  // as `nics_parameters`) so they are never hard-coded here. Employment
  // Allowance and the Apprenticeship Levy are not in the PE parameter set, so
  // they remain cited directly from gov.uk.
  const ni = data.nics_parameters;
  const stAnnual = ni.secondary_threshold_annual.toLocaleString("en-GB");
  const stWeekly = ni.secondary_threshold_weekly.toLocaleString("en-GB");
  const employerRatePct = `${Math.round(ni.employer_rate * 100)}%`;
  const NICS_THRESHOLDS = [
    { band: "Below Secondary Threshold", range: `Up to \u00A3${stAnnual}/yr (\u00A3${stWeekly}/wk)`, rate: "0%", url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026" },
    { band: "Above Secondary Threshold", range: `\u00A3${stAnnual}+/yr`, rate: employerRatePct, url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026" },
    { band: "Employment Allowance", range: "Eligible employers", rate: "\u00A310,500 off", url: "https://www.gov.uk/claim-employment-allowance" },
    { band: "Apprenticeship Levy", range: "Pay bill > \u00A33m", rate: "0.5%", url: "https://www.gov.uk/guidance/pay-apprenticeship-levy" },
  ];

  const sortedReasons = useMemo(() => {
    if (!inactivityReasons.length) return [];
    return [...inactivityReasons].sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [inactivityReasons]);

  return (
    <div className="space-y-10">

      {/* Summary metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Economically inactive people
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {summary?.n_economically_inactive ? formatCount(summary.n_economically_inactive) : "--"}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Working-age adults not in employment or actively seeking work (official:{" "}
            <a href="https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/economicinactivity" target="_blank" rel="noreferrer" className="underline">
              ~9.0m, ONS
            </a>)
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Disability benefits spending
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {summary?.total_disability_benefits_bn != null ? formatBn(summary.total_disability_benefits_bn) : "--"}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            vs £55.1bn official (
            <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">
              DWP Spring Statement 2025
            </a>
            ) — 2025–26 forecast (£51.2bn in 2024–25). Working-age incapacity &amp; disability benefits only.
          </div>
        </div>
        <div className="metric-card">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
            Total employer NICs
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {summary?.total_employer_nics_bn ? formatBn(summary.total_employer_nics_bn) : "--"}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Modelled total employer National Insurance contributions; runs somewhat above the OBR
            receipts forecast (official:{" "}
            <a href="https://obr.uk/forecasts-in-depth/tax-by-tax-spend-by-spend/national-insurance-contributions-nics/" target="_blank" rel="noreferrer" className="underline">
              £145.8bn, OBR March 2025
            </a>)
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 1: DISABILITY AND INACTIVITY                             */}
      {/* ================================================================ */}
      <SectionHeading
        title="Disability and inactivity"
        description="Overlap between disability and economic inactivity, and the main reasons people are economically inactive."
      />

      <div className="grid gap-8 xl:grid-cols-2">
        {/* Disability / inactivity overlap summary */}
        <div className="section-card">
          <SectionHeading
            title="Disability and inactivity overlap"
            description="Breakdown of the working-age population by disability and activity status."
          />
          {summary ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Detail</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium">Disability employment rate</td>
                    <td>
                      vs {summary.non_disabled_employment_rate != null ? `${summary.non_disabled_employment_rate}%` : "--"} non-disabled
                      {summary.disability_employment_gap_pp != null ? ` (${summary.disability_employment_gap_pp}pp gap)` : ""}
                    </td>
                    <td>{summary.disabled_employment_rate != null ? `${summary.disabled_employment_rate}%` : "--"}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">% of inactive who are disabled</td>
                    <td>
                      {summary.n_inactive_disabled ? `${formatCount(summary.n_inactive_disabled)} of ${formatCount(summary.n_economically_inactive || 0)} inactive` : ""}
                    </td>
                    <td>{summary.pct_inactive_disabled != null ? `${summary.pct_inactive_disabled}%` : "--"}</td>
                  </tr>
                  <tr>
                    <td className="font-medium">Disability benefits spending</td>
                    <td>
                      Official:{" "}
                      <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">
                        £55.1bn, DWP 2025–26
                      </a>
                    </td>
                    <td>{summary.total_disability_benefits_bn ? formatBn(summary.total_disability_benefits_bn) : "--"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                &ldquo;Disabled&rdquo; here is defined broadly by disability-benefit receipt and
                disability-related activity status (≈{formatCount(summary.n_disabled || 0)} working-age
                people) — a narrower, more health-severe group than the survey-based Equality Act
                definition behind the official disability employment rate (~53%, ONS). The rate shown
                is correspondingly lower because this group is, by construction, mostly out of work.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Summary data not yet available.</p>
          )}
        </div>

        {/* Inactivity reasons */}
        {sortedReasons.length > 0 && (
          <div className="section-card">
            <SectionHeading
              title="Reasons for inactivity"
              description="Main reasons people give for being economically inactive."
            />
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedReasons} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={AXIS_STYLE}
                    tickLine={false}
                    tickFormatter={(v) => formatCount(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="reason"
                    tick={{ ...AXIS_STYLE, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={160}
                  />
                  <Tooltip content={<CustomTooltip formatter={(v) => formatCount(v)} />} />
                  <Bar dataKey="count" name="People" fill={colors.primary[600]} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLogo />
          </div>
        )}

        {sortedReasons.length === 0 && (
          <div className="section-card">
            <SectionHeading
              title="Reasons for inactivity"
              description="Main reasons people give for being economically inactive."
            />
            <p className="text-sm text-slate-500">Inactivity reason data not yet available.</p>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: CURRENT EMPLOYER NICs                                 */}
      {/* ================================================================ */}
      <div className="border-t border-slate-200 pt-10">
        <SectionHeading
          title="Current employer NICs"
          description="Employer National Insurance contributions by age group and the current rate structure."
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        {byAge.length > 0 && (
          <div className="section-card">
            <SectionHeading
              title="Employer NICs by age group"
              description="Total employer NICs paid for employees in each age band."
            />
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byAge.filter((d) => !d.age_group?.endsWith("+"))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                  <XAxis
                    dataKey="age_group"
                    tick={AXIS_STYLE}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_STYLE}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `\u00A3${v}bn`}
                  />
                  <Tooltip content={<CustomTooltip formatter={(v) => formatBn(v)} />} />
                  <Bar
                    dataKey="employer_nics_bn"
                    name="Employer NICs"
                    fill={colors.primary[600]}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLogo />
          </div>
        )}

        <div className="section-card">
          <SectionHeading
            title="NICs rates and thresholds"
            description={`Current employer NICs rate structure (${data.year}–${(data.year + 1) % 100} tax year).`}
          />
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Earnings range</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {NICS_THRESHOLDS.map((row) => (
                  <tr key={row.band}>
                    <td className="font-medium"><a href={row.url} target="_blank" rel="noreferrer" className="underline">{row.band}</a></td>
                    <td>{row.range}</td>
                    <td>{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 3: INACTIVITY TRANSITIONS BY AGE                         */}
      {/* ================================================================ */}
      <div className="border-t border-slate-200 pt-10">
        <SectionHeading
          title="Percentage becoming economically active within 5 quarters, by age"
          description={<>The left chart shows the raw <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">Labour Force Survey</a> 5-quarter longitudinal panel data; the right shows the same variable after imputation onto the PolicyEngine Enhanced FRS population.</>}
        />
      </div>

      {combinedPctActive.length > 0 ? (
        <div className="grid gap-8 xl:grid-cols-2">
          <div className="section-card">
            <SectionHeading
              title="LFS: % becoming active by age (5-quarter window)"
              description="Percentage of people who became economically active in the last 5 quarters, by age (raw LFS weighted data)."
            />
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={combinedPctActive}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                  <XAxis dataKey="age" tick={AXIS_STYLE} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip content={<CustomTooltip formatter={(v) => v != null ? `${(v * 100).toFixed(1)}%` : "N/A"} />} />
                  <Bar dataKey="lfs" name="% becoming active (LFS)" fill={colors.primary[600]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLogo />
          </div>

          <div className="section-card">
            <SectionHeading
              title="Imputed: recently-active in Enhanced FRS (5-quarter window)"
              description="Imputed probability of becoming active within 5 quarters, after statistical matching from LFS onto the PolicyEngine population."
            />
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={combinedPctActive}>
                  <CartesianGrid strokeDasharray="3 3" stroke={colors.border.light} />
                  <XAxis dataKey="age" tick={AXIS_STYLE} tickLine={false} />
                  <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip content={<CustomTooltip formatter={(v) => v != null ? `${(v * 100).toFixed(1)}%` : "N/A"} />} />
                  <Bar dataKey="frs" name="% becoming active (imputed)" fill={colors.primary[700]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ChartLogo />
          </div>
        </div>
      ) : (
        <div className="section-card">
          <p className="text-sm text-slate-500">Activity-by-age data not yet available.</p>
        </div>
      )}

    </div>
  );
}
