export default function MethodologyTab({ data }) {
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
          people (weighted median by age band and gender), apply the NICs exemption
          as a wage increase under full pass-through, and estimate entry
          probabilities using participation elasticities from{" "}
          <a href="https://ifs.org.uk/publications/labour-supply-and-taxes" target="_blank" rel="noreferrer" className="underline">Meghir &amp; Phillips (2010)</a>.
          All figures are for the {data?.year || "2025"} fiscal year.
        </p>
      </div>

      <div className="section-card">
        <div className="eyebrow text-slate-500">Key assumption</div>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">
          Full pass-through of NICs to wages
        </h3>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          We assume employer NICs savings are fully passed through as higher wages,
          the standard incidence assumption supported by{" "}
          <a href="https://doi.org/10.1257/pol.4.3.1" target="_blank" rel="noreferrer" className="underline">Saez, Matsaganis &amp; Tsakloglou (2012)</a>.
          The OBR assumes 60–76% pass-through, so our estimates are an upper bound.
          The effective marginal tax rate is set at 40% (income tax + employee NICs + benefit withdrawal).
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
            <li>Labour supply responses via extensive-margin participation elasticities (0.1 / 0.25 / 0.4)</li>
            <li>Fiscal offset: income tax + employee NICs + benefit savings from new workers</li>
            <li>Poverty impact (BHC) from increased employment</li>
            <li>Counterfactual: 10% PIP/DLA cut modelled via income-effect elasticity (0.22) from{" "}
              <a href="https://doi.org/10.1016/j.jpubeco.2012.01.006" target="_blank" rel="noreferrer" className="underline">Marie &amp; Vall Castell&oacute; (2012)</a>
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

      <div className="section-card">
        <div className="eyebrow text-slate-500">Sources</div>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">
          Data and references
        </h3>
        <ul className="mt-4 list-disc pl-5 text-sm leading-7 text-slate-600 space-y-1">
          <li><a href="https://policyengine.org" target="_blank" rel="noreferrer" className="underline">PolicyEngine UK</a> microsimulation (Enhanced FRS 2023–24)</li>
          <li><a href="https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/methodologies/labourforcesurveyuserguidance" target="_blank" rel="noreferrer" className="underline">ONS Labour Force Survey</a> 5-quarter longitudinal dataset for inactivity transitions</li>
          <li><a href="https://ifs.org.uk/publications/labour-supply-and-taxes" target="_blank" rel="noreferrer" className="underline">Meghir &amp; Phillips (2010)</a> for participation elasticities</li>
          <li><a href="https://doi.org/10.1257/pol.4.3.1" target="_blank" rel="noreferrer" className="underline">Saez, Matsaganis &amp; Tsakloglou (2012)</a> for payroll tax incidence</li>
          <li><a href="https://doi.org/10.1086/319564" target="_blank" rel="noreferrer" className="underline">Gruber (2000, JPE)</a> and <a href="https://doi.org/10.1016/j.jpubeco.2012.01.006" target="_blank" rel="noreferrer" className="underline">Marie &amp; Vall Castell&oacute; (2012, JPubE)</a> for income-effect elasticity on disability benefits</li>
          <li><a href="https://obr.uk/forecasts-in-depth/tax-by-tax-spend-by-spend/national-insurance-contributions-nics/" target="_blank" rel="noreferrer" className="underline">OBR</a> NICs forecasts and <a href="https://www.gov.uk/government/statistics/the-employment-of-disabled-people-2025" target="_blank" rel="noreferrer" className="underline">DWP 2025</a> disability statistics</li>
        </ul>
      </div>

      <div className="section-card">
        <div className="eyebrow text-slate-500">Replication</div>
        <h3 className="mt-2 text-lg font-semibold text-slate-900">
          Code and data
        </h3>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          The Python pipeline (<code>run_pipeline.py</code>) generates{" "}
          <code>nics_exemption_results.json</code>, which the dashboard consumes.
          All source code is in the{" "}
          <a
            href="https://github.com/PolicyEngine/nics-exemption-inactive-employees"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            public repository
          </a>.
        </p>
      </div>
    </div>
  );
}
