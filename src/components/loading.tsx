import { Loader2Icon } from "lucide-react";
import { ClientDatetime } from "~/components/feed/ClientDatetime";

export default function FeedLoading() {
  return (
    <div className="bg-background fixed inset-0 flex h-screen w-screen flex-col items-center justify-center">
      <Loader2Icon size={32} className="animate-spin" />
      <h1 className="pt-4 font-mono text-2xl font-bold">Serial</h1>
      <p className="pb-2 font-mono">
        <ClientDatetime />
      </p>
    </div>
  );
}
