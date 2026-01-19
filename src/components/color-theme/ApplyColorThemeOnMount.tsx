import type { UserConfigValues } from "~/server/api/routers/userConfigRouter";

export function ApplyColorThemeOnServerMount({
  data,
}: {
  data: UserConfigValues | null;
}) {
  if (!data) return null;

  const variables = [];

  if (data.lightHSL) {
    const [hue, sat, lgt] = data.lightHSL;
    variables.push(["--light-hue", `${hue}`]);
    variables.push(["--light-sat", `${sat}%`]);
    variables.push(["--light-lgt", `${lgt}%`]);
  }

  if (data.darkHSL) {
    const [hue, sat, lgt] = data.darkHSL;
    variables.push(["--dark-hue", `${hue}`]);
    variables.push(["--dark-sat", `${sat}%`]);
    variables.push(["--dark-lgt", `${lgt}%`]);
  }

  const css = `
    :root {
      ${variables.map(([name, value]) => `${name}: ${value};`).join("\n\t")}
    }`;

  return <style>{css}</style>;
}
