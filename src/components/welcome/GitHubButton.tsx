import { GithubIcon } from "~/components/brand-icons";
import { Button } from "~/components/ui/button";

export function GitHubButton() {
  return (
    <div className="mt-4 mb-8 flex gap-2 md:mb-12">
      <a
        href="https://github.com/hfellerhoff/serial"
        className="hover:bg-transparent"
      >
        <Button variant="outline" size="default">
          <GithubIcon size={16} />
          <span className="pl-1">GitHub</span>
        </Button>
      </a>
    </div>
  );
}
