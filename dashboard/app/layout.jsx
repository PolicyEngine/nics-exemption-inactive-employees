import { PolicyEngineShell } from "@policyengine/ui-kit/layout";
import "@policyengine/ui-kit/styles.css";

import "./globals.css";

export const metadata = {
  title: "NICs exemption for recently-inactive employees | PolicyEngine",
  description:
    "Interactive dashboard estimating the cost and employment effects of exempting employers from NICs on recently-inactive employees using PolicyEngine UK microsimulation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PolicyEngineShell country="uk">{children}</PolicyEngineShell>
      </body>
    </html>
  );
}
