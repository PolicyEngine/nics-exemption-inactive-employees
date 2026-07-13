"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BaselineTab from "../src/components/BaselineTab";
import MethodologyTab from "../src/components/MethodologyTab";
import ReformTab from "../src/components/ReformTab";

const TAB_OPTIONS = [
  { id: "reform", label: "NICs exemption reform" },
  { id: "baseline", label: "Inactivity baseline" },
  { id: "methodology", label: "Methodology" },
];

function getInitialTab(tabParam) {
  if (TAB_OPTIONS.some((tab) => tab.id === tabParam)) {
    return tabParam;
  }
  return "reform";
}

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState(() => getInitialTab(searchParams.get("tab")));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    setActiveTab(getInitialTab(tabParam));
  }, [searchParams]);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/nics_exemption_results.json`,
        );
        if (!response.ok) {
          throw new Error("nics_exemption_results.json not found");
        }
        const json = await response.json();
        setData(json);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === "reform") {
      router.replace("/", { scroll: false });
      return;
    }
    router.replace(`/?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="app-shell min-h-screen">
      <header className="title-row">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 md:px-8">
          <h1>NICs exemption for recently-inactive employees analysis</h1>
        </div>
      </header>

      <main className="relative z-[1] mx-auto max-w-[1400px] px-6 py-10 md:px-8 md:py-12">
        <div className="animate-[fadeIn_0.4s_ease-out]">
          <p className="mb-3 text-[1.05rem] leading-relaxed text-slate-600">
            This dashboard uses{" "}
            <a href="https://policyengine.org" target="_blank" rel="noreferrer" className="underline">
              PolicyEngine UK
            </a>
            &apos;s microsimulation model to
            estimate the cost, employment effects, and poverty impact of exempting
            employers from NICs on employees who recently transitioned from
            economic inactivity into work. The exemption applies to all
            recently-inactive workers (disabled and non-disabled). The <strong>NICs exemption reform</strong>{" "}
            tab shows the static cost, behavioural labour-supply response, and a
            comparison with disability benefit cuts. The{" "}
            <strong>Inactivity baseline</strong> tab presents the current
            state of economic inactivity, disability, and employer NICs. The{" "}
            <strong>Methodology</strong> tab explains the data sources,
            imputation approach, and caveats.
          </p>
        </div>

        <div className="mb-8 mt-8 flex w-fit flex-wrap border-b-2 border-slate-200" role="tablist" aria-label="Dashboard sections">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Error: {error}
          </p>
        )}
        {loading && !error && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Loading data...
          </p>
        )}

        {!loading && !error && data && (
          <>
            {activeTab === "reform" && <ReformTab data={data} />}
            {activeTab === "baseline" && <BaselineTab data={data} />}
            {activeTab === "methodology" && <MethodologyTab data={data} />}
          </>
        )}

        <footer className="mt-12 border-t border-slate-200 pt-8 text-center text-sm text-slate-500">
          <p>
            Replication code:{" "}
            <a
              href="https://github.com/PolicyEngine/nics-exemption-inactive-employees"
              target="_blank"
              rel="noreferrer"
            >
              PolicyEngine/nics-exemption-inactive-employees
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-12 text-center text-slate-500">Loading...</p>
      }
    >
      <Dashboard />
    </Suspense>
  );
}
