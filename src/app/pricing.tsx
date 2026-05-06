import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CheckIcon,
  CoinsIcon,
  SproutIcon,
  TreeDeciduousIcon,
  TreesIcon,
} from "lucide-react";
import {
  QUOTA_DISPLAY_NAMES,
  STANDARD_PLAN_IDS,
} from "~/components/feed/subscription-dialog/constants";
import { getPlanFeatures } from "~/components/feed/subscription-dialog/utils";
import { Card } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { RecentReleaseBanner } from "~/components/welcome/RecentReleaseBanner";
import { WebFooterCTA } from "~/components/welcome/WebFooterCTA";
import { WebsiteHeader } from "~/components/welcome/WebsiteHeader";
import { WebsiteNavigation } from "~/components/welcome/WebsiteNavigation";
import { BASE_SIGNED_OUT_URL, IS_MAIN_INSTANCE } from "~/lib/constants";
import { getMostRecentRelease } from "~/lib/markdown/loaders";
import { fetchIsAuthed } from "~/server/auth/endpoints";
import { PLANS } from "~/server/subscriptions/plans";

const PLAN_PRICES = {
  "standard-small": { monthly: 4, annual: 40 },
  "standard-medium": { monthly: 6, annual: 60 },
  "standard-large": { monthly: 8, annual: 80 },
  pro: { monthly: 16, annual: 160 },
} as const;

function getMonthlyFromAnnual(annual: number): string {
  const monthly = annual / 12;
  const withCents = monthly.toFixed(2);
  return withCents.endsWith(".00") ? withCents.slice(0, -3) : withCents;
}

export const Route = createFileRoute("/pricing")({
  beforeLoad: () => {
    if (!IS_MAIN_INSTANCE) {
      throw redirect({ to: BASE_SIGNED_OUT_URL });
    }
  },
  component: RouteComponent,
  loader: async () => {
    const isAuthed = await fetchIsAuthed();
    const mostRecentRelease = getMostRecentRelease();
    return { isAuthed, mostRecentRelease };
  },
});

function RouteComponent() {
  const { isAuthed, mostRecentRelease } = Route.useLoaderData();
  const supportEmail = import.meta.env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS;

  return (
    <div className="bg-background">
      <RecentReleaseBanner mostRecentRelease={mostRecentRelease} />
      <WebsiteNavigation isAuthed={isAuthed} />
      <main className="py-4 text-pretty md:py-8">
        <WebsiteHeader
          Icon={CoinsIcon}
          title="Pricing"
          description="This pricing is for the main, hosted instance of Serial. Prices
        are based on the number of active feeds you have."
        />
        <section className="relative mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            <Card className="flex-2 p-6">
              <div className="flex items-center gap-2">
                <SproutIcon size={20} />
                <h3 className="text-xl font-bold">{PLANS.free.name}</h3>
              </div>
              <ul className="space-y-2">
                {getPlanFeatures(PLANS.free).map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckIcon size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="flex-3 p-6">
              <div className="flex items-center gap-2">
                <TreeDeciduousIcon size={20} />
                <h3 className="text-xl font-bold">Standard</h3>
              </div>
              <ul className="space-y-2">
                {getPlanFeatures(PLANS["standard-small"])
                  .filter((f) => !f.startsWith("Up to"))
                  .map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckIcon size={16} />
                      {feature}
                    </li>
                  ))}
              </ul>
              <div className="space-y-4">
                {STANDARD_PLAN_IDS.map((id) => {
                  const plan = PLANS[id];

                  return (
                    <div key={id} className="rounded border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {QUOTA_DISPLAY_NAMES[id]}
                        </span>
                        <span className="text-md font-bold">
                          ${PLAN_PRICES[id].monthly}/mo ·{" "}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default underline decoration-dotted underline-offset-4">
                                ${PLAN_PRICES[id].annual}/yr
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              ${getMonthlyFromAnnual(PLAN_PRICES[id].annual)}/mo
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </div>
                      <p className="text-muted-foreground text-sm">
                        Up to {plan.maxActiveFeeds.toLocaleString()} active
                        feeds
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="flex-2 p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TreesIcon size={20} />
                  <h3 className="text-xl font-bold">{PLANS.pro.name}</h3>
                </div>
                <div className="text-md font-bold lg:text-lg">
                  ${PLAN_PRICES.pro.monthly}/mo ·{" "}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default underline decoration-dotted underline-offset-4">
                        ${PLAN_PRICES.pro.annual}/yr
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      ${getMonthlyFromAnnual(PLAN_PRICES.pro.annual)}/mo
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <ul className="space-y-2">
                {getPlanFeatures(PLANS.pro).map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckIcon size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section className="mx-auto max-w-xl space-y-6 px-6 py-12 text-xl text-pretty md:py-24">
          <p>
            If the cost of Serial is too much for you, anyone can run an
            instance of Serial for themselves. You won&apos;t need to pay us
            anything, but you will need to have a dedicated computer to run it
            on, which can be as cheap as $5-6 a month.
          </p>
          <p>
            This can be a great option for users who are very privacy-conscious,
            or for those looking to provide Serial as a service for their
            friends or family.
          </p>
          <p>
            <a
              className="underline"
              href="https://github.com/megaflorasoftware/serial?tab=readme-ov-file#self-hosting"
            >
              Here is the step-by-step guide
            </a>{" "}
            on how to host your own Serial instance.
          </p>
          <p className="italic">
            If Serial is cost-prohibitive and self-hosting is not feasible for
            you, don&apos;t hesitate to{" "}
            <a href={`mailto:${supportEmail}`} className="underline">
              get in touch
            </a>{" "}
            – we&apos;d be happy to work something out.
          </p>
        </section>
        <WebFooterCTA />
      </main>
    </div>
  );
}
