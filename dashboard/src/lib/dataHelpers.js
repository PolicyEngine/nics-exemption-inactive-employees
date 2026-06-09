/**
 * Data helper functions for the NICs exemption dashboard.
 */

export function getBaselineSummary(data) {
  return data?.baseline?.summary || null;
}

export function getReformSummary(data) {
  return data?.reform?.nics_exemption?.static || null;
}

export function getByAgeGroup(data, section = "baseline") {
  if (section === "baseline") {
    return data?.baseline?.by_age || [];
  }
  return data?.reform?.nics_exemption?.by_age || [];
}

export function getInactivityReasons(data) {
  return data?.baseline?.inactivity_reasons || [];
}

export function getCombinedPctActiveByAge(data) {
  const lfs = data?.pct_active_by_age_lfs || {};
  const frs = data?.pct_active_by_age || {};
  const allAges = new Set([
    ...Object.keys(lfs).map(Number),
    ...Object.keys(frs).map(Number),
  ]);
  return [...allAges]
    .filter((a) => a >= 16 && a <= 70)
    .sort((a, b) => a - b)
    .map((age) => ({
      age,
      lfs: lfs[String(age)] ?? null,
      frs: frs[String(age)] ?? null,
    }));
}
