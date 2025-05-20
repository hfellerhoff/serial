import { getServerApi } from "~/server/api/server";
import { isServerAuthed } from "~/server/auth";
import { ApplyColorThemeOnServerMount } from "./ApplyColorThemeOnMount";

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
      <ApplyColorThemeOnServerMount data={data} />
      {children}
    </>
  );
}
