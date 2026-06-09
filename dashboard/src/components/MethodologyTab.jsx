export default function MethodologyTab({ data }) {
  const emrPct = `${Math.round(data.settings.effective_marginal_rate * 100)}%`;
  return (
    <div className="space-y-8">
      <div className="section-card">
        <div className="eyebrow text-slate-500">Overview</div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          How the model works
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          This dashboard estimates the cost and employment effects of exempting
          employers from NICs on all workers who recently transitioned from economic
          inactivity into employment (within the last 5 quarters), regardless of
          disability status. We use{" "}
          <a href="https://policyengine.org" target="_blank" rel="noreferrer" className="underline">PolicyEngine UK</a>{" "}
          microsimulation with{" "}
          <a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">LFS longitudinal data</a>{" "}
          imputed onto the Enhanced FRS via the{" "}
          <a href="https://github.com/PolicyEngine/microimpute" target="_blank" rel="noreferrer" className="underline">microimpute</a> library.
          For the behavioural response, we impute potential wages for inactive
          people (median by age band and gender from the FRS), apply the NICs exemption
          as a wage increase under full pass-through, and estimate entry
          probabilities using a single population-wide extensive-margin participation
          elasticity of <strong>0.25</strong> from{" "}
          <a href="https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf" target="_blank" rel="noreferrer" className="underline">Chetty, Guren, Manoli &amp; Weber (2013)</a>{" "}
          — the meta-analysis estimate of the steady-state extensive-margin elasticity,
          used as the headline calibration in public-finance work.
          All figures are for the {data.year}–{(data.year + 1) % 100} tax year.
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          The reform tab&apos;s <strong>Household</strong> view runs a separate calculation:
          for each chosen household profile (country, composition, children, housing, disability,
          age) it computes net household income across a salary grid in PolicyEngine UK, so the
          worker&apos;s share of the pass-through reflects income tax, employee NICs and the
          Universal Credit / Pension Credit taper rather than the flat marginal rate used for the
          population-wide behavioural estimates.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-slate-900">
          Assumption: full pass-through of NICs to wages
        </h3>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          We pass the full employer NICs saving through to the worker as higher wages,
          the incidence assumption in{" "}
          <a href="https://eml.berkeley.edu/~saez/saez-matsaganis-tsakloglouQJE11greecetax.pdf" target="_blank" rel="noreferrer" className="underline">Saez, Matsaganis &amp; Tsakloglou (2012, QJE)</a>.
          The{" "}
          <a href="https://obr.uk/efo/economic-and-fiscal-outlook-october-2024/" target="_blank" rel="noreferrer" className="underline">OBR (October 2024 EFO, paragraph 3.11)</a>{" "}
          assumes about 60% pass-through in the short term, rising to 76% from 2026–27, so our full-pass-through estimates are an upper bound.
          We set the effective marginal tax rate to {emrPct} (income tax + employee NICs + benefit withdrawal); the <code>--effective-marginal-rate</code> argument changes it.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="section-card">
          <div className="eyebrow text-slate-500">Included</div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            What the model captures
          </h3>
          <ul className="mt-4 list-disc pl-5 text-sm leading-7 text-slate-600 space-y-1">
            <li>Static cost: foregone employer NICs on recently-active workers</li>
            <li>Labour supply responses via a single extensive-margin participation elasticity (central = 0.25, from <a href="https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf" target="_blank" rel="noreferrer" className="underline">Chetty et al. (2013)</a>). Low / high scenarios ({data.settings.elasticities.low} / {data.settings.elasticities.high}) bracket the wider literature range</li>
            <li>Fiscal offset: income tax + employee NICs + benefit savings from new workers</li>
            <li>Poverty impact (BHC) from increased employment</li>
            <li>
              Counterfactual: a uniform PIP/DLA cut <strong>back-solved</strong> to match the published <strong>£4.8bn</strong> headline saving from the Spring Statement 2025 disability-benefit reforms ({data.reform.counterfactual_benefit_cuts.cut_rate_pct}% of working-age PIP+DLA spending in {data.year}). Behavioural response uses the income-effect elasticity of <strong>0.22</strong> from{" "}
              <a href="https://eprints.lse.ac.uk/40085/" target="_blank" rel="noreferrer" className="underline">Marie &amp; Vall Castell&oacute; (2012)</a>.
            </li>
          </ul>
        </div>

        <div className="section-card">
          <div className="eyebrow text-slate-500">Excluded</div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            What the model omits
          </h3>
          <ul className="mt-4 list-disc pl-5 text-sm leading-7 text-slate-600 space-y-1">
            <li>Employer demand-side responses and hiring decisions</li>
            <li>General equilibrium and displacement effects</li>
            <li>Deadweight (employers who would have hired anyway)</li>
            <li>Partial pass-through scenarios</li>
            <li>Health, accessibility, and skills barriers to employment</li>
            <li>Administrative costs of eligibility verification</li>
          </ul>
        </div>
      </div>

    </div>
  );
}
