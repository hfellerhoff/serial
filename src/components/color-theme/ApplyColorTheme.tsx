import { ApplyColorThemeOnMount } from "./ApplyColorThemeOnMount";
import { getServerApi } from "~/server/api/root";

export async function ApplyColorTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  const api = await getServerApi();
  const data = await api.userConfig.getConfig();

  return (
    <>
      <ApplyColorThemeOnMount data={data} />
      {children}
    </>
  );
}
