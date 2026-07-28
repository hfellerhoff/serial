import { ArticlesTab } from "./ArticlesTab";
import { DesignTab } from "./DesignTab";
import { VideosTab } from "./VideosTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

export function AppearanceTabs({
  defaultTab = "design",
}: {
  defaultTab?: "design" | "videos" | "articles";
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="w-full">
        <TabsTrigger value="design">Design</TabsTrigger>
        <TabsTrigger value="videos">Videos</TabsTrigger>
        <TabsTrigger value="articles">Articles</TabsTrigger>
      </TabsList>
      <TabsContent value="design">
        <DesignTab />
      </TabsContent>
      <TabsContent value="videos">
        <VideosTab />
      </TabsContent>
      <TabsContent value="articles">
        <ArticlesTab />
      </TabsContent>
    </Tabs>
  );
}
