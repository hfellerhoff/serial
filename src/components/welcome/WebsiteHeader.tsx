import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

export function WebsiteHeader({
  Icon,
  title,
  description,
}: {
  Icon: ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >;
  title: string;
  description?: string;
}) {
  return (
    <div className="relative overflow-clip pb-4 md:pb-8">
      <section className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-8 text-center">
        <Icon size={36} />
        <h1 className="mt-4 text-3xl font-bold text-balance md:mt-4 md:text-4xl">
          {title}
        </h1>
        {!!description && (
          <p className="mt-3 mb-6 text-lg text-pretty md:text-xl">
            {description}
          </p>
        )}
      </section>
    </div>
  );
}
