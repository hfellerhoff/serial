import { auth } from "@clerk/nextjs/server";
import { ApplyColorThemeOnMount } from "./ApplyColorThemeOnMount";
import { getServerApi } from "~/server/api/server";

export async function ApplyColorTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await auth();

  if (!user) {
    return children;
  }

  const api = await getServerApi();
  const data = await api.userConfig.getConfig();

  return (
    <>
      <ApplyColorThemeOnMount data={data} />
      {children}
    </>
  );
}
