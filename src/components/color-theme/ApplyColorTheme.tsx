import { ApplyColorThemeOnMount } from "./ApplyColorThemeOnMount";
import { getServerApi } from "~/server/api/server";
import { getServerAuth, isServerAuthed } from "~/server/auth";

export async function ApplyColorTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isServerAuthed())) {
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
