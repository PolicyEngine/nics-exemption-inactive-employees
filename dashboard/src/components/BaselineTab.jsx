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
            {formatter ? formatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const NICS_THRESHOLDS = [
  { band: "Below Secondary Threshold", range: "Up to \u00A35,000/yr (\u00A396/wk)", rate: "0%", url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026" },
  { band: "Above Secondary Threshold", range: "\u00A35,000+/yr", rate: "15%", url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026" },
  { band: "Employment Allowance", range: "Eligible employers", rate: "\u00A310,500 off", url: "https://www.gov.uk/claim-employment-allowance" },
  { band: "Apprenticeship Levy", range: "Pay bill > \u00A33m", rate: "0.5%", url: "https://www.gov.uk/guidance/pay-apprenticeship-levy" },
];

export default function BaselineTab({ data }) {
  const summary = getBaselineSummary(data);
  const byAge = getByAgeGroup(data, "baseline");
  const inactivityReasons = getInactivityReasons(data);
  const combinedPctActive = getCombinedPctActiveByAge(data);

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
            Annual employer National Insurance contributions (official:{" "}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Disability employment rate</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    vs {summary.non_disabled_employment_rate != null ? `${summary.non_disabled_employment_rate}%` : "--"} non-disabled ({summary.disability_employment_gap_pp != null ? `${summary.disability_employment_gap_pp}pp gap` : ""})
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {summary.disabled_employment_rate != null ? `${summary.disabled_employment_rate}%` : "--"}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">% of inactive who are disabled</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {summary.n_inactive_disabled ? `${formatCount(summary.n_inactive_disabled)} of ${formatCount(summary.n_economically_inactive || 0)} inactive` : ""}
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {summary.pct_inactive_disabled != null ? `${summary.pct_inactive_disabled}%` : "--"}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Disability benefits spending</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Official:{" "}
                    <a href="https://www.gov.uk/government/consultations/pathways-to-work-reforming-benefits-and-support-to-get-britain-working-green-paper/spring-statement-2025-health-and-disability-benefit-reforms-impacts" target="_blank" rel="noreferrer" className="underline">
                      £55.1bn, DWP 2025–26
                    </a>
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {summary.total_disability_benefits_bn ? formatBn(summary.total_disability_benefits_bn) : "--"}
                </div>
              </div>
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
            description="Current employer NICs rate structure (2026-27 tax year)."
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
