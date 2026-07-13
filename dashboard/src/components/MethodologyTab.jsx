export default function MethodologyTab({ data }) {
  const emr = data?.settings?.effective_marginal_rate;
  const emrPct = emr != null ? `${Math.round(emr * 100)}%` : "40%";
  return (
    <div className="space-y-8">
      <div className="section-card">
        <div className="eyebrow text-slate-500">Overview</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
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
          — the canonical meta-analysis estimate of the steady-state extensive-margin elasticity
          used as the headline calibration across modern public-finance work.
          All figures are for the {data?.year || "2026"} fiscal year.
        </p>
        <h3 className="mt-6 text-lg font-semibold text-slate-900">
          Key assumption: full pass-through of NICs to wages
        </h3>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          We assume employer NICs savings are fully passed through as higher wages,
          the standard incidence assumption supported by{" "}
          <a href="https://eml.berkeley.edu/~saez/saez-matsaganis-tsakloglouQJE11greecetax.pdf" target="_blank" rel="noreferrer" className="underline">Saez, Matsaganis &amp; Tsakloglou (2012, QJE)</a>.
          The{" "}
          <a href="https://obr.uk/efo/economic-and-fiscal-outlook-october-2024/" target="_blank" rel="noreferrer" className="underline">OBR (October 2024 EFO, paragraph 3.11)</a>{" "}
          assumes about 60% pass-through in the short term rising to 76% by 2027–28, so our full-pass-through estimates are an upper bound.
          The effective marginal tax rate is set at {emrPct} for this run (income tax + employee NICs + benefit withdrawal); it is configurable via the <code>--effective-marginal-rate</code> CLI argument.
        </p>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="section-card">
          <div className="eyebrow text-slate-500">Included</div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            What the model captures
          </h3>
          <ul className="mt-4 list-disc pl-5 text-sm leading-7 text-slate-600 space-y-1">
            <li>Static cost: forgone employer NICs on recently-active workers</li>
            <li>Labour supply responses via a single extensive-margin participation elasticity (central = 0.25, from <a href="https://rajchetty.com/wp-content/uploads/2021/04/ext_margin.pdf" target="_blank" rel="noreferrer" className="underline">Chetty et al. (2013)</a>). Low / high scenarios ({data?.settings?.elasticities?.low ?? 0.1} / {data?.settings?.elasticities?.high ?? 0.4}) bracket the wider literature range</li>
            <li>Fiscal offset: income tax + employee NICs + benefit savings from new workers</li>
            <li>Poverty impact (BHC) from increased employment</li>
            <li>
              Counterfactual: a uniform PIP/DLA cut <strong>back-solved</strong> to match the published <strong>£4.8bn</strong> headline saving from the Spring Statement 2025 disability-benefit reforms ({data?.reform?.counterfactual_benefit_cuts?.cut_rate_pct != null ? `${data.reform.counterfactual_benefit_cuts.cut_rate_pct}%` : "~19%"} of working-age PIP+DLA spending in {data?.year || "2026"}). Behavioural response uses the income-effect elasticity of <strong>0.22</strong> from{" "}
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
